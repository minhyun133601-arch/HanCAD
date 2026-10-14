@echo off
setlocal
title HanCAD
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
echo Updating the current HanCAD build...
call pnpm build:web
if errorlevel 1 goto failed
node scripts\launch-app.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo HanCAD could not start. Keep this error message open.
echo Try http://127.0.0.1:1420 in Microsoft Edge.
pause
exit /b 1
