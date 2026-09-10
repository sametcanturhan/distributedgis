@echo off
setlocal
cd /d "%~dp0"
title Berlin Road Risk GIS - Stop

echo Stopping Berlin Road Risk GIS...
docker compose stop
if errorlevel 1 (
  echo ERROR: Could not stop the project normally.
  echo Make sure Docker Desktop is running.
  pause
  exit /b 1
)

echo.
echo Project stopped. Database data and imported roads were NOT deleted.
pause
