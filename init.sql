CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_reports (
    id SERIAL PRIMARY KEY,
    hazard_type TEXT,
    severity TEXT,
    description TEXT,
    lighting_condition TEXT,
    road_surface_condition TEXT,
    weather_condition TEXT,
    temperature DOUBLE PRECISION,
    precipitation DOUBLE PRECISION,
    rain DOUBLE PRECISION,
    snowfall DOUBLE PRECISION,
    wind_speed DOUBLE PRECISION,
    weather_code INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    geom GEOMETRY(Point, 4326)
);

ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION;
ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS precipitation DOUBLE PRECISION;
ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS rain DOUBLE PRECISION;
ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS snowfall DOUBLE PRECISION;
ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS wind_speed DOUBLE PRECISION;
ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS weather_code INTEGER;

CREATE INDEX IF NOT EXISTS road_reports_geom_idx
    ON road_reports
    USING GIST (geom);
