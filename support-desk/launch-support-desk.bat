@echo off
REM Business One Support Desk — pin as a Windows app (Chrome/Edge)
set HUB_URL=%1
if "%HUB_URL%"=="" set HUB_URL=http://127.0.0.1:3001/support-desk

where msedge >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" msedge --app="%HUB_URL%"
  exit /b 0
)

where chrome >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" chrome --app="%HUB_URL%"
  exit /b 0
)

start "" "%HUB_URL%"
