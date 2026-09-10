@echo off
setlocal
cd /d "%~dp0"
title Berlin Road Risk GIS - Automatic Startup

echo ============================================================
echo   BERLIN ROAD RISK GIS - AUTOMATIC STARTUP
echo ============================================================
echo.

echo [1/5] Checking Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop is not running.
  echo Start Docker Desktop, wait until it is ready, then run this file again.
  pause
  exit /b 1
)
echo OK - Docker is running.

echo.
echo [2/5] Checking Berlin OpenStreetMap data...
if not exist "osm-data" mkdir "osm-data"
if not exist "osm-data\berlin-latest.osm.pbf" (
  echo Berlin PBF not found. Downloading from Geofabrik...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf' -OutFile 'osm-data\berlin-latest.osm.pbf'"
  if errorlevel 1 (
    echo ERROR: Berlin road data could not be downloaded.
    pause
    exit /b 1
  )
)
echo OK - Berlin PBF is available.

echo.
echo [3/5] Starting PostgreSQL/PostGIS...
docker compose up -d db
if errorlevel 1 goto compose_error

echo Waiting for database...
set tries=0
:waitdb
docker compose exec -T db pg_isready -U postgres -d gis_project >nul 2>&1
if not errorlevel 1 goto dbready
set /a tries+=1
if %tries% GEQ 60 (
  echo ERROR: Database did not become ready.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto waitdb

:dbready
echo OK - Database is ready.

echo.
echo [4/5] Checking Berlin road network...
docker compose exec -T db psql -U postgres -d gis_project -tAc "SELECT CASE WHEN to_regclass('public.road_network') IS NULL THEN 'NO' ELSE 'YES' END;" | findstr /C:"YES" >nul
if errorlevel 1 (
  echo Importing Berlin roads. First start can take several minutes...
  docker compose --profile tools run --rm road-importer
  if errorlevel 1 (
    echo ERROR: Berlin road import failed.
    pause
    exit /b 1
  )
) else (
  echo OK - Road network already exists. Import skipped.
)

echo.
echo [5/5] Starting backend and frontend...
docker compose up -d --build backend frontend
if errorlevel 1 goto compose_error

echo.
echo ============================================================
echo PROJECT IS READY
echo Application: http://localhost:38147
echo API docs:    http://localhost:38148/docs
echo ============================================================
timeout /t 3 /nobreak >nul
start "" "http://localhost:38147"
pause
exit /b 0

:compose_error
echo ERROR: Docker Compose could not start the project.
echo Make sure ports 38147, 38148 and 38149 are free.
pause
exit /b 1
