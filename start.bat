@echo off
REM ============================================================
REM   Organizer - double-click this file to launch the app.
REM
REM   The Windows twin of start.command. It runs server.py, which
REM   serves this folder to this PC only (127.0.0.1) and saves your
REM   tasks and imported files straight into this folder. Nothing is
REM   uploaded anywhere and nothing is installed.
REM
REM   Close this window to quit.
REM ============================================================

setlocal
cd /d "%~dp0"

set "PORT=8777"

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

REM server.py opens the browser itself once it's listening, so there's
REM nothing to time here.
%PY% server.py %PORT%

REM Only reached if the server stops or fails to start - keep the window
REM up so the reason is readable rather than flashing past.
echo.
echo   Organizer has stopped.
pause
