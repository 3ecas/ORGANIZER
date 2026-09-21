"""
Organizer — opening a window for it.

Three ways, best first, so the same double-click does the right thing on
whatever machine it lands on:

    1. Firefox, with the app profile from firefox.py — a bare window
       with no tabs and no address bar.
    2. A Chromium browser in --app mode — the same idea, built in.
       Edge ships with every Windows, so a PC always has this even
       with no Firefox.
    3. Failing both, an ordinary browser tab, which always works.

It must be a real browser either way. The app asks for native confirm()
dialogs in seven places before it deletes anything, opens two file
pickers, and saves backups through download links. A hand-built window
would have to reimplement all three, and each is somewhere a silent
gap could open up later.

Opera is deliberately not in the Chromium list. It is Chromium
underneath, but it ignores --app: launched that way it opened no window
and never even requested the page.
"""

import os
import shutil
import subprocess
import sys
import webbrowser

from . import firefox


# ============================================================
#  FINDING A BROWSER
# ============================================================
def _first(paths):
    for path in paths:
        if path and os.path.exists(path):
            return path
    return None


def _program_files():
    return [os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")]


def find_firefox():
    if sys.platform == "darwin":
        return _first([
            "/Applications/Firefox.app/Contents/MacOS/firefox",
            os.path.expanduser("~/Applications/Firefox.app/Contents/MacOS/firefox"),
        ]) or shutil.which("firefox")
    if os.name == "nt":
        return _first([os.path.join(p, "Mozilla Firefox", "firefox.exe")
                       for p in _program_files()]) or shutil.which("firefox")
    return shutil.which("firefox")


# Name shown to the user, then where to look for it.
CHROMIUM = [
    ("Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
     [r"Microsoft\Edge\Application\msedge.exe"], "microsoft-edge"),
    ("Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
     [r"Google\Chrome\Application\chrome.exe"], "google-chrome"),
    ("Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
     [r"BraveSoftware\Brave-Browser\Application\brave.exe"], "brave-browser"),
    ("Vivaldi", "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
     [r"Vivaldi\Application\vivaldi.exe"], "vivaldi"),
    ("Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium",
     [r"Chromium\Application\chrome.exe"], "chromium"),
]


def find_chromium():
    """(name, path) of the first Chromium-based browser on this machine."""
    for name, mac, windows, linux in CHROMIUM:
        if sys.platform == "darwin":
            found = _first([mac])
        elif os.name == "nt":
            found = _first([os.path.join(base, tail)
                            for tail in windows for base in _program_files()])
        else:
            found = shutil.which(linux)
        if found:
            return name, found
    return None, None


# ============================================================
#  IS IT STILL OPEN?
# ============================================================
def profile_in_use(profile: str) -> bool:
    """Is a browser still holding this profile open?

    The process we launched is NOT a reliable answer to that on macOS.
    Firefox re-execs itself: the process we spawned exits while the
    browser it started carries on, orphaned onto launchd. Waiting on that
    process and stopping the server when it ended pulled the folder out
    from under a window that was still open — the app could then neither
    load nor save, in a window with no address bar to show why.

    So ask the process table instead. The main process doesn't carry the
    profile path on macOS, but its content children do, which is enough.
    """
    if os.name == "nt":
        # No cheap way to read another process's command line here, so
        # trust Firefox's own lock. Worst case it is stale after a crash
        # and a local server outlives its window, which costs nothing.
        return os.path.exists(os.path.join(profile, "parent.lock"))
    try:
        listing = subprocess.run(["ps", "-Ao", "pid=,command="],
                                 capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError, ValueError):
        return False           # can't tell — don't hold the server open forever

    # It has to be a browser holding it, not merely a process that names
    # the path. Ourselves, a shell, a search — all of those mention it
    # without having it open, and counting them would hold the server up
    # forever. Both checks earned their place by producing a false yes.
    me = os.getpid()
    for line in listing.splitlines():
        pid, _, command = line.strip().partition(" ")
        if profile not in command or "firefox" not in command.lower():
            continue
        try:
            if int(pid) != me:
                return True
        except ValueError:
            continue
    return False


def _gone():
    """For the ways of opening a window whose process really is the window."""
    return False


# ============================================================
#  OPENING A LINK SOMEWHERE ELSE
# ============================================================
def _default_is_firefox() -> bool:
    """Is Firefox this Mac's default browser?"""
    if sys.platform != "darwin":
        return False
    import plistlib
    path = os.path.expanduser("~/Library/Preferences/com.apple.LaunchServices/"
                              "com.apple.launchservices.secure.plist")
    try:
        with open(path, "rb") as fh:
            handlers = plistlib.load(fh).get("LSHandlers", [])
    except (OSError, ValueError, plistlib.InvalidFileException):
        return False
    return any(h.get("LSHandlerURLScheme") == "https"
               and str(h.get("LSHandlerRoleAll", "")).lower() == "org.mozilla.firefox"
               for h in handlers)


def open_everyday(url: str) -> None:
    """Open `url` in the browser you normally use — never in Organizer's window.

    That matters for anything you sign in to. Organizer's window is a Firefox
    profile of its own: signed in to nothing, with none of your saved
    passwords. On a Mac, "the default browser" goes to whichever running copy
    of it macOS picks — and when the default IS Firefox, that can be
    Organizer's. Starting Firefox without naming a profile goes to your
    everyday one instead: Firefox hands the link to it, or opens it.
    """
    browser = find_firefox() if _default_is_firefox() else None
    if browser:
        subprocess.Popen([browser, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        webbrowser.open(url)


# ============================================================
#  OPENING IT
# ============================================================
def open_window(url: str):
    """Show `url` as a window. Returns (process, how, still_open).

    `process` is the browser to wait on, or None when there was nothing
    to wait for. `still_open()` answers whether the window is really gone
    once that process ends — see profile_in_use for why those are not the
    same question.
    """
    browser = find_firefox()
    if browser:
        profile = firefox.ensure()
        # No --no-remote on purpose. Without it a second launch is handed
        # to the copy already running, which opens another window instead
        # of refusing on the grounds that the profile is in use — that is
        # exactly what should happen when the window was closed earlier.
        proc = subprocess.Popen([browser, "--profile", profile, url],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return proc, "Firefox", lambda: profile_in_use(profile)

    name, browser = find_chromium()
    if browser:
        # Its own user-data-dir keeps this out of everyday browsing and,
        # more usefully, makes it a process of its own — so closing the
        # window ends it, and the server can stop with it.
        data = os.path.join(firefox.support_dir(), "chromium-window")
        os.makedirs(data, exist_ok=True)
        proc = subprocess.Popen([browser, f"--app={url}", f"--user-data-dir={data}",
                                 "--no-first-run", "--no-default-browser-check"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return proc, name, _gone

    webbrowser.open(url)
    return None, "your browser", _gone
