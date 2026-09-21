"""
Organizer — the GitHub buttons.

The Mac and the PC pass this folder between them through a GitHub
repository. This file is the only part of Organizer that talks to it, and
it does exactly two things, each only when asked:

    Get    bring in what the other computer sent
    Send   commit what changed here, and push it

Everything leans on the rule the README already keeps: one computer at a
time. Get before you start, Send before you stop.

WHAT IT WILL NOT DO

    Get only ever fast-forwards. If both computers changed the same file,
    git would stitch the two versions of data.json together line by line
    and could leave something that isn't valid JSON at all. So instead of
    guessing, this refuses and names the files that are in the way.

    Nothing waits on a password prompt. Organizer usually runs with no
    Terminal attached, so a prompt would hang the server with nobody there
    to answer it. git is told never to ask, and a missing login comes back
    as a message saying how to sign in once.

    Files too big for GitHub — it refuses anything of 100 MB or more — are
    left out of a Send and named. Committing one would put it into a
    history that could then never be pushed, and every Send after it
    would fail for a reason that had nothing to do with that Send.

    Nothing is sent to a PUBLIC repository. This folder holds client work,
    and the repository sat public for a week before anyone noticed. Send
    asks GitHub, anonymously, whether a stranger can see it, and refuses
    if so. Making it private is the fix, and the only one.
"""

import glob
import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))

# GitHub rejects any file of 100 MB or more. Stay a little clear of it.
TOO_BIG = 95 * 1024 * 1024

# Long enough for a slow connection, or a first sign-in window on Windows.
NETWORK_SECONDS = 90
LOCAL_SECONDS = 20

# When a Get brings in changes to these, the page can reload but the
# server running it is still the old one — it has to be restarted.
SERVER_FILES = ("server.py", "launch.py", "sync.py")
SERVER_DIRS = ("desktop/",)

# One git operation at a time. git guards itself with a lock file and
# fails outright if two run at once — say, the check that runs when the
# window comes back into focus, landing on top of a Send.
_lock = threading.Lock()


# ============================================================
#  RUNNING GIT
# ============================================================
def find_git():
    """The git to use, or None."""
    found = shutil.which("git")
    if found:
        return found
    # GitHub Desktop carries its own git, so a machine with only Desktop
    # installed still has one — just not on the PATH.
    places = [
        "/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git",
        os.path.expanduser("~/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git"),
    ]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        pattern = os.path.join(local, "GitHubDesktop", "app-*", "resources",
                               "app", "git", "cmd", "git.exe")
        places += sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)
    return next((p for p in places if os.path.exists(p)), None)


def _git(*args, timeout=LOCAL_SECONDS):
    """(exit code, stdout, stderr). Never prompts, never hangs past `timeout`."""
    git = find_git()
    if not git:
        return 127, "", "git not found"

    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"            # never stop and ask for a password
    env.setdefault("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
    env.pop("GIT_ASKPASS", None)
    env.pop("SSH_ASKPASS", None)

    extra = {}
    if os.name == "nt":
        # Organizer runs windowless on the PC; without this every git call
        # would flash a black console window across the screen.
        extra["creationflags"] = subprocess.CREATE_NO_WINDOW

    try:
        done = subprocess.run(
            [git, "-C", ROOT, "-c", "core.quotepath=off", *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env=env, timeout=timeout, **extra)
        return done.returncode, done.stdout, done.stderr
    except subprocess.TimeoutExpired:
        return 124, "", "timed out"
    except OSError as err:
        return 127, "", str(err)


def _last_line(text: str) -> str:
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    line = lines[-1] if lines else ""
    # A remote URL can carry a login inside it. Never hand one to the page.
    return re.sub(r"://[^/@\s]+@", "://", line)[:200]


def _why(err: str) -> str:
    """Sort a failed network call into something the page can explain."""
    e = (err or "").lower()
    if any(s in e for s in ("could not read username", "terminal prompts disabled",
                            "authentication failed", "invalid username or password",
                            "permission denied", "the requested url returned error: 403",
                            "repository not found")):
        # A private repository answers "not found" to anyone not signed in,
        # rather than admitting it exists. So this is almost always a login.
        return "login"
    if any(s in e for s in ("could not resolve host", "failed to connect",
                            "network is unreachable", "timed out", "no route to host",
                            "connection refused", "connection reset")):
        return "offline"
    return "other"


# ============================================================
#  WHICH REPOSITORY, AND WHO CAN SEE IT
# ============================================================
API = "https://api.github.com"


def _remote() -> str:
    """The remote this branch sends to — 'origin', almost always."""
    code, up, _ = _git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    return up.strip().split("/", 1)[0] if code == 0 and up.strip() else "origin"


def repo():
    """(host, owner, name) of the GitHub repository behind this folder, or None."""
    code, url, _ = _git("remote", "get-url", _remote())
    if code != 0:
        return None
    m = re.match(r"^(?:https://(?:[^@/]+@)?|ssh://git@|git@)(github\.com)[/:]"
                 r"([A-Za-z0-9-]+)/([A-Za-z0-9._-]+?)(?:\.git)?/?$", url.strip())
    return m.groups() if m else None


def _api(path: str, token: str = None):
    """(status, body) from GitHub's API; (0, {}) when it couldn't be reached."""
    headers = {"User-Agent": "Organizer", "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urllib.request.urlopen(urllib.request.Request(API + path, headers=headers),
                                    timeout=15) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as err:
        return err.code, {}
    except (urllib.error.URLError, OSError, ValueError):
        return 0, {}


_seen = {"at": 0.0, "public": None}


def is_public(fresh: bool = False):
    """True if anyone at all can read the repository. None if it couldn't tell.

    Asked anonymously — no login goes with it — because the question is
    exactly what a stranger sees. A private repository answers them 404,
    as though it didn't exist.

    A "private" answer is trusted for ten minutes, a "public" one for one,
    so the app notices soon after the switch is made. GitHub allows sixty
    of these questions an hour; this asks a handful.
    """
    if not fresh:
        hold = 600 if _seen["public"] is False else 60
        if time.time() - _seen["at"] < hold:
            return _seen["public"]
    found = repo()
    if not found:
        return None
    code, body = _api(f"/repos/{found[1]}/{found[2]}")
    public = (not body.get("private", True)) if code == 200 else (False if code == 404 else None)
    _seen.update(at=time.time(), public=public)
    return public


# ============================================================
#  SIGNING IN
# ============================================================
# What a GitHub token looks like: ghp_…, github_pat_…, gho_…. Checking the
# shape also means nothing with a line break in it can reach git's
# credential store, where a line break would start a field of its own.
TOKEN_SHAPE = re.compile(r"[A-Za-z0-9_]{20,255}")


def _helpers() -> list:
    return [h for h in _git("config", "--get-all", "credential.helper")[1].splitlines() if h.strip()]


def _credential(action: str, host: str, user: str, secret: str) -> int:
    """Give a login to git's own store — the Keychain on a Mac, Windows'
    Credential Manager on a PC — or take one back out.

    Through stdin, never the command line: anything running on the machine
    can read another program's command line.
    """
    git = find_git()
    if not git:
        return 127
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    extra = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    feed = f"protocol=https\nhost={host}\nusername={user}\npassword={secret}\n\n"
    try:
        return subprocess.run([git, "-C", ROOT, "credential", action], input=feed, text=True,
                              capture_output=True, env=env, timeout=LOCAL_SECONDS, **extra).returncode
    except (subprocess.TimeoutExpired, OSError):
        return 1


def login(token: str) -> dict:
    """Store a token for git, but only once it's proven it can send here.

    The token is never written anywhere but git's credential store, never
    logged, and never sent back to the page.
    """
    token = (token or "").strip()
    if not TOKEN_SHAPE.fullmatch(token):
        return {"ok": False, "why": "shape"}
    found = repo()
    if not found:
        return {"ok": False, "why": "not-github"}
    host = found[0]

    # Ask GitHub who this is. A made-up or mistyped token fails here,
    # before anything has been stored.
    code, me = _api("/user", token)
    if code == 0:
        return {"ok": False, "why": "offline"}
    user = me.get("login", "") if code == 200 else ""
    if not re.fullmatch(r"[A-Za-z0-9-]{1,39}", user):
        return {"ok": False, "why": "rejected"}

    with _lock:
        if not _helpers():
            # Nowhere to keep it: git on this machine has no credential store.
            return {"ok": False, "why": "no-store", "user": user}
        if _credential("approve", host, user, token) != 0:
            return {"ok": False, "why": "no-store", "user": user}

        # Prove it can WRITE to this repository. A dry run asks GitHub for
        # push access and sends nothing. "Rejected" here only means the
        # other computer sent something first — the login itself worked.
        code, _, err = _git("push", "--dry-run", "--quiet", timeout=NETWORK_SECONDS)
        worked = code == 0 or any(s in err for s in ("rejected", "fetch first", "non-fast-forward"))
        if not worked:
            _credential("reject", host, user, token)     # don't keep one that can't do the job
            kind = _why(err)
            return {"ok": False, "why": "no-write" if kind == "login" else kind,
                    "detail": _last_line(err), "user": user}
    return {"ok": True, "user": user}


# ============================================================
#  WHAT'S CHANGED
# ============================================================
def _entries():
    """[(status, path)] for every change git can see, ignored files aside.

    -z so a path comes back exactly as it is on disk. Without it git quotes
    anything unusual, and a project called  Videoclip — “Nightdrive”  turns
    into a string of octal escapes that matches no file at all.
    """
    code, out, _ = _git("status", "--porcelain=v1", "-z", "--untracked-files=all")
    if code != 0:
        return []
    parts, found, i = out.split("\0"), [], 0
    while i < len(parts):
        item = parts[i]
        i += 1
        if len(item) < 4:
            continue
        xy, path = item[:2], item[3:]
        if xy[0] in "RC":          # a rename also lists where it came from
            i += 1
        found.append((xy, path))
    return found


def _data_ok() -> bool:
    """Is data.json something the app can read? (No file at all is fine.)

    Checked before every Send. A merge that stopped half-way leaves conflict
    markers in it, and to git that's just another changed file, ready to
    commit. Sending it would hand the damage to the other computer too.
    """
    path = os.path.join(ROOT, "data.json")
    if not os.path.exists(path):
        return True
    try:
        with open(path, "r", encoding="utf-8") as fh:
            json.load(fh)
        return True
    except (OSError, ValueError):
        return False


def _size(path: str) -> int:
    try:
        return os.path.getsize(os.path.join(ROOT, path))
    except OSError:
        return 0                   # deleted: sending a deletion costs nothing


# ============================================================
#  STATUS
# ============================================================
def status(fetch=False, fresh=False):
    with _lock:
        return _status(fetch, fresh)


def _status(fetch: bool, fresh: bool = False) -> dict:
    out = {"git": False}

    if not find_git():
        out["reason"] = "no-git"
        return out

    code, top, _ = _git("rev-parse", "--show-toplevel")
    same = code == 0 and (os.path.normcase(os.path.realpath(top.strip()))
                          == os.path.normcase(os.path.realpath(ROOT)))
    if not same:
        out["reason"] = "not-a-repo"
        return out

    code, upstream, _ = _git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    if code != 0:
        out["reason"] = "no-upstream"
        return out
    upstream = upstream.strip()                    # e.g. origin/main
    out.update(git=True, upstream=upstream)

    if fetch:
        code, _, err = _git("fetch", "--quiet", upstream.split("/", 1)[0],
                            timeout=NETWORK_SECONDS)
        if code == 0:
            out["checkedAt"] = int(time.time() * 1000)
        else:
            out["error"] = _why(err)
            out["detail"] = _last_line(err)

    code, counts, _ = _git("rev-list", "--left-right", "--count", "HEAD...@{u}")
    ahead, behind = (int(n) for n in counts.split()) if code == 0 else (0, 0)
    out["ahead"], out["behind"] = ahead, behind

    entries = _entries()
    changed = [p for _, p in entries]
    out["tooBig"] = [p for p in changed if _size(p) >= TOO_BIG]
    out["changed"] = [p for p in changed if p not in out["tooBig"]]

    # What the other computer sent since the two last agreed, and whether
    # any of it lands on a file that's also been changed here — the one
    # thing a fast-forward can't get past.
    incoming = []
    if behind:
        code, names, _ = _git("diff", "--name-only", "-z", "HEAD...@{u}")
        incoming = [n for n in names.split("\0") if n]
    edited_here = {p for xy, p in entries if xy != "??"}
    out["incoming"] = incoming
    out["clash"] = sorted(edited_here & set(incoming))

    found = repo()
    out["repo"] = f"{found[1]}/{found[2]}" if found else None
    # Whether strangers can read it: asked over the network only alongside
    # a fetch, otherwise whatever the last answer was.
    out["public"] = is_public(fresh) if fetch else _seen["public"]

    out["broken"] = not _data_ok()
    out["canGet"] = bool(behind) and not ahead and not out["clash"]
    out["canSend"] = (bool(out["changed"] or ahead) and not behind
                      and not out["broken"] and not out["public"])

    code, head, _ = _git("log", "-1", "--format=%s%x00%ct", "@{u}")
    if code == 0 and "\0" in head:
        subject, when = head.strip().split("\0", 1)
        out["remote"] = {"subject": subject, "when": int(when or 0) * 1000}
    return out


# ============================================================
#  GET
# ============================================================
def get() -> dict:
    with _lock:
        st = _status(fetch=True)
        if not st.get("git") or st.get("error"):
            return {**st, "ok": False}
        if not st["behind"]:
            return {**st, "ok": True, "got": []}
        if st["ahead"]:
            return {**st, "ok": False, "why": "diverged"}
        if st["clash"]:
            return {**st, "ok": False, "why": "clash"}

        _, before, _ = _git("rev-parse", "HEAD")
        # --ff-only: move forward to what GitHub has, or do nothing at all.
        # Never a merge commit, never a file overwritten that was changed here.
        code, _, err = _git("merge", "--ff-only", "--quiet", "@{u}")
        if code != 0:
            return {**st, "ok": False, "why": "refused", "detail": _last_line(err)}

        _, names, _ = _git("diff", "--name-only", "-z", before.strip(), "HEAD")
        got = [n for n in names.split("\0") if n]
        restart = any(n in SERVER_FILES or n.startswith(SERVER_DIRS) for n in got)
        return {**_status(fetch=False), "ok": True, "got": got, "restart": restart}


# ============================================================
#  SEND
# ============================================================
def _message(device: str, files: list) -> str:
    stamp = time.strftime("%a %d %b %Y, %H:%M")
    head = f"Sent from {device} · {stamp}"
    shown = files[:25]
    body = "\n".join(f"  {f}" for f in shown)
    more = f"\n  …and {len(files) - len(shown)} more" if len(files) > len(shown) else ""
    return f"{head}\n\n{len(files)} file{'s' if len(files) != 1 else ''}:\n{body}{more}"


def _identity(device: str) -> list:
    """Commit as whoever git is set up as, or as this machine if nobody is.

    A PC with GitHub Desktop but no git of its own may have no name set at
    all, and git refuses to commit without one.
    """
    extra = []
    if not _git("config", "user.name")[1].strip():
        extra += ["-c", f"user.name=Organizer on {device}"]
    if not _git("config", "user.email")[1].strip():
        extra += ["-c", "user.email=organizer@localhost"]
    return extra


def send(device: str) -> dict:
    with _lock:
        st = _status(fetch=True)
        if not st.get("git") or st.get("error"):
            return {**st, "ok": False}
        # Asked fresh, whatever the cache says: this is the last moment to
        # stop client work going somewhere anyone can read it.
        if is_public(fresh=True):
            return {**st, "public": True, "canSend": False, "ok": False, "why": "public"}
        if st["broken"]:
            return {**st, "ok": False, "why": "broken"}
        if st["behind"]:
            # Sending now would mean merging on top of what's arrived. Get
            # first; if the two collide, that's where it'll say so.
            return {**st, "ok": False, "why": "diverged" if (st["ahead"] or st["clash"]) else "behind"}
        if not st["changed"] and not st["ahead"]:
            return {**st, "ok": True, "sent": [], "nothing": True}

        files = list(st["changed"])
        if files:
            code, _, err = _git("add", "-A")
            if code == 0 and st["tooBig"]:
                # Unstage them again: they stay here, untouched, just unsent.
                code, _, err = _git("reset", "-q", "--",
                                    *[":(literal)" + p for p in st["tooBig"]])
            if code == 0:
                code, _, err = _git(*_identity(device), "commit", "-q",
                                    "-m", _message(device, files))
            if code != 0:
                return {**_status(fetch=False), "ok": False, "why": "commit",
                        "detail": _last_line(err)}

        # Pushing: if this fails, the commit stays here and the next Send
        # pushes it. Nothing is lost by trying.
        code, _, err = _git("push", "--quiet", timeout=NETWORK_SECONDS)
        after = _status(fetch=False)
        if code != 0:
            kind = _why(err)
            if "rejected" in err or "non-fast-forward" in err or "fetch first" in err:
                kind = "behind"            # the other computer sent something just now
            return {**after, "ok": False, "error": kind, "detail": _last_line(err),
                    "committed": bool(files)}

        _, short, _ = _git("rev-parse", "--short", "HEAD")
        return {**after, "ok": True, "sent": files, "commit": short.strip()}
