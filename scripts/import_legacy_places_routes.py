#!/usr/bin/env python3
"""Import the legacy WazaWaza dataset into Supabase.

Safe to re-run: uses upsert for places, translations, relations, routes,
route translations, and route places.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 scripts/import_legacy_places.py

Optional local source file:
  python3 scripts/import_legacy_places.py path/to/japan_places_map_data.json
"""

from __future__ import annotations
import json, os, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from typing import Any

DEFAULT_SOURCE = (
    "https://raw.githubusercontent.com/mzmr111/mzmr111.github.io/"
    "a143e8650ec07fc6884afe699da85f82550a4dfa/"
    "japan-places-map/source/public/japan_places_map_data.json"
)
BATCH_SIZE = 100
OVERRIDES_PATH = Path(__file__).with_name("coordinate_overrides.json")
COORDINATE_OVERRIDES = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
CATEGORY_MAP = json.loads(Path(__file__).with_name("category_mapping.json").read_text(encoding="utf-8"))

def nested(obj: dict[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = obj
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current

def clean_date(value: Any) -> str | None:
    return value[:10] if isinstance(value, str) and len(value) >= 10 else None

def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result

def load_source(source: str) -> dict[str, Any]:
    path = Path(source)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    req = urllib.request.Request(source, headers={"User-Agent": "wazawaza-importer/1.1"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))

class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, payload: Any | None = None, prefer: str | None = None) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.base_url + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {path} failed: HTTP {exc.code}: {detail}") from exc

    def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        if not rows:
            print(f"  {table}: nothing to import")
            return
        query = urllib.parse.urlencode({"on_conflict": conflict})
        for start in range(0, len(rows), BATCH_SIZE):
            batch = rows[start:start+BATCH_SIZE]
            self.request(
                "POST",
                f"/{table}?{query}",
                payload=batch,
                prefer="resolution=merge-duplicates,return=minimal",
            )
            print(f"  {table}: {min(start + len(batch), len(rows))}/{len(rows)}")

    def existing_places(self):
        rows = self.request("GET", "/places?select=id,legacy_id,slug,status,municipality&legacy_id=not.is.null") or []
        return {r["legacy_id"]: r for r in rows if r.get("legacy_id")}

    def place_id_map(self):
        rows = self.request("GET", "/places?select=id,legacy_id&legacy_id=not.is.null") or []
        return {r["legacy_id"]: r["id"] for r in rows if r.get("legacy_id")}

    def existing_routes(self):
        rows = self.request("GET", "/routes?select=id,legacy_id,status&legacy_id=not.is.null") or []
        return {r["legacy_id"]: r for r in rows if r.get("legacy_id")}

    def route_id_map(self):
        rows = self.request("GET", "/routes?select=id,legacy_id&legacy_id=not.is.null") or []
        return {r["legacy_id"]: r["id"] for r in rows if r.get("legacy_id")}

def validate_source(data):
    places, routes = data.get("places"), data.get("routes")
    if not isinstance(places, list): raise SystemExit("Source JSON has no places[] array.")
    if not isinstance(routes, list): raise SystemExit("Source JSON has no routes[] array.")
    pids = [p.get("id") for p in places]
    rids = [r.get("id") for r in routes]
    if any(not x for x in pids): raise SystemExit("Source contains places without id.")
    if len(pids) != len(set(pids)): raise SystemExit("Source contains duplicate place ids.")
    if any(not x for x in rids): raise SystemExit("Source contains routes without id.")
    if len(rids) != len(set(rids)): raise SystemExit("Source contains duplicate route ids.")
    missing_coords = [p["id"] for p in places if nested(p,"location","lat") is None or nested(p,"location","lng") is None]
    if missing_coords: raise SystemExit(f"Places without coordinates: {missing_coords[:10]}")
    expected = nested(data, "meta", "places")
    if isinstance(expected, int) and expected != len(places):
        raise SystemExit(f"meta.places={expected}, actual={len(places)}")
    return places, routes

def make_place_rows(places, existing):
    rows = []
    for p in places:
        cur = existing.get(p["id"], {})
        override = COORDINATE_OVERRIDES.get(p["id"], {})
        rows.append({
            "legacy_id": p["id"],
            "slug": cur.get("slug"),
            "prefecture": override.get("prefecture", nested(p,"prefecture","jp") or nested(p,"prefecture","ru")),
            "municipality": override.get("municipality", cur.get("municipality")),
            "latitude": override.get("latitude", nested(p,"location","lat")),
            "longitude": override.get("longitude", nested(p,"location","lng")),
            "category": CATEGORY_MAP.get(p.get("category"), "other"),
            "google_maps_url": override.get("google_maps_url", nested(p,"links","googleMaps")),
            "website_url": override.get("website_url", nested(p,"links","officialOrSource")),
            "status": override.get("status", cur.get("status") or "draft"),
            "tags": p.get("tags") or [],
            "station_walk_min": override.get("station_walk_min", nested(p,"location","stationWalkMin")),
            "access_modes": nested(p,"access","modes",default=[]) or [],
            "access_source_url": override.get("access_source_url", nested(p,"access","sourceUrl")),
            "access_checked_at": clean_date(nested(p,"access","checkedAt")),
            "visit_minutes": nested(p,"visit","minutes"),
            "indoor_outdoor": nested(p,"visit","indoorOutdoor"),
            "reservation": nested(p,"visit","reservation"),
            "research_confidence": nested(p,"research","confidence"),
            "research_status": nested(p,"research","status"),
            "research_checked_at": clean_date(nested(p,"research","originalCheckedAt")),
            "cluster_id": override.get("cluster_id", nested(p,"cluster","id")),
            "legacy_data": deep_merge(p, override.get("legacy_patch", {})),
        })
    return rows

def make_translation_rows(places, id_map):
    rows = []
    for p in places:
        override = COORDINATE_OVERRIDES.get(p["id"], {}).get("translation", {})
        rows.append({
        "place_id": id_map[p["id"]],
        "locale": "ru",
        "name": override.get("name", p.get("name") or p["id"]),
        "summary": override.get("summary", p.get("summary")),
        "notes": None,
        "nearest_station": override.get("nearest_station", nested(p,"location","nearestStation")),
        "access_note": override.get("access_note", nested(p,"access","note")),
        "area": override.get("area", nested(p,"area","ru")),
        "interest": override.get("interest", p.get("interest")),
        "seasonality": nested(p,"visit","seasonality"),
        "price_note": override.get("price_note", nested(p,"visit","priceNote")),
        "hours_note": override.get("hours_note", nested(p,"visit","hoursNote")),
        "cluster_name": override.get("cluster_name", nested(p,"cluster","name")),
        })
    return rows

def make_relation_rows(places, id_map):
    rows, unresolved, seen = [], [], set()
    for p in places:
        sid = id_map[p["id"]]
        for target_legacy in p.get("suggestedWithIds") or []:
            tid = id_map.get(target_legacy)
            if tid is None:
                unresolved.append((p["id"], target_legacy)); continue
            key = (sid, tid, "suggested_with")
            if sid == tid or key in seen: continue
            seen.add(key)
            rows.append({"place_id": sid, "related_place_id": tid, "relation_type": "suggested_with"})
    return rows, unresolved

def make_route_rows(routes, existing):
    rows = []
    for r in routes:
        cur = existing.get(r["id"], {})
        rows.append({
            "legacy_id": r["id"],
            "cluster_id": r.get("clusterId"),
            "cross_prefecture": bool(r.get("crossPrefecture", False)),
            "base_hub": r.get("baseHub"),
            "transport_modes": r.get("transportModes") or [],
            "duration_min": r.get("durationMin"),
            "difficulty": r.get("difficulty"),
            "without_car": r.get("withoutCar"),
            "research_confidence": r.get("researchConfidence"),
            "checked_at": clean_date(r.get("checkedAt")),
            "status": cur.get("status") or "draft",
            "legacy_data": r,
        })
    return rows

def make_route_translation_rows(routes, route_id_map):
    return [{
        "route_id": route_id_map[r["id"]],
        "locale": "ru",
        "name": r.get("name") or r["id"],
        "seasonality": r.get("seasonality"),
        "note": r.get("note"),
    } for r in routes]

def ordered_route_place_ids(route):
    suggested = route.get("suggestedOrder")
    place_ids = route.get("placeIds") or []
    if isinstance(suggested, list) and suggested:
        ordered = [x for x in suggested if isinstance(x, str)]
        seen = set(ordered)
        for pid in place_ids:
            if isinstance(pid, str) and pid not in seen:
                ordered.append(pid); seen.add(pid)
        return ordered
    return [x for x in place_ids if isinstance(x, str)]

def make_route_place_rows(routes, route_id_map, place_id_map):
    rows, unresolved = [], []
    for r in routes:
        rid = route_id_map[r["id"]]
        seen_place_ids = set()
        position = 1
        for legacy_pid in ordered_route_place_ids(r):
            pid = place_id_map.get(legacy_pid)
            if pid is None:
                unresolved.append((r["id"], legacy_pid)); continue
            if pid in seen_place_ids: continue
            seen_place_ids.add(pid)
            rows.append({"route_id": rid, "place_id": pid, "position": position})
            position += 1
    return rows, unresolved

def main():
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SECRET_KEY before running.\n"
            "Do not commit the secret key or put it into the frontend."
        )

    print(f"Loading source: {source}")
    data = load_source(source)
    places, routes = validate_source(data)
    print(f"Validated source: {len(places)} places; {len(routes)} routes.")

    db = SupabaseRest(url, key)

    existing_places = db.existing_places()
    print(f"Existing legacy places in Supabase: {len(existing_places)}")

    print("\n1/6 Upserting places...")
    db.upsert("places", make_place_rows(places, existing_places), "legacy_id")

    place_ids = db.place_id_map()
    missing = [p["id"] for p in places if p["id"] not in place_ids]
    if missing: raise SystemExit(f"Missing imported place ids: {missing[:10]}")

    print("\n2/6 Upserting RU place translations...")
    place_translations = make_translation_rows(places, place_ids)
    db.upsert("place_translations", place_translations, "place_id,locale")

    print("\n3/6 Upserting suggested-with relations...")
    relations, unresolved_rel = make_relation_rows(places, place_ids)
    db.upsert("place_relations", relations, "place_id,related_place_id,relation_type")

    existing_routes = db.existing_routes()
    print(f"\nExisting legacy routes in Supabase: {len(existing_routes)}")

    print("\n4/6 Upserting routes...")
    db.upsert("routes", make_route_rows(routes, existing_routes), "legacy_id")

    route_ids = db.route_id_map()
    missing_routes = [r["id"] for r in routes if r["id"] not in route_ids]
    if missing_routes: raise SystemExit(f"Missing imported route ids: {missing_routes[:10]}")

    print("\n5/6 Upserting RU route translations...")
    route_translations = make_route_translation_rows(routes, route_ids)
    db.upsert("route_translations", route_translations, "route_id,locale")

    print("\n6/6 Upserting route places...")
    route_places, unresolved_route_places = make_route_place_rows(routes, route_ids, place_ids)
    db.upsert("route_places", route_places, "route_id,place_id")

    print("\nIMPORT COMPLETE")
    print(f"  places in source:        {len(places)}")
    print(f"  RU place translations:   {len(place_translations)}")
    print(f"  suggested relations:     {len(relations)}")
    print(f"  unresolved relations:    {len(unresolved_rel)}")
    print(f"  routes in source:        {len(routes)}")
    print(f"  RU route translations:   {len(route_translations)}")
    print(f"  route-place rows:        {len(route_places)}")
    print(f"  unresolved route places: {len(unresolved_route_places)}")

    if unresolved_rel:
        print("\nFirst unresolved suggested-with relations:")
        for a, b in unresolved_rel[:20]:
            print(f"  {a} -> {b}")

    if unresolved_route_places:
        print("\nFirst unresolved route-place refs:")
        for a, b in unresolved_route_places[:20]:
            print(f"  {a} -> {b}")

    print("\nNew rows remain draft. Existing place slugs/statuses and route statuses are preserved.")

if __name__ == "__main__":
    main()
