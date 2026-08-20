import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/gis_project",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_weather_columns() -> None:
    statements = [
        "ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION",
        "ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS precipitation DOUBLE PRECISION",
        "ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS rain DOUBLE PRECISION",
        "ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS snowfall DOUBLE PRECISION",
        "ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS wind_speed DOUBLE PRECISION",
        "ALTER TABLE road_reports ADD COLUMN IF NOT EXISTS weather_code INTEGER",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
