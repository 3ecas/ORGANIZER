@echo off
REM ============================================================
REM   Organizer - double-click this file to launch the app.
REM
REM   The Windows twin of start.command: the same app that
REM   Organizer.bat opens, with a console window behind it.
REM   Keep that window open while you work; closing it quits
REM   the app. Organizer.bat does the same without one.
REM
REM   It runs launch.py, which starts server.py: this folder,
REM   served to this PC only (127.0.0.1), saving your tasks and
REM   imported files straight back into it. Nothing is uploaded
REM   anywhere and nothing is installed.
REM
REM   For an ordinary browser tab instead of a window, run it
REM   from a command prompt with:   start.bat --tab
REM ============================================================

setlocal
cd /d "%~dp0"

REM Python goes by a few different names on Windows depending on how it
REM was installed. Take whichever one is actually here.
set "PY="
where py      >nul 2>&1 && set "PY=py -3"
if not defined PY where python  >nul 2>&1 && set "PY=python"
if not defined PY where python3 >nul 2>&1 && set "PY=python3"

if not defined PY (
  echo.
  echo   Organizer needs Python, which isn't on this PC yet.
  echo.
  echo   Get it from  https://www.python.org/downloads/
  echo   During the install, tick "Add Python to PATH" - that box matters.
  echo   Then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM launch.py finds its own port and notices when this folder is already
REM being served. -u so its output appears as it happens rather than all
REM at once when it stops.
%PY% -u launch.py %*

REM Only reached once the app stops - keep the window up so the reason is
REM readable rather than flashing past.
echo.
echo   Organizer has stopped.
pause
