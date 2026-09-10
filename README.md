# Weather-Aware Road Risk GIS for Berlin

A distributed Web GIS application for collecting road-hazard reports in Berlin and converting them into explainable risk-road segments. The system uses a Leaflet frontend, FastAPI backend, PostgreSQL/PostGIS, OpenStreetMap road data, Open-Meteo, Nominatim, Nginx and Docker Compose.

## Quick Start — Windows (recommended)

The final project is available directly from the **`main`** branch. The repository includes a one-click launcher, so on a Windows computer the user does **not** need to manually download the Berlin PBF, run the road importer, or enter the normal Docker commands.

### Requirements

1. Install **Docker Desktop**.
2. Start Docker Desktop and wait until Docker is ready.
3. Make sure the computer has an internet connection during the first startup.
4. Download this repository from the **`main`** branch and extract the ZIP.

### Start the project

Double-click:

```text
START_PROJECT.bat
```

The launcher automatically:

1. checks that Docker Desktop is running;
2. removes stale project containers that could cause container-name conflicts, while keeping the persistent PostgreSQL volume;
3. creates the `osm-data` directory if necessary;
4. checks for `osm-data/berlin-latest.osm.pbf`;
5. downloads the Berlin OpenStreetMap PBF from Geofabrik if it is missing, using a temporary file so an interrupted download is not mistaken for a valid PBF;
6. starts PostgreSQL/PostGIS;
7. waits until PostgreSQL accepts TCP connections;
8. checks whether the `road_network` table already exists;
9. runs the osm2pgsql road importer only when required, retrying automatically if PostgreSQL is still finishing startup;
10. builds and starts the FastAPI backend and Nginx/Leaflet frontend;
11. opens the application automatically in the default browser.

The **first startup can take several minutes** because the Berlin road data must be downloaded and imported. Later startups are much faster because the existing PBF and PostGIS road network are reused.

Application:

```text
http://localhost:38147
```

FastAPI documentation:

```text
http://localhost:38148/docs
```

### Stop the project

Double-click:

```text
STOP_PROJECT.bat
```

This stops the containers without deleting the PostgreSQL volume, reports, or imported roads.

> **Important:** Do not use `docker compose down -v` unless you intentionally want to delete the database volume, reports and imported road network.

## Manual startup (alternative)

The one-click launcher is recommended on Windows. If manual startup is required, place `berlin-latest.osm.pbf` in `osm-data/` and run:

```powershell
docker compose up -d db
docker compose --profile tools run --rm road-importer
docker compose up -d --build backend frontend
```

The road importer only needs to be run when the road network has not already been imported into the persistent database volume.

## Docker architecture

Docker Compose separates the main application into three continuously running services:

| Service | Technology | Host address / port | Container port |
| --- | --- | --- | --- |
| Frontend | Nginx + Leaflet | `http://localhost:38147` | `8080` |
| Backend/API | FastAPI + Python | `http://localhost:38148` | `8000` |
| Database | PostgreSQL + PostGIS | `localhost:38149` | `5432` |

A fourth **tool-profile** container (`road-importer`) uses osm2pgsql to import the Berlin PBF into PostGIS when required. It is not a continuously running application service.

The backend communicates with PostgreSQL through Docker's internal network at `db:5432`.

## Main features

- Interactive Berlin map with OpenStreetMap and Esri satellite basemaps
- Persistent create, edit, list, locate and delete operations for road-hazard reports
- Report locations snapped to eligible OpenStreetMap roads
- Severity-dependent impact radii of 50, 100, 150 and 200 metres
- PostGIS road-segment analysis and risk scoring
- Weather-aware risk interpretation using Open-Meteo
- Report, risk-road, weather-grid and heatmap layers
- Location search through a backend Nominatim proxy
- GeoJSON and JSON export

## Application architecture

```text
Browser / Leaflet
       |
       | REST + JSON / GeoJSON
       v
FastAPI / Python
   |          |
   |          +---- Open-Meteo
   |          +---- Nominatim
   v
PostgreSQL + PostGIS
   - road_reports (Point)
   - road_network (LineString)
   - spatial analysis
```

## Technology stack

- **Frontend:** HTML, CSS, JavaScript, Leaflet, Leaflet.heat
- **Backend:** Python 3.12, FastAPI, Pydantic, SQLAlchemy, GeoAlchemy2
- **Database:** PostgreSQL 16 + PostGIS 3.4
- **Road data:** OpenStreetMap PBF imported with osm2pgsql flex
- **External services:** Open-Meteo and Nominatim
- **Web server:** Nginx
- **Deployment:** Docker Compose

## Berlin road data

The large `.osm.pbf` file is intentionally excluded from GitHub. `START_PROJECT.bat` downloads it automatically from Geofabrik when it is missing.

Expected local path:

```text
osm-data/berlin-latest.osm.pbf
```

The final configuration is **Berlin only**; Istanbul data is not used.

## Application workflow

1. Open or search for a Berlin location.
2. Click on or very near an eligible road.
3. The frontend requests a road snap from the backend.
4. Enter hazard type, severity, description, lighting, road-surface and weather information.
5. Submit the report.
6. The report is stored in PostGIS as a Point snapped to the road network.
7. PostGIS determines affected road portions and calculates road-risk information.
8. The map displays the report and risk-road features.
9. Layer controls can show reports, risk roads, weather grid and heatmap data.
10. Results can be exported as GeoJSON or JSON.

## Risk model

| Severity | Impact radius | Zone | Base score |
| --- | ---: | ---: | ---: |
| Low | 50 m | 1 | 20 |
| Medium | 100 m | 2 | 40 |
| High | 150 m | 3 | 70 |
| Critical | 200 m | 4 | 90 |

```text
risk score = min(100, round(severity base score × weather multiplier))
```

Current weather multipliers include snow `1.50`, temperature below 0 °C `1.40`, rain `1.25`, strong wind `1.15`, and otherwise `1.00`.

## Main PostGIS operations

- `ST_DWithin` — proximity filtering
- `ST_ClosestPoint` — snapping reports to roads
- `ST_Buffer` — severity-dependent impact areas
- `ST_Intersection` — affected road sections
- `ST_Length` — affected road length
- GiST spatial indexing and bounding-box filtering — query acceleration

## Basemaps

The final frontend uses OpenStreetMap Standard and Esri World Imagery. CARTO layers were removed, so the project does not depend on a CARTO API key.

## Internet dependencies

The local database, API, reports and imported road network run locally. Internet access is still required for the initial Berlin PBF download, external map tiles, Leaflet CDN assets, Open-Meteo weather data and Nominatim location search.

## Troubleshooting

If `START_PROJECT.bat` reports that Docker is not running, open Docker Desktop, wait until it is ready, and run the launcher again.

The launcher now automatically handles two common setup problems:

- an old `gis_project_db`, `gis_project_backend` or `gis_project_frontend` container already using the same container name;
- PostgreSQL reporting healthy before it is fully ready to accept the road-importer TCP connection.

If the frontend does not open, check `http://localhost:38148/docs`. For backend logs use:

```powershell
docker compose logs backend
```

For database logs use:

```powershell
docker compose logs db
```

If a report cannot find a road, click directly on or close to a supported road. Road snapping currently uses a 12 metre maximum distance for map clicks.

If the automatic PBF download fails, check the internet connection and run `START_PROJECT.bat` again. The launcher downloads to a temporary file and only renames it after a successful download.

## Persistence

Reports and imported Berlin roads are stored in the named Docker volume `postgres_data`. Removing or recreating the application containers does not delete this volume. `STOP_PROJECT.bat` uses `docker compose stop`, so data is preserved between runs.

## Project scope and limitations

- The project is configured for Berlin only.
- Road analysis depends on the imported Berlin OpenStreetMap extract.
- The risk model is deterministic and explainable but is not calibrated against official accident statistics.
- Authentication and moderation are not implemented.
- Weather and location search depend on external services.

## Data attribution

OpenStreetMap data is © OpenStreetMap contributors and is available under the Open Database License. External basemap and API providers retain their own attribution and usage terms.
