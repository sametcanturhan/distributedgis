from datetime import datetime

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from geoalchemy2.shape import to_shape
from sqlalchemy import DateTime, Float, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class RoadReport(Base):
    __tablename__ = "road_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hazard_type: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    lighting_condition: Mapped[str | None] = mapped_column(Text)
    road_surface_condition: Mapped[str | None] = mapped_column(Text)
    weather_condition: Mapped[str | None] = mapped_column(Text)
    temperature: Mapped[float | None] = mapped_column(Float)
    precipitation: Mapped[float | None] = mapped_column(Float)
    rain: Mapped[float | None] = mapped_column(Float)
    snowfall: Mapped[float | None] = mapped_column(Float)
    wind_speed: Mapped[float | None] = mapped_column(Float)
    weather_code: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    geom: Mapped[WKTElement] = mapped_column(Geometry(geometry_type="POINT", srid=4326))

    @property
    def longitude(self) -> float | None:
        if self.geom is None:
            return None
        return to_shape(self.geom).x

    @property
    def latitude(self) -> float | None:
        if self.geom is None:
            return None
        return to_shape(self.geom).y

    @staticmethod
    def point_from_coordinates(longitude: float, latitude: float) -> WKTElement:
        return WKTElement(f"POINT({longitude} {latitude})", srid=4326)
