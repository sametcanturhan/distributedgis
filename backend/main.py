from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import crud
from database import ensure_weather_columns, get_db
from geojson import report_to_feature, reports_to_feature_collection
from locations import search_locations
from models import GeoJSONFeature, GeoJSONFeatureCollection, ReportCreate, ReportUpdate
from roads import get_risk_roads, snap_to_road
from weather import get_current_weather, get_hourly_weather

app = FastAPI(title="Berlin Road Risk Reports API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_weather_columns()


@app.get("/reports", response_model=GeoJSONFeatureCollection)
def get_reports(db: Session = Depends(get_db)) -> GeoJSONFeatureCollection:
    return reports_to_feature_collection(crud.get_reports(db))


@app.get("/weather/berlin")
def get_berlin_weather() -> dict:
    return get_current_weather(latitude=52.52, longitude=13.405)


@app.get("/weather/current")
def get_weather_current(lat: float, lon: float) -> dict:
    return get_current_weather(latitude=lat, longitude=lon)


@app.get("/weather/hourly")
def get_weather_hourly(lat: float, lon: float, hours: int = 12) -> dict:
    return get_hourly_weather(latitude=lat, longitude=lon, hours=hours)


@app.get("/roads/snap")
def get_road_snap(
    lat: float,
    lon: float,
    max_distance: float = 12,
    db: Session = Depends(get_db),
) -> dict:
    return snap_to_road(db, lat, lon, max_distance=max_distance)


@app.get("/roads/risk")
def get_road_risk(db: Session = Depends(get_db)) -> dict:
    return get_risk_roads(db)


@app.get("/locations/search")
def get_location_search(q: str, limit: int = 5) -> dict:
    return {"results": search_locations(q, limit=limit)}


@app.post("/reports", response_model=GeoJSONFeature, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
) -> GeoJSONFeature:
    report = crud.create_report(db, payload)
    return report_to_feature(report)


@app.put("/reports/{report_id}", response_model=GeoJSONFeature)
def update_report(
    report_id: int,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
) -> GeoJSONFeature:
    report = crud.update_report(db, report_id, payload)
    return report_to_feature(report)


@app.delete("/reports/{report_id}", response_model=GeoJSONFeature)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
) -> GeoJSONFeature:
    report = crud.delete_report(db, report_id)
    return report_to_feature(report)
