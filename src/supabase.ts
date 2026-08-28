import type { Place, Route } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function configError(): never {
  throw new Error(
    "Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_PUBLISHABLE_KEY."
  );
}

async function supabaseGet<T>(path: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) configError();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function getPlaces(locale = "ru"): Promise<Place[]> {
  const select = [
    "id",
    "slug",
    "prefecture",
    "municipality",
    "latitude",
    "longitude",
    "category",
    "tags",
    "visit_minutes",
    "indoor_outdoor",
    "station_walk_min",
    "reservation",
    "google_maps_url",
    "website_url",
    "place_translations!inner(locale,name,summary,area,nearest_station,access_note,interest,seasonality,price_note,hours_note,cluster_name)",
  ].join(",");

  const params = new URLSearchParams({
    select,
    "place_translations.locale": `eq.${locale}`,
    order: "prefecture.asc,id.asc",
  });

  return supabaseGet<Place[]>(`places?${params.toString()}`);
}

export async function getRoutes(locale = "ru"): Promise<Route[]> {
  const select = [
    "id",
    "legacy_id",
    "cluster_id",
    "cross_prefecture",
    "base_hub",
    "transport_modes",
    "duration_min",
    "difficulty",
    "without_car",
    "route_translations!inner(locale,name,seasonality,note)",
  ].join(",");

  const params = new URLSearchParams({
    select,
    "route_translations.locale": `eq.${locale}`,
    order: "id.asc",
  });

  return supabaseGet<Route[]>(`routes?${params.toString()}`);
}
