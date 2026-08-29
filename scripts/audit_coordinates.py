#!/usr/bin/env python3
"""Report exact coordinate collisions among published Supabase places."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path


def load_dotenv() -> None:
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def fetch_places() -> list[dict]:
    load_dotenv()
    base = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not base or not key:
        raise SystemExit("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or Supabase equivalents).")
    query = urllib.parse.urlencode({
        "select": "id,legacy_id,latitude,longitude,place_translations(name)",
        "status": "eq.published",
        "order": "id.asc",
    })
    request = urllib.request.Request(
        f"{base.rstrip('/')}/rest/v1/places?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Range": "0-4999"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> int:
    places = fetch_places()
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for place in places:
        key = (str(place["latitude"]), str(place["longitude"]))
        groups[key].append(place)
    duplicates = [(coords, rows) for coords, rows in groups.items() if len(rows) > 1]
    if not duplicates:
        print(f"OK: {len(places)} published places; no exact coordinate collisions.")
        return 0
    print(f"Found {len(duplicates)} coordinate collisions affecting {sum(len(rows) for _, rows in duplicates)} places:")
    for (lat, lon), rows in duplicates:
        print(f"\n{lat}, {lon}")
        for row in rows:
            translations = row.get("place_translations") or []
            name = translations[0].get("name", "") if translations else ""
            print(f"  {row['id']}  {row.get('legacy_id') or '-'}  {name}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
