import type { Place } from "./types";
import { adjacentPrefectures } from "./prefectures";
import { categoryLabel, normalizeCategory } from "./categories";

export type PlaceFilters = {
  prefecture: string;
  query: string;
  includeAdjacent: boolean;
  category: string;
};

export type AppState = {
  filters: PlaceFilters;
  viewportPlaceIds: Set<number>;
  selectedPlaceId: number | null;
};

export function createInitialState(places: Place[]): AppState {
  return {
    filters: {
      prefecture: "",
      query: "",
      includeAdjacent: false,
      category: "",
    },
    viewportPlaceIds: new Set(places.map((place) => place.id)),
    selectedPlaceId: null,
  };
}

export function getMatchingPlaces(
  places: Place[],
  filters: PlaceFilters
): Place[] {
  const query = normalizeSearchValue(filters.query);
  const allowedPrefectures = filters.prefecture
    ? new Set([
        filters.prefecture,
        ...(filters.includeAdjacent
          ? adjacentPrefectures(filters.prefecture)
          : []),
      ])
    : null;

  return places.filter((place) => {
    if (allowedPrefectures && !allowedPrefectures.has(place.prefecture)) {
      return false;
    }

    if (filters.category && normalizeCategory(place.category) !== filters.category) {
      return false;
    }

    if (!query) return true;

    const translation = place.place_translations[0];
    const searchText = normalizeSearchValue(
      [
        translation?.name,
        translation?.summary,
        translation?.interest,
        translation?.area,
        translation?.nearest_station,
        place.prefecture,
        place.municipality,
        place.category,
        categoryLabel(place.category),
        ...place.tags,
      ]
        .filter(Boolean)
        .join(" ")
    );

    return searchText.includes(query);
  });
}

export function getVisiblePlaces(
  matchingPlaces: Place[],
  viewportPlaceIds: Set<number>
): Place[] {
  return matchingPlaces.filter((place) =>
    viewportPlaceIds.has(place.id)
  );
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/\s+/g, " ")
    .trim();
}
