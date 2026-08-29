#!/usr/bin/env python3
"""Generate reviewable JA/EN place-translation drafts with the OpenAI Responses API.

The script never writes to Supabase. Drafts are stored locally and ignored by git.

Examples:
  OPENAI_API_KEY=... python3 scripts/generate_translations.py --locale ja --limit 10
  OPENAI_API_KEY=... python3 scripts/generate_translations.py --locale en --limit 10
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("name", "area", "summary", "interest", "nearest_station", "access_note")


def load_dotenv() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def request_json(url: str, headers: dict[str, str], payload: Any | None = None) -> Any:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {detail}") from exc


def fetch_sources(limit: int, offset: int) -> list[dict[str, Any]]:
    base = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not base or not key:
        raise SystemExit("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.")
    select = "id,legacy_id,prefecture,municipality,legacy_data,place_translations!inner(locale,name,area,summary,interest,nearest_station,access_note)"
    params = urllib.parse.urlencode({
        "select": select,
        "place_translations.locale": "eq.ru",
        "order": "id.asc",
        "limit": str(limit),
        "offset": str(offset),
    })
    return request_json(
        f"{base.rstrip('/')}/rest/v1/places?{params}",
        {"apikey": key, "Authorization": f"Bearer {key}"},
    )


def fetch_existing_place_ids(locale: str) -> set[int]:
    base = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not base or not key:
        return set()
    params = urllib.parse.urlencode({"select": "place_id", "locale": f"eq.{locale}", "limit": "5000"})
    rows = request_json(
        f"{base.rstrip('/')}/rest/v1/place_translations?{params}",
        {"apikey": key, "Authorization": f"Bearer {key}"},
    )
    return {row["place_id"] for row in rows}


def output_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                return content["text"]
    raise RuntimeError(f"Responses API returned no output_text: {response}")


def generate_batch(places: list[dict[str, Any]], locale: str, model: str) -> list[dict[str, Any]]:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("Set OPENAI_API_KEY in your shell or local .env. Never commit it.")
    target = "natural Japanese" if locale == "ja" else "natural English"
    inputs = []
    for place in places:
        source = (place.get("place_translations") or [{}])[0]
        legacy = place.get("legacy_data") or {}
        inputs.append({
            "place_id": place["id"],
            "legacy_id": place.get("legacy_id"),
            "prefecture": place.get("prefecture"),
            "municipality": place.get("municipality"),
            "source_ru": {field: source.get(field) for field in FIELDS},
            "original_japanese": {
                "name": legacy.get("name"),
                "area": (legacy.get("area") or {}).get("jp"),
                "prefecture": (legacy.get("prefecture") or {}).get("jp"),
                "nearest_station": (legacy.get("location") or {}).get("nearestStation"),
            },
        })
    item_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["place_id", *FIELDS],
        "properties": {
            "place_id": {"type": "integer"},
            **{field: {"type": ["string", "null"]} for field in FIELDS},
        },
    }
    payload = {
        "model": model,
        "store": False,
        "instructions": (
            f"Translate Japanese travel-place records from Russian into {target}. "
            "Preserve facts, meaning, Japanese proper names, station names and useful specificity. "
            "Do not invent opening hours, prices, history or access details. "
            "For Japanese, prefer supplied original Japanese names and rewrite Russian prose naturally. "
            "For English, romanize only when no established or supplied name is available. "
            "Return exactly one result for every input place_id. Null remains null."
        ),
        "input": json.dumps(inputs, ensure_ascii=False),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "place_translation_batch",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["translations"],
                    "properties": {"translations": {"type": "array", "items": item_schema}},
                },
            }
        },
    }
    response = request_json(
        "https://api.openai.com/v1/responses",
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        payload,
    )
    translations = json.loads(output_text(response))["translations"]
    expected = {place["id"] for place in places}
    actual = {item["place_id"] for item in translations}
    if expected != actual:
        raise RuntimeError(f"Batch IDs do not match: expected={sorted(expected)}, actual={sorted(actual)}")
    return [{"locale": locale, **item} for item in translations]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", choices=("ja", "en"), required=True)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-5.6-luna"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.limit < 1 or args.batch_size < 1:
        raise SystemExit("--limit and --batch-size must be positive.")
    load_dotenv()
    output = args.output or ROOT / "translation-drafts" / f"places-{args.locale}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(output.read_text(encoding="utf-8")) if output.exists() else []
    done = {item["place_id"] for item in existing} | fetch_existing_place_ids(args.locale)
    sources = [place for place in fetch_sources(args.limit, args.offset) if place["id"] not in done]
    results = list(existing)
    print(f"Generating {len(sources)} {args.locale.upper()} drafts with {args.model}; output={output}")
    for start in range(0, len(sources), args.batch_size):
        batch = sources[start:start + args.batch_size]
        generated = generate_batch(batch, args.locale, args.model)
        results.extend(generated)
        output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  saved {len(results)} drafts")
        if start + args.batch_size < len(sources):
            time.sleep(1)
    print("Draft generation complete. Review the JSON before importing it.")


if __name__ == "__main__":
    main()
