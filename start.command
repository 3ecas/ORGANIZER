#!/bin/bash
# ============================================================
#  Organizer — double-click this file to launch the app.
#
#  It runs server.py, which serves this folder to your own
#  machine only (127.0.0.1) and saves your tasks and imported
#  files straight into this folder. Nothing is uploaded
#  anywhere and nothing is installed.
#
#  Close this Terminal window to quit.
# ============================================================

cd "$(dirname "$0")" || exit 1

PORT=8777
URL="http://localhost:$PORT/"

# Already running from an earlier launch? Just open a tab.
if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Organizer is already running."
  open "$URL"
  exit 0
fi

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

# server.py opens the browser itself once the socket is listening, so there
# is no race to sleep through.
exec python3 server.py "$PORT"
