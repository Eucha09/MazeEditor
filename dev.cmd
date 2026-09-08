@echo off
REM ---------------------------------------------------------------
REM  Maze Editor - start the Vite dev server.
REM  Double-click this file, or run "dev" from a terminal.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "LOCAL_NODE=%USERPROFILE%\tools\node-v24.20.0-win-x64"

REM Node.js is installed as a portable zip under the user profile, so a
REM terminal opened before the install may not have it on PATH yet.
where node >nul 2>nul || set "PATH=%LOCAL_NODE%;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found.
    echo         Expected location: %LOCAL_NODE%
    echo         Install Node.js LTS or fix PATH, then run this again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing dependencies ^(first run, this takes a moment^)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo Starting dev server on http://localhost:5180/
echo Press Ctrl+C to stop.
echo.
call npm run dev
set "RC=%errorlevel%"

if not "%RC%"=="0" (
    echo.
    echo [ERROR] Dev server exited with code %RC%.
    echo         If the port is already in use, close the other server first.
    pause
)
exit /b %RC%
