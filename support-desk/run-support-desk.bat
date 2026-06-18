@echo off
REM Run the pre-built Support Desk portable app (after build-support-desk.bat)
set EXE=%~dp0dist\Business One Support Desk.exe
if not exist "%EXE%" (
  echo Portable app not built yet. Run build-support-desk.bat first.
  exit /b 1
)
start "" "%EXE%"
