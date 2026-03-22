import { NextResponse } from "next/server";

const NAMES = ["Berkeley", "Oakland", "Alameda", "San Leandro", "Hayward", "Fremont", "Emeryville"];

// Layer 11 = ACS 2025 Incorporated Places. Field is BASENAME (not NAME).
const TIGER_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/11/query";

export async function GET() {
  const names = NAMES.map((n) => `'${n}'`).join(",");
  const params = new URLSearchParams({
    where: `STATE='06' AND BASENAME IN (${names})`,
    outFields: "BASENAME",
    returnGeometry: "true",
    geometryPrecision: "5",
    f: "geojson",
  });

  const res = await fetch(`${TIGER_URL}?${params}`, { next: { revalidate: 86400 } });
  if (!res.ok) {
    return NextResponse.json({ error: "TIGERweb fetch failed", status: res.status }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
