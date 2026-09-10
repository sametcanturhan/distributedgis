# Weather-Aware Road Risk GIS for Berlin

A distributed Web GIS application for collecting road-hazard reports in Berlin and converting them into explainable risk-road segments. The project combines a Leaflet frontend, FastAPI backend, PostgreSQL/PostGIS spatial analysis, local OpenStreetMap road data, Open-Meteo weather data, Nominatim location search, Nginx, and Docker Compose.

## Main features

- Interactive Berlin map using OpenStreetMap and Esri satellite basemaps
- Persistent create, edit, list, locate, and delete operations for road-hazard reports
- Report locations snapped to eligible OSM roads
- Severity-dependent impact radii of 50, 100, 150, and 200 metres
- PostGIS road-segment analysis and risk scoring
- Weather-aware risk interpretation using Open-Meteo
- Report, risk-road, weather-grid, and heatmap layers
- Location search through a backend Nominatim proxy
- GeoJSON and JSON export

## Architecture

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

Docker Compose runs the database, backend, and frontend in separate containers. A separate tool-profile container imports the Berlin OpenStreetMap PBF extract into PostGIS.

## Technology stack

- **Frontend:** HTML, CSS, JavaScript, Leaflet, Leaflet.heat
- **Backend:** Python 3.12, FastAPI, Pydantic, SQLAlchemy, GeoAlchemy2
- **Database:** PostgreSQL 16 + PostGIS 3.4
- **Road data:** OpenStreetMap PBF imported with osm2pgsql flex
- **External services:** Open-Meteo and Nominatim
- **Web server:** Nginx
- **Deployment:** Docker Compose

## Requirements

Install:

- Docker Desktop
- Git, or use GitHub's Download ZIP option
- Internet access for Docker image downloads, map tiles, Leaflet CDN assets, weather, and location search

On Windows, start Docker Desktop before running the commands below.

## Get the project

Clone the repository and switch to the final Berlin branch:

```powershell
git clone https://github.com/sametcanturhan/distributedgis.git
cd distributedgis
git checkout berlin-final
```

If the repository is private, the GitHub account must have access.

Alternatively, open the `berlin-final` branch on GitHub, choose **Code > Download ZIP**, extract the ZIP, and open PowerShell in the extracted project folder.

## Download the Berlin road data

The OpenStreetMap `.pbf` file is intentionally excluded from GitHub because it is a large binary data file.

Download the Berlin extract from Geofabrik:

```text
https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf
```

Place it exactly here:

```text
osm-data/
  berlin-latest.osm.pbf
```

The final Berlin configuration requires only this file. Istanbul data is not used.

## First-time setup

### 1. Start database, backend, and frontend

From the project folder run:

```powershell
docker compose up -d --build db backend frontend
```

The host ports are intentionally non-standard to reduce the chance of conflicts with other local services:

| Service | Address / Host port | Container port |
| --- | --- | --- |
| Frontend | `http://localhost:38147` | `8080` |
| FastAPI | `http://localhost:38148` | `8000` |
| PostgreSQL/PostGIS | `localhost:38149` | `5432` |

Docker services still communicate internally using their normal container ports, for example the backend connects to PostgreSQL at `db:5432`.

### 2. Import the Berlin road network

Run once after `berlin-latest.osm.pbf` has been placed in `osm-data/`:

```powershell
docker compose --profile tools run --rm road-importer
```

The import can take several minutes. The imported road network is stored in the persistent PostgreSQL Docker volume.

### 3. Verify the containers

```powershell
docker compose ps
```

Expected host port mappings include:

```text
38147 -> 8080   frontend
38148 -> 8000   backend
38149 -> 5432   database
```

The database should show a healthy state.

### 4. Open the application

Frontend:

```text
http://localhost:38147
```

FastAPI documentation:

```text
http://localhost:38148/docs
```

## Normal startup after first installation

As long as the PostgreSQL Docker volume still exists, the road import does not need to be repeated.

```powershell
docker compose up -d
```

Open:

```text
http://localhost:38147
```

To stop without deleting data:

```powershell
docker compose stop
```

To start again:

```powershell
docker compose start
```

## Important persistence warning

Reports and imported roads are stored in the named Docker volume `postgres_data`.

This command removes containers but normally keeps the named volume:

```powershell
docker compose down
```

Do **not** use the following command unless you intentionally want to erase the database, reports, and imported road network:

```powershell
docker compose down -v
```

## Application workflow

1. Open the map or search for a Berlin location.
2. Click on or very near an eligible road.
3. The frontend requests a road snap from the backend.
4. Enter hazard type, severity, description, lighting, road-surface, and weather information.
5. Submit the report.
6. The report is stored in PostGIS as a Point snapped to the road network.
7. PostGIS determines affected road portions and calculates road-risk information.
8. The map displays the resulting report and risk-road features.
9. Layer controls can show reports, risk roads, weather grid, and heatmap data.
10. Results can be exported as GeoJSON or JSON.

## Risk model

| Severity | Impact radius | Zone | Base score |
| --- | ---: | ---: | ---: |
| Low | 50 m | 1 | 20 |
| Medium | 100 m | 2 | 40 |
| High | 150 m | 3 | 70 |
| Critical | 200 m | 4 | 90 |

The rule-based score is:

```text
risk score = min(100, round(severity base score × weather multiplier))
```

Current weather multipliers include:

- snow: `1.50`
- temperature below 0 °C: `1.40`
- rain: `1.25`
- strong wind / windy condition: `1.15`
- otherwise: `1.00`

## Main PostGIS operations

- `ST_DWithin` for proximity filtering
- `ST_ClosestPoint` for snapping reports to roads
- `ST_Buffer` for severity-dependent impact areas
- `ST_Intersection` for affected road sections
- `ST_Length` for affected road length
- GiST spatial indexing and bounding-box filtering for query acceleration

## Basemaps

The final frontend uses:

- OpenStreetMap Standard
- Esri World Imagery satellite tiles

CARTO layers were removed so the project does not depend on a CARTO API key.

## External internet dependencies

The local database, API, reports, and imported Berlin road network run locally. Internet access is still required for:

- Leaflet / Leaflet.heat CDN assets
- OpenStreetMap and Esri basemap tiles
- Open-Meteo weather data
- Nominatim location search

For a classroom demonstration, use a reliable internet connection or hotspot.

## Troubleshooting

### Frontend opens but reports cannot be submitted

Confirm that the frontend is opened at:

```text
http://localhost:38147
```

and that the backend is available at:

```text
http://localhost:38148/docs
```

The FastAPI CORS configuration includes the final frontend port `38147`.

### No road is found

Click directly on or close to a supported road. Road snapping currently uses a 12 metre maximum distance for map clicks.

### Local road network is not loaded

Confirm this file exists:

```text
osm-data/berlin-latest.osm.pbf
```

Then run:

```powershell
docker compose --profile tools run --rm road-importer
```

### Backend problems

```powershell
docker compose logs backend
```

### Database problems

```powershell
docker compose logs db
```

### Rebuild services

```powershell
docker compose up -d --build db backend frontend
```

## Project scope and limitations

- The current project is configured for Berlin only.
- Road analysis depends on the locally imported Berlin OpenStreetMap extract.
- The risk model is deterministic and explainable, but is not calibrated against official accident statistics.
- Authentication and moderation are not implemented.
- Weather and location search depend on external services.

## Data attribution

OpenStreetMap data is © OpenStreetMap contributors and is available under the Open Database License. External basemap and API providers retain their own attribution and usage terms.
