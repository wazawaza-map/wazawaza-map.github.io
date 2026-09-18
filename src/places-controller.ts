import { createPlaceCards } from "./place-cards";
import { type AppLocale } from "./categories";
import { openPlaceDrawer, type PlaceDrawer } from "./drawer";
import { createPlacesMap } from "./map";
import { buildPlacesUrl, createPlacesState } from "./places-url";
import { createPrefectureMap } from "./prefecture-map";
import { pickRandomPlace } from "./random-place";
import {
  getMatchingPlaces,
  getVisiblePlaces
} from "./state";
import type { Place } from "./types";

import { renderPlacesPage } from "./places-view";

export function renderPlaces(app: HTMLDivElement, places: Place[], routeCount: number | null, locale: AppLocale): void {
  const { copy, prefectures, categories, visitedPlaceCounts, visitedPrefectures, initialParams, initialView } = renderPlacesPage(app, places, routeCount, locale);
  const mapElement =
    document.querySelector<HTMLDivElement>("#places-map");

  const prefectureFilter =
  document.querySelector<HTMLSelectElement>("#prefecture-filter");

  const categoryFilter =
    document.querySelector<HTMLSelectElement>("#category-filter");
  const tagFilter = document.querySelector<HTMLSelectElement>("#tag-filter");

  const visitFilter =
    document.querySelector<HTMLSelectElement>("#visit-filter");

  const matchingCount =
    document.querySelector<HTMLElement>("#matching-count");

  const visibleCount =
    document.querySelector<HTMLElement>("#visible-count");

  const searchInput =
    document.querySelector<HTMLInputElement>("#search-filter");

  const searchClear =
    document.querySelector<HTMLButtonElement>("#search-clear");

  const adjacentFilter =
    document.querySelector<HTMLInputElement>("#adjacent-filter");

  const filtersReset =
    document.querySelector<HTMLButtonElement>("#filters-reset");

  const luckyPlace =
    document.querySelector<HTMLButtonElement>("#lucky-place");

  const cardsGrid =
    document.querySelector<HTMLElement>(".grid");

  const cardPagination = document.querySelector<HTMLElement>("#card-pagination");
  const cards = cardsGrid && cardPagination
    ? createPlaceCards(cardsGrid, cardPagination, locale, (place, card) => selectPlace(place, card, true))
    : undefined;

  const resultsEmpty =
    document.querySelector<HTMLElement>("#results-empty");

  const prefecturesView =
    document.querySelector<HTMLElement>("#prefectures-view");

  const prefecturesMapElement =
    document.querySelector<HTMLDivElement>("#prefectures-map");

  const viewButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-map-view]")
  );

  const placesViewElements = Array.from(
    document.querySelectorAll<HTMLElement>('[data-view-content="places"]')
  );

  let placesMap: ReturnType<typeof createPlacesMap> | undefined;
  let placesMapLoading = false;
  let prefectureMap: Awaited<ReturnType<typeof createPrefectureMap>> | undefined;
  let prefectureMapLoading = false;
  let activeView: "places" | "prefectures" = initialView;
  let { state, initialPlace } = createPlacesState(places, prefectures, categories.map((category) => category.id), initialParams);
  let matchingPlaces = getMatchingPlaces(places, state.filters);
  let activeDrawer: PlaceDrawer | undefined;
  let searchTimer: number | undefined;
  if (tagFilter) tagFilter.value = state.filters.tag ?? "";
  if (prefectureFilter) {
    prefectureFilter.value = state.filters.prefecture;
  }

  if (categoryFilter) {
    categoryFilter.value = state.filters.category;
  }

  if (visitFilter) {
    visitFilter.value = state.filters.visitStatus;
  }

  if (searchInput) {
    searchInput.value = state.filters.query;
  }

  if (adjacentFilter) {
    adjacentFilter.checked = state.filters.includeAdjacent;
    adjacentFilter.disabled = !state.filters.prefecture;
  }

  function renderState(): void {
    const visiblePlaces = getVisiblePlaces(
      matchingPlaces,
      state.viewportPlaceIds
    );
    cards?.update(visiblePlaces, state.selectedPlaceId, activeView === "places");

    if (matchingCount) {
      matchingCount.textContent = String(matchingPlaces.length);
    }

    if (visibleCount) {
      visibleCount.textContent = String(visiblePlaces.length);
    }

    if (searchClear) {
      searchClear.hidden = !state.filters.query;
    }


    if (adjacentFilter) {
      adjacentFilter.checked = state.filters.includeAdjacent;
      adjacentFilter.disabled = !state.filters.prefecture;
    }

    if (filtersReset) {
      filtersReset.disabled = !(
        state.filters.prefecture ||
        state.filters.category ||
        state.filters.tag ||
        state.filters.visitStatus ||
        state.filters.query.trim() ||
        state.filters.includeAdjacent
      );
    }

    if (luckyPlace) {
      luckyPlace.disabled = matchingPlaces.length === 0;
    }

    if (cardsGrid) {
      cardsGrid.hidden = activeView === "prefectures" || visiblePlaces.length === 0;
    }

    if (resultsEmpty) {
      resultsEmpty.hidden = activeView === "prefectures" || visiblePlaces.length > 0;

      const heading = resultsEmpty.querySelector<HTMLElement>("h2");
      const description = resultsEmpty.querySelector<HTMLElement>(
        "p:last-child"
      );

      if (heading && description) {
        if (matchingPlaces.length === 0) {
          heading.textContent = copy.noMatches;
          description.textContent = copy.noMatchesHint;
        } else {
          heading.textContent = copy.noPlacesInView;
          description.textContent = copy.noPlacesInViewHint;
        }
      }
    }
  }

  function updateUrl(): void {
    const url = buildPlacesUrl(location.href, state, places, activeView);
    history.replaceState(null, "", url);
    document.querySelectorAll<HTMLAnchorElement>(".language-switch a").forEach((link) => {
      const targetLocale = new URL(link.href).searchParams.get("lang");
      const targetUrl = new URL(url);
      if (targetLocale) targetUrl.searchParams.set("lang", targetLocale);
      link.href = targetUrl.pathname + targetUrl.search;
    });
  }

  function clearSelectionForFilters(): void {
    activeDrawer?.destroy();
    activeDrawer = undefined;
    state = {
      ...state,
      selectedPlaceId: null,
    };
    placesMap?.selectPlace(null);
  }

  function applyFilters(focusResults: boolean): void {
    matchingPlaces = getMatchingPlaces(places, state.filters);
    state = {
      ...state,
      viewportPlaceIds: new Set(
        matchingPlaces.map((place) => place.id)
      ),
    };

    renderState();
    placesMap?.displayPlaces(matchingPlaces);

    if (focusResults && matchingPlaces.length > 0) {
      placesMap?.focusPlaces(matchingPlaces);
    }
  }

  function selectPlace(
    place: Place,
    returnFocusTo?: HTMLElement | null,
    focusMap = false
  ): void {
    activeDrawer?.destroy();
    state = {
      ...state,
      selectedPlaceId: place.id,
    };
    placesMap?.selectPlace(place);
    renderState();
    updateUrl();

    if (focusMap) {
      placesMap?.focusPlace(place);
    }

    activeDrawer = openPlaceDrawer(place, {
      locale,
      returnFocusTo,
      onClose: () => {
        activeDrawer = undefined;
        state = {
          ...state,
          selectedPlaceId: null,
        };
        placesMap?.selectPlace(null);
        renderState();
        updateUrl();
        if (returnFocusTo && !returnFocusTo.isConnected) {
          (cardsGrid?.querySelector<HTMLElement>(`[data-place-id="${place.id}"]`) ?? searchInput)?.focus();
        }
      },
    });
  }

  prefectureFilter?.addEventListener("change", () => {
    clearSelectionForFilters();
    state = {
      ...state,
      filters: {
        ...state.filters,
        prefecture: prefectureFilter.value,
        includeAdjacent: prefectureFilter.value
          ? state.filters.includeAdjacent
          : false,
      },
    };
    updateUrl();
    applyFilters(true);
  });

  categoryFilter?.addEventListener("change", () => {
    clearSelectionForFilters();
    state = {
      ...state,
      filters: {
        ...state.filters,
        category: categoryFilter.value,
      },
    };
    updateUrl();
    applyFilters(true);
  });

  tagFilter?.addEventListener("change", () => {
    clearSelectionForFilters();
    state = { ...state, filters: { ...state.filters, tag: tagFilter.value } };
    updateUrl();
    applyFilters(true);
  });

  visitFilter?.addEventListener("change", () => {
    clearSelectionForFilters();
    state = {
      ...state,
      filters: {
        ...state.filters,
        visitStatus: visitFilter.value === "visited" || visitFilter.value === "unvisited"
          ? visitFilter.value
          : "",
      },
    };
    updateUrl();
    applyFilters(true);
  });

  adjacentFilter?.addEventListener("change", () => {
    clearSelectionForFilters();
    state = {
      ...state,
      filters: {
        ...state.filters,
        includeAdjacent: Boolean(state.filters.prefecture) && adjacentFilter.checked,
      },
    };
    updateUrl();
    applyFilters(true);
  });

  filtersReset?.addEventListener("click", () => {
    window.clearTimeout(searchTimer);
    clearSelectionForFilters();
    state = {
      ...state,
      filters: { prefecture: "", query: "", includeAdjacent: false, category: "", visitStatus: "" },
    };
    if (prefectureFilter) prefectureFilter.value = "";
    if (categoryFilter) categoryFilter.value = "";
    if (tagFilter) tagFilter.value = "";
    if (visitFilter) visitFilter.value = "";
    if (searchInput) searchInput.value = "";
    updateUrl();
    applyFilters(true);
  });

  luckyPlace?.addEventListener("click", () => {
    const visiblePlaces = getVisiblePlaces(
      matchingPlaces,
      state.viewportPlaceIds
    );
    const candidates = visiblePlaces.length > 0
      ? visiblePlaces
      : matchingPlaces;
    const place = pickRandomPlace(
      candidates,
      state.selectedPlaceId
    );

    if (place) {
      selectPlace(place, luckyPlace, true);
    }
  });

  function commitSearch(): void {
    clearSelectionForFilters();
    state = {
      ...state,
      filters: {
        ...state.filters,
        query: searchInput?.value ?? "",
      },
    };
    updateUrl();

    matchingPlaces = getMatchingPlaces(places, state.filters);
    applyFilters(
      Boolean(state.filters.query.trim()) &&
      matchingPlaces.length <= 100
    );
  }

  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(commitSearch, 220);
  });

  searchClear?.addEventListener("click", () => {
    if (!searchInput) return;
    window.clearTimeout(searchTimer);
    searchInput.value = "";
    commitSearch();
    searchInput.focus();
  });

  function initializePlacesMap(): void {
    if (!mapElement || places.length === 0 || placesMap || placesMapLoading) return;
    placesMapLoading = true;

    requestAnimationFrame(() => {
      if (activeView !== "places") {
        placesMapLoading = false;
        return;
      }
      const initializedMap = createPlacesMap(
        mapElement,
        places,
        (place) => {
          selectPlace(
            place,
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
          );
        },
        (visiblePlaces) => {
          state = {
            ...state,
            viewportPlaceIds: new Set(
              visiblePlaces.map((place) => place.id)
            ),
          };
          renderState();
        },
        locale,
        matchingPlaces
      );

      placesMap = initializedMap;
      placesMapLoading = false;

      initializedMap.displayPlaces(matchingPlaces);

      if (state.filters.prefecture) {
        initializedMap.focusPlaces(matchingPlaces);
      } else if (
        state.filters.query.trim() &&
        matchingPlaces.length <= 100
      ) {
        initializedMap.focusPlaces(matchingPlaces);
      }

      if (initialPlace && state.selectedPlaceId === initialPlace.id) {
        selectPlace(initialPlace);
      }

      initializedMap.map.invalidateSize();
    });
  }

  function initializePrefectureOverview(): void {
    if (!prefecturesMapElement || prefectureMap || prefectureMapLoading) return;
    prefectureMapLoading = true;
    prefecturesMapElement.textContent = "";
    prefecturesMapElement.classList.remove("prefectures-map--error");

    requestAnimationFrame(() => {
      void createPrefectureMap(
        prefecturesMapElement,
        visitedPrefectures,
        visitedPlaceCounts,
        (prefecture) => {
          window.clearTimeout(searchTimer);
          clearSelectionForFilters();
          state = {
            ...state,
            filters: {
              prefecture,
              includeAdjacent: false,
              query: "",
              category: "",
              visitStatus: "",
            },
          };
          if (prefectureFilter) prefectureFilter.value = prefecture;
          if (searchInput) searchInput.value = "";
          if (categoryFilter) categoryFilter.value = "";
          if (tagFilter) tagFilter.value = "";
          if (visitFilter) visitFilter.value = "";
          setActiveView("places", false);
          updateUrl();
          applyFilters(true);
        },
        locale
      ).then((initializedMap) => {
        prefectureMap = initializedMap;
        prefectureMapLoading = false;
        initializedMap.refresh();
      }).catch(() => {
        prefectureMapLoading = false;
        prefecturesMapElement.textContent = copy.mapLoadError;
        prefecturesMapElement.classList.add("prefectures-map--error");
      });
    });
  }

  function setActiveView(
    view: "places" | "prefectures",
    syncUrl = true
  ): void {
    activeView = view;
    const showPlaces = view === "places";

    placesViewElements.forEach((element) => {
      element.hidden = !showPlaces;
    });

    if (prefecturesView) {
      prefecturesView.hidden = showPlaces;
    }

    viewButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mapView === view)
      );
    });

    renderState();

    if (showPlaces) {
      initializePlacesMap();
      requestAnimationFrame(() => placesMap?.map.invalidateSize());
    } else {
      clearSelectionForFilters();
      initializePrefectureOverview();
      requestAnimationFrame(() => prefectureMap?.refresh());
    }

    if (syncUrl) updateUrl();
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.mapView;
      if (view === "places" || view === "prefectures") {
        setActiveView(view);
      }
    });
  });

  setActiveView(initialView, false);
}
