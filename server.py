#!/usr/bin/env python3
"""
Organizer — local file server.

Serves this folder to this machine only (127.0.0.1) and adds a very small
API so the app can keep everything on disk instead of hidden inside the
browser:

    GET    /api/ping                          is the disk backend available?
    GET    /api/state                         read data.json
    PUT    /api/state                         write data.json
    POST   /api/files?name=…&space=…&project=…  save an imported file
    POST   /api/files/relocate?path=…&…       move a file to another folder
    DELETE /api/files?path=…                  remove a saved file
    GET    /api/sync?fetch=1                  where this folder stands with GitHub
    POST   /api/sync/get                      bring in what the other computer sent
    POST   /api/sync/send                     commit and push what changed here

Only this server's own pages may use any of it — see Handler.allowed().

Imported files are copied into a folder per work area, then per project:

    FILES/Work/Nightdrive/storyboard_v3.png
    FILES/Work/Nightdrive/client_brief.pdf
    FILES/Work/Bank ad/ref_footage.mp4
    FILES/Personal/Learn Houdini/pyro_notes.pdf

The original file is never touched or moved — this only ever makes a copy.
Rename a project, or move it to the other space, and its folder follows.

Nothing listens on the network. Nothing is uploaded anywhere.
"""

import json
import os
import re
import shutil
import socket
import sys
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

import sync

ROOT       = os.path.dirname(os.path.abspath(__file__))
FILES_DIR  = os.path.join(ROOT, "FILES")
DATA_FILE  = os.path.join(ROOT, "data.json")
CHUNK      = 1024 * 1024          # stream uploads a megabyte at a time
MAX_UPLOAD = 4 * 1024 ** 3        # 4 GB ceiling, mostly to catch mistakes

# Mirrors the two spaces in js/core/spaces.js. Only used to lay the folders
# out at startup so both are visible in Finder from the very first run.
SPACES = ("Work", "Personal")

# This machine's name, stamped into data.json on every write so the app can
# say WHICH device last touched it when two of them disagree.
DEVICE = socket.gethostname().split(".")[0] or "this computer"

# Windows refuses these as filenames whatever the extension. Harmless on a
# Mac, but the folder may well be sitting in a synced folder shared with a PC.
RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)} \
                                        | {f"lpt{i}" for i in range(1, 10)}


def de_reserve(name: str) -> str:
    stem = name.split(".")[0].strip().lower()
    return f"_{name}" if stem in RESERVED else name

# Characters that either break URLs or aren't allowed in filenames.
ILLEGAL = re.compile(r'[<>:"|?*#%\x00-\x1f\x7f]')


# ============================================================
#  PATH SAFETY
# ============================================================
def safe_name(raw: str) -> str:
    """Reduce anything the browser sends to a plain, harmless filename."""
    name = unquote(raw or "")
    name = name.replace("\\", "/").split("/")[-1]     # drop any directory part
    name = ILLEGAL.sub("_", name)
    name = name.strip().strip(".")                    # no leading/trailing dots
    return de_reserve(name[:120]) or "file"


def safe_folder(raw: str) -> str:
    """Turn a project name into one safe folder name."""
    name = unquote(raw or "")
    name = name.replace("\\", "/").replace("/", " ")  # never nest
    name = ILLEGAL.sub("_", name)
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    return de_reserve(name[:80]) or "Untitled"


def inside_files(path: str) -> bool:
    """True only if `path` really resolves to somewhere under FILES/."""
    try:
        target = os.path.realpath(path)
        base = os.path.realpath(FILES_DIR)
        return target == base or target.startswith(base + os.sep)
    except OSError:
        return False


def unique_path(folder: str, filename: str) -> str:
    """Never overwrite: frame.png -> frame (2).png -> frame (3).png …"""
    stem, ext = os.path.splitext(filename)
    candidate = os.path.join(folder, filename)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(folder, f"{stem} ({n}){ext}")
        n += 1
    return candidate


def project_dir(space: str, project: str) -> str:
    folder = os.path.join(FILES_DIR, safe_folder(space or SPACES[0]), safe_folder(project))
    os.makedirs(folder, exist_ok=True)
    return folder


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def read_state() -> dict:
    """Whatever data.json holds this second. {} if it isn't there or is junk."""
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as fh:
            got = json.load(fh)
            return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


def disk_is_junk() -> bool:
    """data.json is there but isn't JSON — usually a merge left half-done.

    Not the same as the file being absent. Absent means a first run, and a
    first run writes a fresh file. Writing a fresh file over a damaged one
    would destroy the only copy that could still be put right.
    """
    if not os.path.exists(DATA_FILE):
        return False
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as fh:
            json.load(fh)
        return False
    except (OSError, ValueError):
        return True


def prune_empty(folder: str):
    """Tidy away a project folder once its last file is gone.

    The space folders themselves stay put so FILES/ always shows both work
    areas. That also spares any folder left over from before the split —
    it sits at the same depth — which is a fair trade for one stray folder.
    """
    if not inside_files(folder):
        return
    base = os.path.realpath(FILES_DIR)
    real = os.path.realpath(folder)
    if real == base or os.path.dirname(real) == base:
        return
    try:
        os.rmdir(folder)              # only succeeds when already empty
    except OSError:
        pass


# ============================================================
#  REQUEST HANDLER
# ============================================================
class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------- helpers ----------
    def send_json(self, payload, code=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # Always serve fresh copies; a stale cached script is pure confusion.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def param(self, key, default=""):
        return parse_qs(urlparse(self.path).query).get(key, [default])[0]

    def body_length(self):
        try:
            return int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return 0

    def log_message(self, fmt, *args):
        pass  # keep the Terminal window readable

    # ---------- who may ask ----------
    def allowed(self) -> bool:
        """Only this app's own pages, calling this server by its own name.

        Listening on 127.0.0.1 keeps other MACHINES out, but not other web
        pages: any site open in the browser can send requests to a port on
        this computer. Two checks close that.

          Host    must be this server's own address. A hostile site can
                  point a domain of its own at 127.0.0.1 and then read
                  everything here as if it were its own page — data.json
                  included. What it can't do is make the browser send
                  THIS server's name as the Host.

          Origin  on anything that changes something, must be this server.
                  A page elsewhere can fire a request here blind, but the
                  browser labels it with where it came from. That mattered
                  before — files could be moved about — and matters more
                  now that one request can commit and push to GitHub.
        """
        port = self.server.server_address[1]
        mine = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if (self.headers.get("Host") or "").lower() not in mine:
            return False
        if self.command in ("GET", "HEAD"):
            return True
        origin = (self.headers.get("Origin") or "").lower()
        if origin and origin not in {f"http://{h}" for h in mine}:
            return False
        return (self.headers.get("Sec-Fetch-Site") or "").lower() != "cross-site"

    def refuse(self):
        return self.send_json({"error": "refused: this server only answers its own pages"}, 403)

    def do_HEAD(self):
        if not self.allowed():
            self.send_response(403)
            self.end_headers()
            return
        return super().do_HEAD()

    # ---------- GET ----------
    def do_GET(self):
        if not self.allowed():
            return self.refuse()
        route = urlparse(self.path).path

        if route == "/api/ping":
            return self.send_json({"ok": True, "root": ROOT, "device": DEVICE})

        if route == "/api/state":
            if not os.path.exists(DATA_FILE):
                return self.send_json({})
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as fh:
                    return self.send_json(json.load(fh))
            except (OSError, ValueError) as err:
                return self.send_json({"error": f"data.json unreadable: {err}"}, 500)

        if route == "/api/whoami":
            return self.send_json({"device": DEVICE})

        if route == "/api/sync":
            return self.send_json(sync.status(fetch=self.param("fetch") == "1"))

        return super().do_GET()

    # ---------- PUT ----------
    def do_PUT(self):
        if not self.allowed():
            return self.refuse()
        if urlparse(self.path).path != "/api/state":
            return self.send_json({"error": "unknown endpoint"}, 404)

        # A damaged data.json is the one thing never to write over — see
        # disk_is_junk(). 423 rather than 409: nobody saved first, the file
        # is broken, and the app says so differently.
        if disk_is_junk():
            return self.send_json({"error": "unreadable"}, 423)

        length = self.body_length()
        if length <= 0 or length > 64 * 1024 * 1024:
            return self.send_json({"error": "bad payload size"}, 400)

        raw = self.rfile.read(length)
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as err:
            return self.send_json({"error": f"invalid JSON: {err}"}, 400)

        # ---- don't overwrite another machine's work ----
        # Every save stamps data.json with a revision number. The browser
        # sends back the revision it loaded; if the file on disk has moved
        # on since then, a synced folder has brought in changes from another
        # device and writing now would erase them silently. Refuse instead
        # and let the app say so.
        disk = read_state()
        disk_rev = int(disk.get("rev") or 0)
        try:
            client_rev = int(self.param("rev", "0") or 0)
        except ValueError:
            client_rev = 0

        if disk_rev and client_rev != disk_rev:
            return self.send_json({
                "error": "stale",
                "rev": disk_rev,
                "savedBy": disk.get("savedBy") or "another device",
                "savedAt": disk.get("savedAt") or 0,
            }, 409)

        parsed["rev"] = disk_rev + 1
        parsed["savedBy"] = DEVICE
        parsed["savedAt"] = int(time.time() * 1000)

        # Write to a temp file first, then swap it in. A crash mid-write
        # can then never leave a half-written data.json behind.
        tmp = DATA_FILE + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(parsed, fh, indent=2, ensure_ascii=False)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, DATA_FILE)
        except OSError as err:
            return self.send_json({"error": f"could not write: {err}"}, 500)

        return self.send_json({"ok": True, "rev": parsed["rev"], "device": DEVICE})

    # ---------- POST ----------
    def do_POST(self):
        if not self.allowed():
            return self.refuse()
        route = urlparse(self.path).path
        if route == "/api/files":
            return self.save_upload()
        if route == "/api/files/relocate":
            return self.relocate()
        if route == "/api/sync/get":
            return self.send_json(sync.get())
        if route == "/api/sync/send":
            return self.send_json(sync.send(DEVICE))
        return self.send_json({"error": "unknown endpoint"}, 404)

    def save_upload(self):
        length = self.body_length()
        if length <= 0:
            return self.send_json({"error": "empty upload"}, 400)
        if length > MAX_UPLOAD:
            return self.send_json({"error": "file too large"}, 413)

        folder = project_dir(self.param("space"), self.param("project"))
        target = unique_path(folder, safe_name(self.param("name")))

        try:
            remaining = length
            with open(target, "wb") as out:
                while remaining > 0:
                    block = self.rfile.read(min(CHUNK, remaining))
                    if not block:
                        break
                    out.write(block)
                    remaining -= len(block)
        except OSError as err:
            if os.path.exists(target):
                os.remove(target)
            return self.send_json({"error": f"could not save: {err}"}, 500)

        if remaining > 0:                       # connection died part-way
            os.remove(target)
            return self.send_json({"error": "upload truncated"}, 400)

        return self.send_json({
            "ok": True,
            "path": rel(target),
            "name": os.path.basename(target),
            "size": os.path.getsize(target),
        })

    def relocate(self):
        """Move one file into the folder for `space`/`project`. Used when a
        project is renamed or handed to the other space, so the layout on
        disk keeps matching what the app shows."""
        source_rel = self.param("path")
        if not source_rel:
            return self.send_json({"error": "no path given"}, 400)

        source = os.path.join(ROOT, source_rel.replace("/", os.sep))
        if not inside_files(source) or not os.path.isfile(source):
            return self.send_json({"error": "refused: not a file under FILES/"}, 403)

        folder = project_dir(self.param("space"), self.param("project"))
        if os.path.realpath(os.path.dirname(source)) == os.path.realpath(folder):
            return self.send_json({"ok": True, "path": source_rel})   # already right

        target = unique_path(folder, os.path.basename(source))
        try:
            shutil.move(source, target)
            prune_empty(os.path.dirname(source))
        except OSError as err:
            return self.send_json({"error": f"could not move: {err}"}, 500)

        return self.send_json({"ok": True, "path": rel(target)})

    # ---------- DELETE ----------
    def do_DELETE(self):
        if not self.allowed():
            return self.refuse()
        if urlparse(self.path).path != "/api/files":
            return self.send_json({"error": "unknown endpoint"}, 404)

        target_rel = self.param("path")
        if not target_rel:
            return self.send_json({"error": "no path given"}, 400)

        target = os.path.join(ROOT, target_rel.replace("/", os.sep))
        if not inside_files(target):
            return self.send_json({"error": "refused: outside FILES/"}, 403)

        try:
            if os.path.isfile(target):
                os.remove(target)
                prune_empty(os.path.dirname(target))
        except OSError as err:
            return self.send_json({"error": f"could not delete: {err}"}, 500)

        return self.send_json({"ok": True})


# ============================================================
#  ENTRY POINT
# ============================================================
def build(port: int) -> ThreadingHTTPServer:
    """The server, listening and ready to serve.

    Split out of main() so launch.py can run it on a thread and own its
    lifetime itself — there it stops when the window is quit, rather than
    when a Terminal window is closed.
    """
    for space in SPACES:
        os.makedirs(os.path.join(FILES_DIR, space), exist_ok=True)
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    # Anything starting with a dash is a flag, not the port — otherwise
    # `server.py --no-browser` reads one as the other and won't start.
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    port = int(args[0]) if args else 8777

    server = build(port)
    free = shutil.disk_usage(ROOT).free / 1024 ** 3

    # The socket is listening the moment the server is constructed, so the
    # browser can be sent here right away — no sleeping in the launcher, and
    # it works the same on macOS and Windows.
    if "--no-browser" not in sys.argv:
        webbrowser.open(f"http://localhost:{port}/")

    print()
    print(f"  Organizer is running at  http://localhost:{port}/")
    print(f"  This device is           {DEVICE}")
    print(f"  Everything saves into    {ROOT}")
    print(f"  Imported files land in   FILES/Work/<project>/")
    print(f"                           FILES/Personal/<project>/")
    print(f"  Disk space free          {free:.0f} GB")
    print()
    print("  Keep this window open while you work.")
    print("  Close it (or press Control-C) to quit.")
    print(flush=True)          # don't let buffering swallow the welcome text

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Organizer stopped. Your data is saved.\n")


if __name__ == "__main__":
    main()
