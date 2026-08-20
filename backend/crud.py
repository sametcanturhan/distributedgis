from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from db_models import RoadReport
from models import ReportCreate, ReportUpdate
from roads import snap_to_road
from weather import get_current_weather


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def get_reports(db: Session) -> list[RoadReport]:
    return list(db.scalars(select(RoadReport).order_by(RoadReport.id)))


def get_report(db: Session, report_id: int) -> RoadReport:
    report = db.get(RoadReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    return report


def create_report(db: Session, payload: ReportCreate) -> RoadReport:
    snapped = snap_to_road(db, payload.latitude, payload.longitude)
    weather = get_current_weather(payload.latitude, payload.longitude)
    report = RoadReport(
        hazard_type=_enum_value(payload.hazard_type),
        severity=_enum_value(payload.severity),
        description=payload.description,
        lighting_condition=_enum_value(payload.lighting_condition),
        road_surface_condition=_enum_value(payload.road_surface_condition),
        weather_condition=weather["weather_condition"],
        temperature=weather["temperature"],
        precipitation=weather["precipitation"],
        rain=weather["rain"],
        snowfall=weather["snowfall"],
        wind_speed=weather["wind_speed"],
        weather_code=weather["weather_code"],
        geom=RoadReport.point_from_coordinates(snapped["longitude"], snapped["latitude"]),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def update_report(db: Session, report_id: int, payload: ReportUpdate) -> RoadReport:
    report = get_report(db, report_id)
    updates = payload.model_dump(exclude_unset=True)

    latitude = updates.pop("latitude", None)
    longitude = updates.pop("longitude", None)

    for field, value in updates.items():
        setattr(report, field, _enum_value(value) if value is not None else None)

    if latitude is not None or longitude is not None:
        new_latitude = latitude if latitude is not None else report.latitude
        new_longitude = longitude if longitude is not None else report.longitude
        snapped = snap_to_road(db, new_latitude, new_longitude)
        report.geom = RoadReport.point_from_coordinates(
            snapped["longitude"], snapped["latitude"]
        )

    db.commit()
    db.refresh(report)
    return report


def delete_report(db: Session, report_id: int) -> RoadReport:
    report = get_report(db, report_id)
    db.delete(report)
    db.commit()
    return report
