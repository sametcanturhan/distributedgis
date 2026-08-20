from db_models import RoadReport
from models import GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONGeometry


def report_to_feature(report: RoadReport) -> GeoJSONFeature:
    return GeoJSONFeature(
        id=report.id,
        geometry=GeoJSONGeometry(
            coordinates=[report.longitude, report.latitude],
        ),
        properties={
            "hazard_type": report.hazard_type,
            "severity": report.severity,
            "description": report.description,
            "lighting_condition": report.lighting_condition,
            "road_surface_condition": report.road_surface_condition,
            "weather_condition": report.weather_condition,
            "temperature": report.temperature,
            "precipitation": report.precipitation,
            "rain": report.rain,
            "snowfall": report.snowfall,
            "wind_speed": report.wind_speed,
            "weather_code": report.weather_code,
            "latitude": report.latitude,
            "longitude": report.longitude,
            "created_at": report.created_at.isoformat(),
        },
    )


def reports_to_feature_collection(reports: list[RoadReport]) -> GeoJSONFeatureCollection:
    return GeoJSONFeatureCollection(
        features=[report_to_feature(report) for report in reports],
    )
