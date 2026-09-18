import type { CitySearchResult } from "./trip-types";

export async function searchJapaneseCity(query: string): Promise<CitySearchResult | null> {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ja");
  const cacheKey = `wazawaza-city-search:${normalized}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached) as CitySearchResult | null;

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "jp",
    limit: "5",
    addressdetails: "1",
    "accept-language": "ja,ru,en",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!response.ok) throw new Error(`Поиск города временно недоступен (${response.status}).`);
  const results = await response.json() as Array<{
    lat: string;
    lon: string;
    display_name: string;
    type?: string;
    addresstype?: string;
  }>;
  const cityTypes = new Set(["city", "town", "village", "municipality", "administrative"]);
  const match = results.find((result) => cityTypes.has(result.addresstype || result.type || "")) ?? results[0];
  const found = match ? {
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    label: match.display_name,
  } : null;
  localStorage.setItem(cacheKey, JSON.stringify(found));
  return found;
}
