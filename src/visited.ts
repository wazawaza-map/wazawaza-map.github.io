import type { AppLocale } from "./categories";
import type { Place } from "./types";

export function getVisitedPrefectureCounts(
  places: Pick<Place, "prefecture" | "visited" | "visited_at">[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const place of places) {
    if (place.visited || Boolean(place.visited_at)) {
      counts.set(place.prefecture, (counts.get(place.prefecture) ?? 0) + 1);
    }
  }
  return counts;
}

export function visitedLabel(date: string | null, locale: AppLocale = "ru"): string {
  const label = { ru: "✓ Была здесь", ja: "✓ 訪問済み", en: "✓ Visited" }[locale];
  if (!date) return label;
  const match = /^(\d{4})-(\d{2})/.exec(date);
  return match ? `${label} · ${match[1]}/${match[2]}` : label;
}
