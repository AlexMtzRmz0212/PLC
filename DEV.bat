@echo off
rem Starts the PLC showcase dev server and opens it in your browser.
cd /d "%~dp0"

where npm >nul 2>nul || (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install || goto :fail
)

rem --open launches the browser once Vite is ready (on whatever port it picks).
call npm run dev -- --open || goto :fail
exit /b 0

:fail
echo.
echo Something failed. Read the error above.
pause
exit /b 1
