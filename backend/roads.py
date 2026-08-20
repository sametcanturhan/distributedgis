from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


ROAD_TABLE_EXISTS_SQL = text("SELECT to_regclass('public.road_network') IS NOT NULL")


def ensure_road_network(db: Session) -> None:
    if not db.scalar(ROAD_TABLE_EXISTS_SQL):
        raise HTTPException(
            status_code=503,
            detail="Local road network is not loaded. Run the road importer first.",
        )


def snap_to_road(
    db: Session,
    latitude: float,
    longitude: float,
    max_distance: float = 12,
) -> dict:
    ensure_road_network(db)
    query = text(
        """
        WITH input AS (
            SELECT ST_SetSRID(ST_Point(:longitude, :latitude), 4326) AS geom
        ), nearest AS (
            SELECT
                roads.osm_id,
                roads.name,
                roads.highway,
                ST_ClosestPoint(roads.geom, input.geom) AS snapped_geom,
                ST_Distance(roads.geom::geography, input.geom::geography) AS distance_meters
            FROM road_network AS roads, input
            WHERE roads.geom && ST_Expand(input.geom, :max_distance / 70000.0)
              AND ST_DWithin(
                roads.geom::geography,
                input.geom::geography,
                :max_distance
            )
            ORDER BY roads.geom <-> input.geom
            LIMIT 1
        )
        SELECT
            osm_id,
            name,
            highway,
            ST_Y(snapped_geom) AS latitude,
            ST_X(snapped_geom) AS longitude,
            distance_meters
        FROM nearest
        """
    )
    row = db.execute(
        query,
        {
            "latitude": latitude,
            "longitude": longitude,
            "max_distance": max_distance,
        },
    ).mappings().first()

    if row is None:
        raise HTTPException(
            status_code=422,
            detail=f"No road found within {int(max_distance)} meters. Select a point on a road.",
        )

    return dict(row)


def get_risk_roads(db: Session) -> dict:
    ensure_road_network(db)
    query = text(
        """
        WITH report_buffers AS (
            SELECT
                reports.*,
                CASE reports.severity
                    WHEN 'critical' THEN 200
                    WHEN 'high' THEN 150
                    WHEN 'medium' THEN 100
                    ELSE 50
                END AS buffer_meters,
                CASE reports.severity
                    WHEN 'critical' THEN 4
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    ELSE 1
                END AS zone_number,
                CASE reports.severity
                    WHEN 'critical' THEN 90
                    WHEN 'high' THEN 70
                    WHEN 'medium' THEN 40
                    ELSE 20
                END AS base_score
            FROM road_reports AS reports
        ), intersections AS (
            SELECT
                roads.osm_id,
                roads.name,
                roads.highway,
                reports.id AS report_id,
                reports.severity,
                reports.buffer_meters,
                reports.zone_number,
                ROUND(
                    ST_Distance(roads.geom::geography, reports.geom::geography)
                )::integer AS distance_meters,
                LEAST(
                    100,
                    ROUND(
                        reports.base_score * CASE
                            WHEN reports.weather_condition = 'snow' THEN 1.5
                            WHEN reports.temperature < 0 THEN 1.4
                            WHEN reports.weather_condition = 'rain' THEN 1.25
                            WHEN reports.weather_condition IN ('wind', 'windy') THEN 1.15
                            ELSE 1.0
                        END
                    )
                )::integer AS risk_score,
                ST_Intersection(
                    roads.geom,
                    ST_Buffer(reports.geom::geography, reports.buffer_meters)::geometry
                ) AS geom
            FROM road_network AS roads
            JOIN report_buffers AS reports
              ON roads.geom && ST_Expand(
                  reports.geom,
                  reports.buffer_meters / 70000.0
              )
             AND ST_DWithin(
                  roads.geom::geography,
                  reports.geom::geography,
                  reports.buffer_meters
              )
        )
        SELECT
            osm_id,
            name,
            highway,
            report_id,
            severity,
            buffer_meters,
            zone_number,
            risk_score,
            distance_meters,
            ROUND(ST_Length(geom::geography)::numeric, 1) AS length_meters,
            ST_AsGeoJSON(geom)::json AS geometry
        FROM intersections
        WHERE NOT ST_IsEmpty(geom)
          AND ST_Length(geom::geography) > 0.1
        ORDER BY risk_score, report_id, osm_id
        """
    )
    rows = db.execute(query).mappings().all()
    features = [
        {
            "type": "Feature",
            "properties": {
                "osm_id": row["osm_id"],
                "name": row["name"],
                "highway": row["highway"],
                "report_id": row["report_id"],
                "severity": row["severity"],
                "buffer_meters": row["buffer_meters"],
                "zone_number": row["zone_number"],
                "zone_label": f"{row['severity'].title()} impact",
                "risk_score": row["risk_score"],
                "distance_meters": row["distance_meters"],
                "length_meters": float(row["length_meters"]),
            },
            "geometry": row["geometry"],
        }
        for row in rows
    ]
    return {"type": "FeatureCollection", "features": features}
