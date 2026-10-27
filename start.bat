@echo off
cd /d "%~dp0"
echo ASTRAEA - cinematic website
where node >nul 2>nul
if %errorlevel% equ 0 (
  start "" "http://localhost:5173"
  node server.mjs
) else (
  echo Node.js is not installed. Trying Python...
  start "" "http://localhost:5173"
  py -3 -m http.server 5173
)
pause
