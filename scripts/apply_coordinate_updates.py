#!/usr/bin/env python3
"""Validate and optionally apply reviewed coordinate updates to Supabase."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def load_env(project_root: Path) -> None:
    path = project_root / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        payload: Any = None,
        prefer: str | None = None,
    ) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base + path,
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase {method} {path} failed: HTTP {exc.code}: {detail}"
            ) from exc


def close(a: float, b: float) -> bool:
    return math.isclose(float(a), float(b), rel_tol=0, abs_tol=1e-9)


def validate_updates(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValueError("Update file must contain a non-empty JSON array.")
    required = {
        "id", "legacy_id", "old_latitude", "old_longitude",
        "new_latitude", "new_longitude", "google_maps_url",
    }
    ids: set[int] = set()
    updates: list[dict[str, Any]] = []
    for index, row in enumerate(value):
        if not isinstance(row, dict) or not required.issubset(row):
            raise ValueError(f"Update #{index + 1} is missing required fields.")
        place_id = int(row["id"])
        if place_id in ids:
            raise ValueError(f"Duplicate place id: {place_id}")
        ids.add(place_id)
        for field in ("old_latitude", "new_latitude"):
            if not 20 <= float(row[field]) <= 50:
                raise ValueError(f"{field} for #{place_id} is outside Japan.")
        for field in ("old_longitude", "new_longitude"):
            if not 120 <= float(row[field]) <= 155:
                raise ValueError(f"{field} for #{place_id} is outside Japan.")
        updates.append(row)
    return updates


def current_places(db: Supabase, updates: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    ids = ",".join(str(row["id"]) for row in updates)
    query = urllib.parse.urlencode({
        "id": f"in.({ids})",
        "select": "id,legacy_id,status,latitude,longitude,google_maps_url,updated_at",
        "order": "id.asc",
    })
    return {row["id"]: row for row in db.request("GET", f"/places?{query}") or []}


def preflight(
    current: dict[int, dict[str, Any]], updates: list[dict[str, Any]]
) -> list[str]:
    conflicts: list[str] = []
    for update in updates:
        place_id = update["id"]
        row = current.get(place_id)
        if not row:
            conflicts.append(f"#{place_id}: no longer exists")
            continue
        if row.get("legacy_id") != update.get("legacy_id"):
            conflicts.append(f"#{place_id}: legacy_id changed")
        if row.get("google_maps_url") != update.get("google_maps_url"):
            conflicts.append(f"#{place_id}: Google Maps URL changed")
        if not close(row["latitude"], update["old_latitude"]) or not close(
            row["longitude"], update["old_longitude"]
        ):
            conflicts.append(f"#{place_id}: coordinates changed after review")
    return conflicts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("updates", type=Path)
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    updates = validate_updates(json.loads(args.updates.read_text(encoding="utf-8")))
    load_env(args.project_root)
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not url or not key:
        raise SystemExit("Supabase server credentials are not configured.")

    db = Supabase(url, key)
    current = current_places(db, updates)
    conflicts = preflight(current, updates)
    if conflicts:
        print(json.dumps({"ok": False, "conflicts": conflicts}, indent=2))
        raise SystemExit(2)

    if not args.apply:
        print(json.dumps({"ok": True, "mode": "dry-run", "ready": len(updates)}))
        return

    applied: list[dict[str, Any]] = []
    for update in updates:
        place_id = update["id"]
        query = urllib.parse.urlencode({
            "id": f"eq.{place_id}",
            "latitude": f"eq.{update['old_latitude']}",
            "longitude": f"eq.{update['old_longitude']}",
            "select": "id,legacy_id,latitude,longitude,updated_at",
        })
        rows = db.request(
            "PATCH",
            f"/places?{query}",
            {
                "latitude": update["new_latitude"],
                "longitude": update["new_longitude"],
            },
            "return=representation",
        ) or []
        if len(rows) != 1:
            raise RuntimeError(
                f"Conditional update for #{place_id} affected {len(rows)} rows; "
                f"{len(applied)} earlier updates were applied."
            )
        applied.append(rows[0])
        print(
            f"updated {len(applied)}/{len(updates)}: "
            f"#{place_id} {update['legacy_id']}",
            flush=True,
        )

    verified = current_places(db, updates)
    failed = [
        row["id"]
        for row in updates
        if not close(verified[row["id"]]["latitude"], row["new_latitude"])
        or not close(verified[row["id"]]["longitude"], row["new_longitude"])
    ]
    print(
        json.dumps(
            {"ok": not failed, "applied": len(applied), "verification_failures": failed}
        )
    )
    if failed:
        raise SystemExit(3)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
