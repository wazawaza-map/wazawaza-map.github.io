import { createInitialState, type AppState } from "./state";
import type { Place } from "./types";
import { knownTagIds } from "./tags";

export function createPlacesState(places: Place[], prefectures: string[], categoryIds: string[], initialParams: URLSearchParams) {
  let state = createInitialState(places);
  const requestedPlace = initialParams.get("place");
  const requestedPrefecture = initialParams.get("pref") ?? "";
  const requestedCategory = initialParams.get("cat") ?? "";
  const requestedVisitStatus = initialParams.get("visit") ?? "";
  const requestedQuery = initialParams.get("q") ?? "";
  const requestedAdjacent = initialParams.get("adjacent") === "1";
  const initialPlace = requestedPlace
    ? places.find(
        (place) =>
          place.slug === requestedPlace ||
          String(place.id) === requestedPlace
      ) ?? null
    : null;

  state = {
    ...state,
    filters: {
      prefecture: prefectures.includes(requestedPrefecture)
        ? requestedPrefecture
        : "",
      query: requestedQuery,
      tag: knownTagIds([initialParams.get("tag") ?? ""])[0] ?? "",
      includeAdjacent:
        prefectures.includes(requestedPrefecture) && requestedAdjacent,
      category: categoryIds.includes(requestedCategory)
        ? requestedCategory
        : "",
      visitStatus: requestedVisitStatus === "visited" || requestedVisitStatus === "unvisited"
        ? requestedVisitStatus
        : "",
    },
  };

  if (initialPlace) {
    state = {
      ...state,
      selectedPlaceId: initialPlace.id,
    };
  }

  return { state, initialPlace };
}

export function buildPlacesUrl(currentUrl: string, state: AppState, places: Place[], activeView: "places" | "prefectures"): URL {
  const url = new URL(currentUrl);
  if (state.filters.tag) url.searchParams.set("tag", state.filters.tag);
  else url.searchParams.delete("tag");
  const selectedPlace = state.selectedPlaceId == null
    ? null
    : places.find((place) => place.id === state.selectedPlaceId) ?? null;

  if (selectedPlace) {
    url.searchParams.set(
      "place",
      selectedPlace.slug ?? String(selectedPlace.id)
    );
  } else {
    url.searchParams.delete("place");
  }

  if (state.filters.prefecture) {
    url.searchParams.set("pref", state.filters.prefecture);
  } else {
    url.searchParams.delete("pref");
  }

  if (state.filters.query.trim()) {
    url.searchParams.set("q", state.filters.query.trim());
  } else {
    url.searchParams.delete("q");
  }

  if (state.filters.category) {
    url.searchParams.set("cat", state.filters.category);
  } else {
    url.searchParams.delete("cat");
  }

  if (state.filters.visitStatus) {
    url.searchParams.set("visit", state.filters.visitStatus);
  } else {
    url.searchParams.delete("visit");
  }


  if (state.filters.prefecture && state.filters.includeAdjacent) {
    url.searchParams.set("adjacent", "1");
  } else {
    url.searchParams.delete("adjacent");
  }

  if (activeView === "prefectures") {
    url.searchParams.set("view", "prefectures");
  } else {
    url.searchParams.delete("view");
  }

  return url;
}
