import json
from urllib.parse import urlencode
from urllib.request import urlopen


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def simplify_weather_condition(weather: dict) -> str:
    precipitation = weather.get("precipitation") or 0
    rain = weather.get("rain") or 0
    snowfall = weather.get("snowfall") or 0
    wind_speed = weather.get("wind_speed") or 0
    weather_code = weather.get("weather_code")

    if snowfall > 0:
        return "snow"
    if rain > 0 or precipitation > 0:
        return "rain"
    if wind_speed >= 35:
        return "windy"
    if weather_code in {0, 1, 2, 3}:
        return "clear"
    return "unknown"


def get_current_weather(latitude: float, longitude: float) -> dict:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(
            [
                "temperature_2m",
                "precipitation",
                "rain",
                "snowfall",
                "wind_speed_10m",
                "weather_code",
            ]
        ),
        "timezone": "auto",
    }
    url = f"{OPEN_METEO_URL}?{urlencode(params)}"

    try:
        with urlopen(url, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {
            "weather_condition": "unknown",
            "temperature": None,
            "precipitation": None,
            "rain": None,
            "snowfall": None,
            "wind_speed": None,
            "weather_code": None,
        }

    current = payload.get("current", {})
    weather = {
        "temperature": current.get("temperature_2m"),
        "precipitation": current.get("precipitation"),
        "rain": current.get("rain"),
        "snowfall": current.get("snowfall"),
        "wind_speed": current.get("wind_speed_10m"),
        "weather_code": current.get("weather_code"),
    }
    weather["weather_condition"] = simplify_weather_condition(weather)
    return weather


def get_hourly_weather(latitude: float, longitude: float, hours: int = 12) -> dict:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(
            [
                "temperature_2m",
                "precipitation_probability",
                "precipitation",
                "rain",
                "snowfall",
                "wind_speed_10m",
                "weather_code",
            ]
        ),
        "forecast_days": 2,
        "timezone": "auto",
    }
    url = f"{OPEN_METEO_URL}?{urlencode(params)}"

    try:
        with urlopen(url, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {
            "latitude": latitude,
            "longitude": longitude,
            "hours": [],
        }

    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])[:hours]
    items = []

    for index, time_value in enumerate(times):
        weather = {
            "time": time_value,
            "temperature": _hourly_value(hourly, "temperature_2m", index),
            "precipitation_probability": _hourly_value(
                hourly, "precipitation_probability", index
            ),
            "precipitation": _hourly_value(hourly, "precipitation", index),
            "rain": _hourly_value(hourly, "rain", index),
            "snowfall": _hourly_value(hourly, "snowfall", index),
            "wind_speed": _hourly_value(hourly, "wind_speed_10m", index),
            "weather_code": _hourly_value(hourly, "weather_code", index),
        }
        weather["weather_condition"] = simplify_weather_condition(weather)
        items.append(weather)

    return {
        "latitude": latitude,
        "longitude": longitude,
        "hours": items,
    }


def _hourly_value(hourly: dict, key: str, index: int):
    values = hourly.get(key, [])
    if index >= len(values):
        return None
    return values[index]
