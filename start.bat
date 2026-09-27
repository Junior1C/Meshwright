@echo off
setlocal
title Meshwright
cd /d "%~dp0"

rem Single logic lives in start.ps1 (it self-heals .venv after the folder moves).
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

echo ============================================================
echo   Meshwright - Geekatplay Studio
echo.
echo   This window is the activity log. Keep it open while you
echo   work; closing it closes Meshwright.
echo.
echo   Meshwright has no model of its own - open one of your own
echo   files, or click "Load demo model" in the empty viewport.
echo ============================================================
echo.

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
    echo.
    echo   Meshwright closed with error code %CODE%.
    echo   Read the message above; if it mentions a missing module, run:
    echo     install.bat -Recreate
    echo.
    pause
)
exit /b %CODE%
