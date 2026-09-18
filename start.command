#!/bin/bash
# ============================================================
#  Organizer — double-click this file to launch the app.
#
#  The same app Organizer.app opens, with a Terminal window
#  behind it. Keep that window open while you work; closing
#  it quits the app. If you'd rather not have it, use
#  Organizer.app instead — it needs no Terminal at all.
#
#  It runs launch.py, which starts server.py: this folder,
#  served to this machine only (127.0.0.1), saving your tasks
#  and imported files straight back into it. Nothing is
#  uploaded anywhere and nothing is installed.
#
#  For an ordinary browser tab instead of a window, run it
#  from Terminal with:   ./start.command --tab
# ============================================================

cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo
  echo "  Organizer needs python3, which isn't on this Mac yet."
  echo "  Run this once, accept the install, then try again:"
  echo
  echo "      xcode-select --install"
  echo
  read -r -p "  Press return to close."
  exit 1
fi

# No port or already-running checks here any more: launch.py finds a free
# port itself, and notices when this folder is already being served — which
# it can do properly by asking the server which folder it's serving.
#
# -u so the lines below appear as they happen. Python holds its output back
# when it isn't writing to a terminal, and this is sometimes launched where
# it isn't, which made a working launcher look like a hung one.
exec python3 -u launch.py "$@"
