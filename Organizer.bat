@echo off
REM ============================================================
REM   Organizer - double-click this to open the app in a window.
REM
REM   The Windows twin of Organizer.app. It hands over to
REM   launch.py, which starts the same local server and opens
REM   the app in a window with no tabs and no address bar.
REM
REM   Nothing is installed and nothing is uploaded.
REM   start.bat still opens it in a browser tab instead.
REM ============================================================

setlocal
cd /d "%~dp0"

REM pythonw is the Python that runs without a black console window
REM sitting behind the app. Much the nicer one to be launched by.
set "PY="
where pythonw >nul 2>&1 && set "PY=pythonw"
if not defined PY where pyw >nul 2>&1 && set "PY=pyw -3"

if defined PY (
  start "" %PY% launch.py
  exit /b 0
)

REM No windowless Python here, so use the ordinary one. That leaves a
REM console window open behind the app - closing it quits Organizer.
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

%PY% launch.py

echo.
echo   Organizer has stopped.
pause
