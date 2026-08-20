# Weather-Aware Road Risk GIS

A distributed Web GIS application for collecting road-hazard reports and converting them into explainable risk-road segments. The project combines a Leaflet web client, a FastAPI middleware, PostgreSQL/PostGIS spatial analysis, OpenStreetMap road data, Open-Meteo weather information, and Docker Compose.

## What the application does

- Displays an interactive map with multiple basemaps.
- Creates, edits, lists, locates, and deletes persistent road-hazard reports.
- Accepts reports only near an eligible road and snaps them to the road geometry.
- Produces severity-dependent impact areas of 50, 100, 150, or 200 metres.
- Intersects those impact areas with the local OSM road network.
- Draws only the affected road portions as coloured LineString features.
- Calculates an explainable risk score from severity and weather conditions.
- Shows report, risk-road, heatmap, and weather layers.
- Searches locations through a backend Nominatim proxy.
- Exports both Point reports and LineString analysis results as GeoJSON.

## Architecture

```text
Browser / Leaflet Web Client
            |
            | REST + JSON / GeoJSON
            v
      FastAPI / Python
       |           |
       |           +---- Open-Meteo weather API
       |           +---- Nominatim location search
       v
PostgreSQL + PostGIS
  - road_reports (Point)
  - road_network (LineString)
  - spatial queries and risk analysis
```

Docker Compose runs the database, backend, and frontend in separate containers. A tool-profile container imports local OpenStreetMap PBF extracts into PostGIS.

## Technology stack

- **Frontend:** HTML, CSS, JavaScript, Leaflet, Leaflet.heat
- **Backend:** Python 3.12, FastAPI, Pydantic, SQLAlchemy, GeoAlchemy2
- **Spatial database:** PostgreSQL 16, PostGIS 3.4
- **Road data:** OpenStreetMap PBF, imported with osm2pgsql flex
- **External services:** Open-Meteo and Nominatim
- **Web server:** Nginx
- **Deployment:** Docker Compose

## Requirements

Install the following on the computer that will run the project:

- Docker Desktop
- Git, or a web browser if the repository is downloaded as a ZIP
- An internet connection for the first Docker image download, external basemaps, Leaflet CDN, weather, and location search

On Windows, Docker Desktop normally uses WSL 2. Confirm that Docker Desktop is running before entering the commands below.

## Clone the repository

```powershell
git clone https://github.com/sametcanturhan/distributedgis.git
cd distributedgis
```

Because the repository is private, GitHub will require an account that has been granted access by the owner.

Alternatively, an authorised user can download **Code > Download ZIP**, extract it, and open PowerShell in the extracted folder.

## Download the road data

Large `.osm.pbf` files are intentionally excluded from GitHub through `.gitignore`. They must be placed in `osm-data/` before the road importer is run.

Expected files:

```text
osm-data/
  berlin-latest.osm.pbf
  Istanbul.osm.pbf
```

Berlin can be downloaded from Geofabrik:

```text
https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf
```

The Istanbul extract used by this project can be obtained from BBBike or replaced with another compatible Istanbul OSM PBF extract. Keep the filename `Istanbul.osm.pbf`, unless the importer command in `docker-compose.yml` is updated as well.

> The current Docker importer expects both filenames. Missing PBF files will cause the import step to fail. The large files remain local and are never committed to the repository.

## First-time setup

### 1. Start the main services

```powershell
docker compose up -d --build db backend frontend
```

This starts:

- `gis_project_db` - PostgreSQL/PostGIS on port `5432`
- `gis_project_backend` - FastAPI on port `8000`
- `gis_project_frontend` - Nginx/Leaflet on port `8080`

### 2. Import the road network

Run this once after the PBF files have been placed in `osm-data/`:

```powershell
docker compose --profile tools run --rm road-importer
```

The import may take several minutes. Do not interrupt it. The road data is written to the persistent PostgreSQL Docker volume.

### 3. Verify the containers

```powershell
docker compose ps
```

The database should report a healthy state, and the backend and frontend should be running.

### 4. Open the application

```text
http://localhost:8080
```

The FastAPI interactive documentation is available at:

```text
http://localhost:8000/docs
```

## Normal startup after the first installation

The road import does not need to be repeated while the PostgreSQL Docker volume exists.

```powershell
docker compose up -d
```

Open `http://localhost:8080` in a browser.

To stop the containers without deleting the database:

```powershell
docker compose stop
```

To start the stopped containers again:

```powershell
docker compose start
```

## Important data-persistence warning

The reports and imported road network are stored in the Docker volume `postgres_data`. They are not stored in GitHub.

```powershell
docker compose down
```

stops and removes the containers but normally preserves the named volume.

Do **not** use the following command unless the database should be permanently deleted:

```powershell
docker compose down -v
```

The `-v` option removes the database volume, including reports and imported roads.

## Application workflow

1. Search for a location or navigate the map.
2. Select a point on an eligible road.
3. Enter the hazard type, severity, description, lighting, and road-surface conditions.
4. Submit the report.
5. The backend finds an eligible road within 12 metres and snaps the point to it.
6. PostGIS creates a severity-dependent buffer and intersects it with the road network.
7. The affected road portions are displayed and styled by risk score.
8. Use the layer controls to show reports, risk roads, heatmap, or weather data.
9. Export the complete GIS result as GeoJSON when required.

## Spatial analysis

| Severity | Impact radius | Zone | Base score |
| --- | ---: | ---: | ---: |
| Low | 50 m | 1 | 20 |
| Medium | 100 m | 2 | 40 |
| High | 150 m | 3 | 70 |
| Critical | 200 m | 4 | 90 |

Risk is calculated with an explainable rule-based model:

```text
risk score = min(100, round(severity base score × weather multiplier))
```

Weather multipliers currently include snow `1.50`, temperature below zero `1.40`, rain `1.25`, wind `1.15`, and otherwise `1.00`.

The main PostGIS functions are:

- `ST_DWithin` - proximity and road-candidate filtering
- `ST_ClosestPoint` - snapping the report to a road
- `ST_Buffer` - severity-dependent impact area
- `ST_Intersection` - clipping affected road portions
- `ST_Length` - affected length in metres
- GiST index and bounding-box filtering - query acceleration

## GeoJSON export

The full export contains:

- Point features for the original hazard reports
- LineString features for the derived risk-road segments
- report IDs, OSM road information, severity, buffer radius, risk score, distance, affected length, and generation metadata

The result can be opened in QGIS or another GeoJSON-compatible GIS application.

## Internet and offline behaviour

The database, API, stored reports, and imported road network run locally. The current frontend still uses internet-hosted services for:

- Leaflet and Leaflet.heat CDN files
- OpenStreetMap, CARTO, and Esri basemap tiles
- Open-Meteo weather data
- Nominatim location search

For a classroom presentation, prepare a reliable internet connection or phone hotspot. A future offline-ready version should vendor the Leaflet assets and provide a local or cached basemap.

## Troubleshooting

### `No road found within 12 meters`

Choose a point directly on a supported road. The application intentionally rejects reports placed on buildings, shopping centres, or unrelated open areas.

### `Local road network is not loaded`

Confirm that both required PBF files exist, then run:

```powershell
docker compose --profile tools run --rm road-importer
```

### The map opens but basemap tiles are blank

Check the internet connection. Basemap tiles are currently loaded from external providers.

### Location search or weather does not work

These functions require access to Nominatim and Open-Meteo. The local report database may still work while those services are unavailable.

### Check backend logs

```powershell
docker compose logs backend
```

### Check database logs

```powershell
docker compose logs db
```

### Rebuild after backend changes

```powershell
docker compose up -d --build backend
```

## Repository privacy and collaboration

This repository is private. Only the owner and explicitly invited collaborators can access it. The owner can invite or remove collaborators from **Settings > Collaborators and teams** on GitHub.

Do not commit:

- `.osm.pbf` extracts
- database dumps containing private reports
- `.env` files
- passwords, tokens, API keys, or credentials

## Project scope and known limitations

- Road analysis works only in regions whose PBF data has been imported.
- The risk model is deterministic and explainable, but its weights are not yet calibrated with official accident statistics.
- Authentication, ownership of individual reports, moderation, and abuse prevention are not yet implemented.
- Weather and geocoding depend on external services.
- Some UI summary fields should be connected to authoritative API data before being used as scientific evidence.

## Licence and data attribution

Application code licence: not yet specified by the project owner.

OpenStreetMap data is © OpenStreetMap contributors and is available under the Open Database License. Basemap providers retain their own attribution and usage terms.
