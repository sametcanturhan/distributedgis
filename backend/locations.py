import json
import os
import threading
import time
import unicodedata
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException


NOMINATIM_URL = os.getenv(
    "NOMINATIM_URL",
    "https://nominatim.openstreetmap.org/search",
)
_cache: dict[str, list[dict]] = {}
_request_lock = threading.Lock()
_last_request_at = 0.0


def _normalize(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


def _fetch_nominatim(query: str, limit: int) -> list[dict]:
    global _last_request_at

    params = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": limit,
        "accept-language": "tr,en",
    }
    request = Request(
        f"{NOMINATIM_URL}?{urlencode(params)}",
        headers={
            "User-Agent": "RoadRiskGIS/1.0 (educational local GIS application)",
            "Accept": "application/json",
        },
    )

    with _request_lock:
        elapsed = time.monotonic() - _last_request_at
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        _last_request_at = time.monotonic()

    return payload


def search_locations(query: str, limit: int = 5) -> list[dict]:
    global _last_request_at

    normalized_query = " ".join(query.strip().split())
    if len(normalized_query) < 2:
        raise HTTPException(status_code=422, detail="Enter at least 2 characters.")

    safe_limit = max(1, min(limit, 5))
    cache_key = f"{normalized_query.casefold()}:{safe_limit}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        payload = _fetch_nominatim(normalized_query, safe_limit)

        if 2 <= len(normalized_query) <= 4:
            normalized_prefix = _normalize(normalized_query)
            refined_name = next(
                (
                    value
                    for item in payload
                    for key in ("city", "town", "municipality", "province", "state", "county")
                    if (value := item.get("address", {}).get(key))
                    and _normalize(value).startswith(normalized_prefix)
                    and _normalize(value) != normalized_prefix
                ),
                None,
            )
            if refined_name:
                refined_payload = _fetch_nominatim(refined_name, safe_limit)
                seen_places = {item.get("place_id") for item in refined_payload}
                payload = refined_payload + [
                    item for item in payload if item.get("place_id") not in seen_places
                ]
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail="Location search service is temporarily unavailable.",
        ) from error

    results = [
        {
            "id": item.get("place_id"),
            "name": item.get("display_name"),
            "latitude": float(item["lat"]),
            "longitude": float(item["lon"]),
            "bounding_box": [float(value) for value in item.get("boundingbox", [])],
            "category": item.get("category"),
            "type": item.get("type"),
        }
        for item in payload[:safe_limit]
        if item.get("lat") is not None and item.get("lon") is not None
    ]

    if len(_cache) >= 100:
        _cache.pop(next(iter(_cache)))
    _cache[cache_key] = results
    return results
