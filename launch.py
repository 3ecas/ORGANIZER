#!/usr/bin/env python3
"""
Organizer — open it as a window.

What start.command does, minus the browser and minus the Terminal: it
starts the same local server, opens the app in a window of its own, and
stays out of the way until that window is quit, at which point the
server stops with it.

Nothing new is installed and nothing is uploaded. The server is the same
server.py as always, still listening on 127.0.0.1 and nowhere else.

    Organizer.app   double-click this on the Mac
    Organizer.bat   double-click this on the PC
    start.command   the old way, in a browser tab, still works
"""

import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

import server
from desktop import window

ROOT = os.path.dirname(os.path.abspath(__file__))

BASE_PORT = 8777
PORT_TRIES = 20

# How often to re-ask whether the window is still open, once the process
# we launched has ended. Cheap, and nobody notices two seconds.
WATCH_SECONDS = 2


# ============================================================
#  FINDING A PORT
# ============================================================
def ping(port: int):
    """Whatever is answering on `port`, if it's an Organizer."""
    try:
        with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/api/ping", timeout=0.8) as response:
            got = json.load(response)
            return got if isinstance(got, dict) and got.get("ok") else None
    except (urllib.error.URLError, OSError, ValueError):
        return None


def is_taken(port: int) -> bool:
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return False
        except OSError:
            return True


def choose_port():
    """(port, already_running).

    A port answering as an Organizer is only ours if it's serving THIS
    folder. The folder gets synced between two machines and can end up
    copied beside itself; opening a window onto the other copy would show
    the wrong work and save into the wrong place, which is a far worse
    outcome than starting a second server on the next port along.
    """
    mine = os.path.realpath(ROOT)
    for port in range(BASE_PORT, BASE_PORT + PORT_TRIES):
        if not is_taken(port):
            return port, False
        running = ping(port)
        if running and os.path.realpath(running.get("root") or "") == mine:
            return port, True
    return None, False


# ============================================================
#  GOING
# ============================================================
def show(url: str, as_tab: bool):
    """Put the app in front of the user. Same answer shape either way."""
    if as_tab:
        webbrowser.open(url)
        return None, "a browser tab", (lambda: False)
    return window.open_window(url)


def main():
    # --tab asks for the old behaviour on purpose: an ordinary browser tab
    # instead of a window. Worth keeping as something you can ask for rather
    # than only as what you get when the window fails.
    as_tab = "--tab" in sys.argv

    port, already = choose_port()
    if port is None:
        sys.exit(f"  No free port between {BASE_PORT} and "
                 f"{BASE_PORT + PORT_TRIES - 1}. Restart and try again.")

    url = f"http://127.0.0.1:{port}/"

    # Already serving this folder — it just needs a window.
    if already:
        show(url, as_tab)
        print(f"  Organizer was already running. Opened it again on {url}")
        return

    running = server.build(port)
    threading.Thread(target=running.serve_forever, daemon=True).start()

    opened, how, still_open = show(url, as_tab)
    print()
    print(f"  Organizer is open in {how}.")
    print(f"  Serving {ROOT}")
    print(f"  at      {url}")
    print()
    print("  Quit the window to stop it.", flush=True)

    try:
        if opened is not None:
            opened.wait()

        # The process ending is NOT the window closing. Firefox re-execs
        # itself on macOS and the process we launched exits within seconds
        # while the browser carries on. Believing it once cost a live
        # window its server mid-session. So keep serving for as long as
        # the browser still holds the profile open.
        while still_open():
            time.sleep(WATCH_SECONDS)

        if opened is None:
            # A plain tab has no moment that means "finished", so serve
            # until interrupted rather than leaving it on a dead port.
            while True:
                time.sleep(3600)
    except KeyboardInterrupt:
        pass

    running.shutdown()
    running.server_close()
    print("  Organizer stopped. Your work is saved.\n")


if __name__ == "__main__":
    main()
