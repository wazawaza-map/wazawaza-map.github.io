import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ADJACENT_PREFECTURES,
  ENGLISH_PREFECTURE_NAMES,
  PREFECTURE_NAMES,
  RUSSIAN_PREFECTURE_NAMES,
} from "../src/prefectures.ts";
import { CATEGORIES } from "../src/categories.ts";

const LOCALES = ["ru", "ja", "en"];
const OUTPUT_DIR = join(process.cwd(), "public", "api");
const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://wazawaza-map.github.io").replace(/\/$/, "");
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before generating the public API.");
}

function prefectureSlug(prefecture) {
  const english = ENGLISH_PREFECTURE_NAMES[prefecture];
  if (!english) throw new Error(`No English name for prefecture: ${prefecture}`);
  return english.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function prefectureName(prefecture, locale) {
  if (locale === "ja") return prefecture;
  if (locale === "en") return ENGLISH_PREFECTURE_NAMES[prefecture] || prefecture;
  return RUSSIAN_PREFECTURE_NAMES[prefecture] || prefecture;
}

function categoryName(category, locale) {
  return CATEGORIES.find((item) => item.id === category)?.[locale] || category || null;
}

function localizedPlace(place, locale) {
  const priority = [locale, "ru", "ja", "en"];
  const translations = place.place_translations || [];
  const translation = priority
    .map((candidate) => translations.find((item) => item.locale === candidate))
    .find(Boolean) || null;

  return {
    id: place.id,
    slug: place.slug,
    name: translation?.name || null,
    locale: translation?.locale || null,
    prefecture: place.prefecture,
    prefecture_name: prefectureName(place.prefecture, locale),
    prefecture_slug: prefectureSlug(place.prefecture),
    municipality: place.municipality,
    area: translation?.area || null,
    summary: translation?.summary || null,
    why_interesting: translation?.interest || null,
    latitude: place.latitude,
    longitude: place.longitude,
    category: place.category,
    category_name: categoryName(place.category, locale),
    tags: place.tags || [],
    access_modes: place.access_modes || [],
    visit_minutes: place.visit_minutes,
    indoor_outdoor: place.indoor_outdoor,
    station_walk_min: place.station_walk_min,
    reservation: place.reservation,
    nearest_station: translation?.nearest_station || null,
    access_note: translation?.access_note || null,
    seasonality: translation?.seasonality || null,
    price_note: translation?.price_note || null,
    hours_note: translation?.hours_note || null,
    google_maps_url: place.google_maps_url,
    website_url: place.website_url,
    visited: Boolean(place.visited || place.visited_at),
    visited_at: place.visited_at,
  };
}

async function fetchPublishedPlaces() {
  const fields = [
    "id", "slug", "prefecture", "municipality", "latitude", "longitude", "category",
    "tags", "access_modes", "visit_minutes", "indoor_outdoor", "station_walk_min",
    "reservation", "google_maps_url", "website_url", "visited", "visited_at",
  ];
  const translations = "place_translations(locale,name,summary,area,nearest_station,access_note,interest,seasonality,price_note,hours_note,cluster_name)";
  const params = new URLSearchParams({
    select: [...fields, translations].join(","),
    status: "eq.published",
    order: "prefecture.asc,id.asc",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/places?${params}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Range: "0-9999",
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json();
}

async function writeJson(relativePath, value) {
  const destination = join(OUTPUT_DIR, relativePath);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collectionPayload({ generatedAt, locale, prefecture = null, includeAdjacent = false, places }) {
  const includedPrefectures = prefecture
    ? [prefecture, ...(includeAdjacent ? ADJACENT_PREFECTURES[prefecture] || [] : [])]
    : PREFECTURE_NAMES;
  return {
    generated_at: generatedAt,
    locale,
    prefecture,
    prefecture_name: prefecture ? prefectureName(prefecture, locale) : null,
    include_adjacent: includeAdjacent,
    included_prefectures: includedPrefectures.map((name) => ({
      id: name,
      name: prefectureName(name, locale),
      slug: prefectureSlug(name),
    })),
    count: places.length,
    places,
  };
}

const rawPlaces = await fetchPublishedPlaces();
const generatedAt = new Date().toISOString();
await rm(OUTPUT_DIR, { recursive: true, force: true });

await writeJson("places.json", {
  generated_at: generatedAt,
  count: rawPlaces.length,
  places: rawPlaces.map(({ place_translations: translations, ...place }) => ({
    ...place,
    visited: Boolean(place.visited || place.visited_at),
    translations,
  })),
});

for (const locale of LOCALES) {
  const places = rawPlaces.map((place) => localizedPlace(place, locale));
  await writeJson(`${locale}/places.json`, collectionPayload({ generatedAt, locale, places }));

  for (const prefecture of PREFECTURE_NAMES) {
    const slug = prefectureSlug(prefecture);
    const direct = places.filter((place) => place.prefecture === prefecture);
    const included = new Set([prefecture, ...(ADJACENT_PREFECTURES[prefecture] || [])]);
    const adjacent = places.filter((place) => included.has(place.prefecture));
    await writeJson(`${locale}/prefectures/${slug}.json`, collectionPayload({
      generatedAt, locale, prefecture, places: direct,
    }));
    await writeJson(`${locale}/prefectures/${slug}-adjacent.json`, collectionPayload({
      generatedAt, locale, prefecture, includeAdjacent: true, places: adjacent,
    }));
  }
}

await writeJson("index.json", {
  name: "WazaWaza Places API",
  description: "Read-only snapshots of published places from the WazaWaza map.",
  generated_at: generatedAt,
  locales: LOCALES,
  count: rawPlaces.length,
  endpoints: {
    all_languages: `${SITE_URL}/api/places.json`,
    localized_places: `${SITE_URL}/api/{locale}/places.json`,
    prefecture: `${SITE_URL}/api/{locale}/prefectures/{prefecture-slug}.json`,
    prefecture_with_adjacent: `${SITE_URL}/api/{locale}/prefectures/{prefecture-slug}-adjacent.json`,
  },
  examples: [
    `${SITE_URL}/api/en/prefectures/ehime.json`,
    `${SITE_URL}/api/en/prefectures/ehime-adjacent.json`,
  ],
  prefectures: PREFECTURE_NAMES.map((prefecture) => ({
    id: prefecture,
    slug: prefectureSlug(prefecture),
    names: {
      ru: prefectureName(prefecture, "ru"),
      ja: prefectureName(prefecture, "ja"),
      en: prefectureName(prefecture, "en"),
    },
  })),
});

console.log(`Generated public API: ${rawPlaces.length} places, ${LOCALES.length * (PREFECTURE_NAMES.length * 2 + 1) + 2} JSON files.`);
