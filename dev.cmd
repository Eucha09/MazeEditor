@echo off
REM ---------------------------------------------------------------
REM  Maze Editor - start the Vite dev server.
REM  Double-click this file, or run "dev" from a terminal.
REM
REM  On a machine that has nothing installed yet, this also
REM  downloads a portable Node.js and runs "npm install" before
REM  starting the dev server, so a fresh checkout works out of the box.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

set "NODE_VERSION=v24.20.0"
set "NODE_DIST=node-%NODE_VERSION%-win-x64"
set "TOOLS_DIR=%USERPROFILE%\tools"
set "LOCAL_NODE=%TOOLS_DIR%\%NODE_DIST%"
set "NODE_ZIP=%TEMP%\%NODE_DIST%.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_DIST%.zip"

REM Node.js is installed as a portable zip under the user profile, so a
REM terminal opened before the install may not have it on PATH yet.
where node >nul 2>nul || set "PATH=%LOCAL_NODE%;%PATH%"

REM Neither on PATH nor at the expected local folder: this is a brand new
REM machine. Download and unpack a portable Node.js automatically instead
REM of asking the user to do it by hand.
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Downloading a portable copy ^(one-time setup^)...
    if not exist "%TOOLS_DIR%\" mkdir "%TOOLS_DIR%"

    REM NOTE: keep each PowerShell call on a single line, and wrap the actual
    REM work in try/catch with -ErrorAction Stop and an explicit "exit 1" on
    REM failure. Without that, powershell.exe's own exit code has been observed
    REM to come back non-zero even when Invoke-WebRequest/Expand-Archive
    REM completed successfully, which would make this script report a bogus
    REM failure on an otherwise-working one-time setup step.
    echo   - fetching %NODE_URL%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -ErrorAction Stop } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo [ERROR] Could not download Node.js from %NODE_URL%.
        echo         Check your internet connection, or install Node.js LTS
        echo         manually from https://nodejs.org/ and run this again.
        pause
        exit /b 1
    )

    echo   - extracting to %TOOLS_DIR%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%TOOLS_DIR%' -Force -ErrorAction Stop } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        del "%NODE_ZIP%" >nul 2>nul
        echo [ERROR] Failed to extract the Node.js archive.
        pause
        exit /b 1
    )
    del "%NODE_ZIP%" >nul 2>nul

    set "PATH=%LOCAL_NODE%;%PATH%"
    echo Node.js installed to %LOCAL_NODE%
)

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
