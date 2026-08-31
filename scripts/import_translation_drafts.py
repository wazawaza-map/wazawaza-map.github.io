#!/usr/bin/env python3
"""Import reviewed translation drafts into Supabase with a service-role key."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

FIELDS = ("name", "area", "summary", "interest", "nearest_station", "access_note")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("draft", type=Path)
    parser.add_argument("--apply", action="store_true", help="Actually write to Supabase")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing locale rows")
    args = parser.parse_args()
    rows = json.loads(args.draft.read_text(encoding="utf-8"))
    payload = [{"place_id": row["place_id"], "locale": row["locale"], **{field: row.get(field) for field in FIELDS}} for row in rows]
    print(f"Validated {len(payload)} translation rows from {args.draft}.")
    if not args.apply:
        print("Dry run only. Review the file, then add --apply to import.")
        return
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SECRET_KEY. Never expose the secret key to the frontend.")
    query = urllib.parse.urlencode({"on_conflict": "place_id,locale"})
    prefer = "resolution=merge-duplicates,return=minimal" if args.overwrite else "resolution=ignore-duplicates,return=minimal"
    request = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/place_translations?{query}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": prefer},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180):
            pass
    except urllib.error.HTTPError as exc:
        raise RuntimeError(exc.read().decode("utf-8", errors="replace")) from exc
    print(f"Imported {len(payload)} rows. overwrite={args.overwrite}")


if __name__ == "__main__":
    main()
