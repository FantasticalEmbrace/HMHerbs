@echo off
REM Build the standard Windows installer (Setup.exe)
cd /d "%~dp0"
call build-installer.bat
