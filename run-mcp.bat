@echo off
setlocal
title Meshwright MCP server
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo   Meshwright is not installed yet - run install.bat first.
    echo.
    pause
    exit /b 1
)

rem A moved folder leaves a stale .venv (absolute paths inside). The desktop
rem launcher self-heals this; the MCP server only reports it.
rem (A missing stamp means a .venv from before portability support - same fix.)
set "MWHERE=%~dp0"
set "MWHERE=%MWHERE:~0,-1%"
findstr /I /C:"%MWHERE%" ".venv\.meshwright-root.txt" >nul 2>&1
if errorlevel 1 (
    echo.
    echo   This folder was moved since .venv was built (or the .venv predates
    echo   portability support).
    echo   Run install.bat -Recreate once, then start the MCP server again.
    echo.
    pause
    exit /b 1
)

".venv\Scripts\python.exe" -c "import mcp" 2>nul
if errorlevel 1 (
    echo.
    echo   The MCP package is not installed in this environment.
    echo   Install it with:
    echo     .venv\Scripts\python -m pip install mcp
    echo.
    pause
    exit /b 1
)

".venv\Scripts\python.exe" "mcp_server.py"
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" pause
exit /b %CODE%
