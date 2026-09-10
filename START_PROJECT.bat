@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Berlin Road Risk GIS - Automatic Startup

echo ============================================================
echo   BERLIN ROAD RISK GIS - AUTOMATIC STARTUP
echo ============================================================
echo.

echo [1/6] Checking Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop is not running.
  echo Start Docker Desktop, wait until it is ready, then run this file again.
  pause
  exit /b 1
)
echo OK - Docker is running.

echo.
echo [2/6] Cleaning stale project containers...
for %%C in (gis_project_db gis_project_backend gis_project_frontend) do (
  docker inspect %%C >nul 2>&1
  if not errorlevel 1 (
    echo Removing old container %%C ...
    docker rm -f %%C >nul 2>&1
  )
)
echo OK - Container names are ready.

echo.
echo [3/6] Checking Berlin OpenStreetMap data...
if not exist "osm-data" mkdir "osm-data"
if not exist "osm-data\berlin-latest.osm.pbf" (
  echo Berlin PBF not found. Downloading from Geofabrik...
  if exist "osm-data\berlin-latest.osm.pbf.tmp" del /q "osm-data\berlin-latest.osm.pbf.tmp"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf' -OutFile 'osm-data\berlin-latest.osm.pbf.tmp'"
  if errorlevel 1 (
    echo ERROR: Berlin road data could not be downloaded.
    if exist "osm-data\berlin-latest.osm.pbf.tmp" del /q "osm-data\berlin-latest.osm.pbf.tmp"
    pause
    exit /b 1
  )
  move /y "osm-data\berlin-latest.osm.pbf.tmp" "osm-data\berlin-latest.osm.pbf" >nul
)
echo OK - Berlin PBF is available.

echo.
echo [4/6] Starting PostgreSQL/PostGIS...
docker compose up -d db
if errorlevel 1 goto compose_error

echo Waiting for database TCP connection...
set tries=0
:waitdb
docker compose exec -T db pg_isready -h 127.0.0.1 -p 5432 -U postgres -d gis_project >nul 2>&1
if not errorlevel 1 goto dbready
set /a tries+=1
if !tries! GEQ 60 (
  echo ERROR: Database did not become ready.
  docker compose logs --tail 50 db
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto waitdb

:dbready
echo OK - Database TCP connection is ready.
timeout /t 3 /nobreak >nul

echo.
echo [5/6] Checking Berlin road network...
docker compose exec -T db psql -h 127.0.0.1 -U postgres -d gis_project -tAc "SELECT CASE WHEN to_regclass('public.road_network') IS NULL THEN 'NO' ELSE 'YES' END;" | findstr /C:"YES" >nul
if errorlevel 1 (
  echo Berlin road network not found. Starting import...
  set import_try=1
  :import_retry
  echo Import attempt !import_try! of 3...
  docker compose --profile tools run --rm road-importer
  if not errorlevel 1 goto import_ok
  if !import_try! GEQ 3 (
    echo ERROR: Berlin road import failed after 3 attempts.
    docker compose logs --tail 50 db
    pause
    exit /b 1
  )
  set /a import_try+=1
  echo Database may still be finishing startup. Waiting 8 seconds before retry...
  timeout /t 8 /nobreak >nul
  goto import_retry
  :import_ok
  echo OK - Berlin road import completed.
) else (
  echo OK - Road network already exists. Import skipped.
)

echo.
echo [6/6] Starting backend and frontend...
docker compose up -d --build backend frontend
if errorlevel 1 goto compose_error

echo Waiting briefly for the application...
timeout /t 5 /nobreak >nul

echo.
echo ============================================================
echo PROJECT IS READY
echo Application: http://localhost:38147
echo API docs:    http://localhost:38148/docs
echo ============================================================
start "" "http://localhost:38147"
pause
exit /b 0

:compose_error
echo ERROR: Docker Compose could not start the project.
echo Make sure ports 38147, 38148 and 38149 are free.
echo You can also check Docker Desktop for old containers using these ports.
pause
exit /b 1
