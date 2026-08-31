#!/usr/bin/env python3
"""Import legacy WazaWaza places into Supabase.

Safe to re-run: uses upsert for places, RU translations, and relations.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 scripts/import_legacy_places.py

Optional local source file:
  python3 scripts/import_legacy_places.py path/to/japan_places_map_data.json
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
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
    if isinstance(value, str) and len(value) >= 10:
        return value[:10]
    return None


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

    request = urllib.request.Request(
        source,
        headers={"User-Agent": "wazawaza-importer/1.0"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        prefer: str | None = None,
    ) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer

        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=body,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase {method} {path} failed: HTTP {exc.code}: {detail}"
            ) from exc

    def upsert(self, table: str, rows: list[dict[str, Any]], conflict: str) -> None:
        if not rows:
            print(f"  {table}: nothing to import")
            return

        query = urllib.parse.urlencode({"on_conflict": conflict})
        for start in range(0, len(rows), BATCH_SIZE):
            batch = rows[start : start + BATCH_SIZE]
            self.request(
                "POST",
                f"/{table}?{query}",
                payload=batch,
                prefer="resolution=merge-duplicates,return=minimal",
            )
            done = min(start + len(batch), len(rows))
            print(f"  {table}: {done}/{len(rows)}")

    def existing_places(self) -> dict[str, dict[str, Any]]:
        rows = self.request(
            "GET",
            "/places?select=id,legacy_id,slug,status,municipality&legacy_id=not.is.null",
        ) or []
        return {row["legacy_id"]: row for row in rows if row.get("legacy_id")}

    def id_map(self) -> dict[str, int]:
        rows = self.request(
            "GET",
            "/places?select=id,legacy_id&legacy_id=not.is.null",
        ) or []
        return {row["legacy_id"]: row["id"] for row in rows if row.get("legacy_id")}


def validate_source(data: dict[str, Any]) -> list[dict[str, Any]]:
    places = data.get("places")
    if not isinstance(places, list):
        raise SystemExit("Source JSON has no places[] array.")

    ids = [place.get("id") for place in places]
    if any(not place_id for place_id in ids):
        raise SystemExit("Source contains places without id.")
    if len(ids) != len(set(ids)):
        raise SystemExit("Source contains duplicate place ids.")

    missing_coords = [
        place["id"]
        for place in places
        if nested(place, "location", "lat") is None
        or nested(place, "location", "lng") is None
    ]
    if missing_coords:
        raise SystemExit(
            f"Source contains places without coordinates: {missing_coords[:10]}"
        )

    expected = nested(data, "meta", "places")
    if isinstance(expected, int) and expected != len(places):
        raise SystemExit(
            f"meta.places={expected}, but places[] has {len(places)} rows."
        )

    return places


def make_place_rows(
    places: list[dict[str, Any]],
    existing: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for place in places:
        legacy_id = place["id"]
        current = existing.get(legacy_id, {})
        override = COORDINATE_OVERRIDES.get(legacy_id, {})

        rows.append(
            {
                "legacy_id": legacy_id,
                "slug": current.get("slug"),
                "prefecture": override.get("prefecture", (
                    nested(place, "prefecture", "jp")
                    or nested(place, "prefecture", "ru")
                )),
                "municipality": override.get("municipality", current.get("municipality")),
                "latitude": override.get("latitude", nested(place, "location", "lat")),
                "longitude": override.get("longitude", nested(place, "location", "lng")),
                "category": CATEGORY_MAP.get(place.get("category"), "other"),
                "google_maps_url": override.get("google_maps_url", nested(place, "links", "googleMaps")),
                "website_url": override.get("website_url", nested(place, "links", "officialOrSource")),
                "status": override.get("status", current.get("status") or "draft"),
                "tags": place.get("tags") or [],
                "station_walk_min": override.get("station_walk_min", nested(place, "location", "stationWalkMin")),
                "access_modes": nested(place, "access", "modes", default=[]) or [],
                "access_source_url": override.get("access_source_url", nested(place, "access", "sourceUrl")),
                "access_checked_at": clean_date(nested(place, "access", "checkedAt")),
                "visit_minutes": nested(place, "visit", "minutes"),
                "indoor_outdoor": nested(place, "visit", "indoorOutdoor"),
                "reservation": nested(place, "visit", "reservation"),
                "research_confidence": nested(place, "research", "confidence"),
                "research_status": nested(place, "research", "status"),
                "research_checked_at": clean_date(
                    nested(place, "research", "originalCheckedAt")
                ),
                "cluster_id": override.get("cluster_id", nested(place, "cluster", "id")),
                "legacy_data": deep_merge(place, override.get("legacy_patch", {})),
            }
        )

    return rows


def make_translation_rows(
    places: list[dict[str, Any]],
    id_map: dict[str, int],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for place in places:
        override = COORDINATE_OVERRIDES.get(place["id"], {}).get("translation", {})
        rows.append(
            {
                "place_id": id_map[place["id"]],
                "locale": "ru",
                "name": override.get("name", place.get("name") or place["id"]),
                "summary": override.get("summary", place.get("summary")),
                "notes": None,
                "nearest_station": override.get("nearest_station", nested(place, "location", "nearestStation")),
                "access_note": override.get("access_note", nested(place, "access", "note")),
                "area": override.get("area", nested(place, "area", "ru")),
                "interest": override.get("interest", place.get("interest")),
                "seasonality": nested(place, "visit", "seasonality"),
                "price_note": override.get("price_note", nested(place, "visit", "priceNote")),
                "hours_note": override.get("hours_note", nested(place, "visit", "hoursNote")),
                "cluster_name": override.get("cluster_name", nested(place, "cluster", "name")),
            }
        )

    return rows


def make_relation_rows(
    places: list[dict[str, Any]],
    id_map: dict[str, int],
) -> tuple[list[dict[str, Any]], list[tuple[str, str]]]:
    rows: list[dict[str, Any]] = []
    unresolved: list[tuple[str, str]] = []
    seen: set[tuple[int, int, str]] = set()

    for place in places:
        source_legacy_id = place["id"]
        source_id = id_map[source_legacy_id]

        for target_legacy_id in place.get("suggestedWithIds") or []:
            target_id = id_map.get(target_legacy_id)

            if target_id is None:
                unresolved.append((source_legacy_id, target_legacy_id))
                continue

            key = (source_id, target_id, "suggested_with")
            if source_id == target_id or key in seen:
                continue

            seen.add(key)
            rows.append(
                {
                    "place_id": source_id,
                    "related_place_id": target_id,
                    "relation_type": "suggested_with",
                }
            )

    return rows, unresolved


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SECRET_KEY before running.\n"
            "Do not commit the secret key or put it into the frontend."
        )

    print(f"Loading source: {source}")

    data = load_source(source)
    places = validate_source(data)
    routes = data.get("routes") or []

    print(
        f"Validated source: {len(places)} places; "
        f"{len(routes)} routes present."
    )

    db = SupabaseRest(supabase_url, service_role_key)
    existing = db.existing_places()

    print(f"Existing legacy places in Supabase: {len(existing)}")

    print("\n1/3 Upserting places...")
    db.upsert(
        "places",
        make_place_rows(places, existing),
        "legacy_id",
    )

    id_map = db.id_map()
    missing_ids = [place["id"] for place in places if place["id"] not in id_map]
    if missing_ids:
        raise SystemExit(
            f"Import stopped. Supabase ids missing for: {missing_ids[:10]}"
        )

    print("\n2/3 Upserting RU translations...")
    translation_rows = make_translation_rows(places, id_map)
    db.upsert(
        "place_translations",
        translation_rows,
        "place_id,locale",
    )

    print("\n3/3 Upserting suggested-with relations...")
    relation_rows, unresolved = make_relation_rows(places, id_map)
    db.upsert(
        "place_relations",
        relation_rows,
        "place_id,related_place_id,relation_type",
    )

    print("\nIMPORT COMPLETE")
    print(f"  places in source:       {len(places)}")
    print(f"  RU translations:        {len(translation_rows)}")
    print(f"  suggested relations:    {len(relation_rows)}")
    print(f"  unresolved relations:   {len(unresolved)}")
    print(f"  routes skipped for now: {len(routes)}")

    if unresolved:
        print("\nFirst unresolved relation targets:")
        for source_id, target_id in unresolved[:20]:
            print(f"  {source_id} -> {target_id}")

    print(
        "\nNew rows remain draft. Existing slugs/statuses are preserved."
    )


if __name__ == "__main__":
    main()
