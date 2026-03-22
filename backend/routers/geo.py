import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/geo", tags=["geo"])

TIGERWEB_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/"
    "TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/11/query"
)

EAST_BAY_CITIES = [
    "Berkeley", "Oakland", "Alameda",
    "San Leandro", "Hayward", "Fremont", "Emeryville",
]


@router.get("/east-bay")
async def east_bay_boundaries():
    names = ",".join(f"'{n}'" for n in EAST_BAY_CITIES)
    params = {
        "where": f"STATE='06' AND BASENAME IN ({names})",
        "outFields": "BASENAME",
        "returnGeometry": "true",
        "geometryPrecision": "5",
        "f": "geojson",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(TIGERWEB_URL, params=params, timeout=15)
        resp.raise_for_status()
    return resp.json()
