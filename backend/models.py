from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class HazardType(str, Enum):
    POTHOLE = "pothole"
    ACCIDENT = "accident"
    CONSTRUCTION = "construction"
    SLIPPERY_ROAD = "slippery_road"
    VISIBILITY_ISSUE = "visibility_issue"
    FLOODING = "flooding"
    ICE_SNOW = "ice_snow"
    # Legacy values are kept so existing database rows and older clients continue to work.
    ICE = "ice"
    DEBRIS = "debris"
    POOR_VISIBILITY = "poor_visibility"
    OTHER = "other"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class LightingCondition(str, Enum):
    DAYLIGHT = "daylight"
    DUSK_DAWN = "dusk_dawn"
    STREET_LIGHTS = "street_lights"
    POORLY_LIT = "poorly_lit"
    NO_LIGHTING = "no_lighting"


class RoadSurfaceCondition(str, Enum):
    DRY = "dry"
    WET = "wet"
    ICY = "icy"
    SNOW_COVERED = "snow_covered"
    DAMAGED = "damaged"
    GRAVEL = "gravel"


class WeatherCondition(str, Enum):
    CLEAR = "clear"
    RAIN = "rain"
    SNOW = "snow"
    WINDY = "windy"
    UNKNOWN = "unknown"
    # Legacy values are kept so existing clients continue to validate.
    FOG = "fog"
    WIND = "wind"
    OTHER = "other"


class ReportBase(BaseModel):
    hazard_type: HazardType
    severity: Severity
    description: str | None = Field(default=None, max_length=2000)
    lighting_condition: LightingCondition | None = None
    road_surface_condition: RoadSurfaceCondition | None = None
    weather_condition: WeatherCondition | None = None
    temperature: float | None = None
    precipitation: float | None = None
    rain: float | None = None
    snowfall: float | None = None
    wind_speed: float | None = None
    weather_code: int | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ReportCreate(ReportBase):
    pass


class ReportUpdate(BaseModel):
    hazard_type: HazardType | None = None
    severity: Severity | None = None
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    lighting_condition: LightingCondition | None = None
    road_surface_condition: RoadSurfaceCondition | None = None
    weather_condition: WeatherCondition | None = None
    temperature: float | None = None
    precipitation: float | None = None
    rain: float | None = None
    snowfall: float | None = None
    wind_speed: float | None = None
    weather_code: int | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: list[float]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    id: int
    geometry: GeoJSONGeometry
    properties: dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]
