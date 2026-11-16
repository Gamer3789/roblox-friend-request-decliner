@echo off
setlocal
cd /d "%~dp0"
title Roblox Request Decliner - Listener
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist "node_modules\@microsoft\signalr\package.json" (
  echo Installing the notification client...
  call npm.cmd ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo Installation failed. Check your internet connection.
    pause
    exit /b 1
  )
)
node app.mjs
pause
