import "./styles.css";
import { getPlaces, getRoutes } from "./supabase";
import type { Place } from "./types";
import { createPlacesMap } from "./map";
import {
  createInitialState,
  getMatchingPlaces,
  getVisiblePlaces,
} from "./state";
import { openPlaceDrawer, type PlaceDrawer } from "./drawer";
import { prefectureLabel } from "./prefectures";
import { CATEGORIES, categoryLabel, normalizeCategory } from "./categories";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app not found");
}

function placeName(place: Place): string {
  return place.place_translations[0]?.name ?? "Без названия";
}

function placeSummary(place: Place): string {
  return place.place_translations[0]?.summary ?? "";
}

function renderLoading(): void {
  app!.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>Места, ради которых<br>стоит свернуть с маршрута.</h1>
        </div>
        <p class="lede">Не “топ-10 Токио”, а странное, красивое, далёкое и очень конкретное.</p>
      </header>

      <section class="status-card">
        <span class="spinner" aria-hidden="true"></span>
        Загружаю опубликованные места…
      </section>
    </main>
  `;
}

function renderPlaces(places: Place[], routeCount: number, locale: "ru" | "ja" | "en"): void {
  const categoryCopy = {
    ru: { label: "Категория", all: "Все категории" },
    ja: { label: "カテゴリー", all: "すべてのカテゴリー" },
    en: { label: "Category", all: "All categories" },
  }[locale];
  const prefectureCount = new Set(places.map((place) => place.prefecture)).size;

  const cards = places
    .map((place) => {
      const t = place.place_translations[0];
      const meta = [
        t?.area,
        prefectureLabel(place.prefecture),
        place.station_walk_min != null ? `${place.station_walk_min} мин от транспорта` : null,
      ].filter(Boolean);

      return `
          <article
            class="place-card"
            data-place-id="${place.id}"
            data-prefecture="${escapeHtml(place.prefecture)}"
            role="button"
            tabindex="0"
            aria-label="Открыть ${escapeHtml(placeName(place))}"
          >
          <div class="place-card__meta">${escapeHtml(meta.join(" · "))}</div>
          <h2>${escapeHtml(placeName(place))}</h2>
          <p>${escapeHtml(placeSummary(place) || t?.interest || "Описание скоро появится.")}</p>
          <div class="chips">
            ${place.visited || place.visited_at ? `<span class="visited-chip">${escapeHtml(visitedLabel(place.visited_at, locale))}</span>` : ""}
            ${place.category ? `<span>${escapeHtml(categoryLabel(place.category, locale))}</span>` : ""}
            ${place.indoor_outdoor ? `<span>${escapeHtml(place.indoor_outdoor)}</span>` : ""}
            ${place.visit_minutes ? `<span>≈ ${place.visit_minutes} мин</span>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const prefectures = Array.from(
    new Set(places.map((place) => place.prefecture))
  ).sort((a, b) => prefectureLabel(a).localeCompare(prefectureLabel(b), "ru"));
  const availableCategoryIds = new Set(
    places.map((place) => normalizeCategory(place.category)).filter(Boolean)
  );
  const categories = CATEGORIES.filter((category) =>
    availableCategoryIds.has(category.id)
  );

  app!.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          ${languageSwitch(locale)}
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>Места, ради которых<br>стоит свернуть с маршрута.</h1>
        </div>
        <p class="lede">Не “топ-10 Токио”, а странное, красивое, далёкое и очень конкретное.</p>
      </header>

      <section class="stats" aria-label="Статистика">
        <div><strong>${places.length}</strong><span>мест опубликовано</span></div>
        <div><strong>${prefectureCount}</strong><span>префектур</span></div>
        <div><strong>${routeCount}</strong><span>маршрутов</span></div>
      </section>

      ${
        places.length === 0
          ? `
            <section class="empty">
              <p class="eyebrow">DATABASE CONNECTED</p>
              <h2>Связь есть. Публикаций пока нет.</h2>
              <p>Это ожидаемо: после миграции все 726 мест остались в статусе draft.</p>
            </section>
          `
          : `
            <section class="filters">
              <div class="search-filter">
                <label for="search-filter">Поиск</label>
                <div class="search-filter__field">
                  <input
                    id="search-filter"
                    type="search"
                    placeholder="Название, тег, город или станция"
                    autocomplete="off"
                  >
                  <button id="search-clear" type="button" aria-label="Очистить поиск" hidden>×</button>
                </div>
              </div>
              <label>
                <span>Префектура</span>
                <select id="prefecture-filter">
                  <option value="">Все</option>
                  ${prefectures
                    .map(
                      (prefecture) =>
                        `<option value="${escapeHtml(prefecture)}">${escapeHtml(prefectureLabel(prefecture))}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <label>
                <span>${categoryCopy.label}</span>
                <select id="category-filter">
                  <option value="">${categoryCopy.all}</option>
                  ${categories.map((category) =>
                    `<option value="${category.id}">${escapeHtml(category[locale])}</option>`
                  ).join("")}
                </select>
              </label>
              <label class="adjacent-filter">
                <input id="adjacent-filter" type="checkbox">
                <span>Показывать соседние префектуры</span>
              </label>
              <button id="filters-reset" class="filters-reset" type="button">Сбросить фильтры</button>
            </section>
            <section class="result-summary" aria-live="polite">
              <div>
                <strong id="matching-count">${places.length}</strong>
                <span>соответствуют фильтрам</span>
              </div>
              <div>
                <strong id="visible-count">${places.length}</strong>
                <span>видно на карте</span>
              </div>
            </section>
            <section class="map-section">
              <div id="places-map" class="places-map"></div>
            </section>
            <section id="results-empty" class="filter-empty" hidden>
              <p class="eyebrow">НИЧЕГО НЕ НАШЛОСЬ</p>
              <h2>Попробуйте изменить поиск.</h2>
              <p>Можно очистить запрос, выбрать другую префектуру или отдалить карту.</p>
            </section>
            <section class="grid">${cards}</section>
          `
      }
    </main>
  `;

  const mapElement =
    document.querySelector<HTMLDivElement>("#places-map");

  const prefectureFilter =
  document.querySelector<HTMLSelectElement>("#prefecture-filter");

  const categoryFilter =
    document.querySelector<HTMLSelectElement>("#category-filter");

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

  const cardsGrid =
    document.querySelector<HTMLElement>(".grid");

  const resultsEmpty =
    document.querySelector<HTMLElement>("#results-empty");

  let placesMap: ReturnType<typeof createPlacesMap> | undefined;
  let state = createInitialState(places);
  let activeDrawer: PlaceDrawer | undefined;
  let searchTimer: number | undefined;
  const initialParams = new URLSearchParams(location.search);
  const requestedPlace = initialParams.get("place");
  const requestedPrefecture = initialParams.get("pref") ?? "";
  const requestedCategory = initialParams.get("cat") ?? "";
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
      includeAdjacent:
        prefectures.includes(requestedPrefecture) && requestedAdjacent,
      category: categories.some((category) => category.id === requestedCategory)
        ? requestedCategory
        : "",
    },
  };

  if (initialPlace) {
    state = {
      ...state,
      selectedPlaceId: initialPlace.id,
    };
  }

  if (prefectureFilter) {
    prefectureFilter.value = state.filters.prefecture;
  }

  if (categoryFilter) {
    categoryFilter.value = state.filters.category;
  }

  if (searchInput) {
    searchInput.value = state.filters.query;
  }

  if (adjacentFilter) {
    adjacentFilter.checked = state.filters.includeAdjacent;
    adjacentFilter.disabled = !state.filters.prefecture;
  }

  function renderState(): void {
    const matchingPlaces = getMatchingPlaces(places, state.filters);
    const visiblePlaces = getVisiblePlaces(
      matchingPlaces,
      state.viewportPlaceIds
    );
    const visibleIds = new Set(visiblePlaces.map((place) => place.id));

    document
      .querySelectorAll<HTMLElement>(".place-card")
      .forEach((card) => {
        const placeId = Number(card.dataset.placeId);

        card.hidden = !visibleIds.has(placeId);
        card.classList.toggle(
          "is-selected",
          placeId === state.selectedPlaceId
        );
      });

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
        state.filters.query.trim() ||
        state.filters.includeAdjacent
      );
    }

    if (cardsGrid) {
      cardsGrid.hidden = visiblePlaces.length === 0;
    }

    if (resultsEmpty) {
      resultsEmpty.hidden = visiblePlaces.length > 0;

      const heading = resultsEmpty.querySelector<HTMLElement>("h2");
      const description = resultsEmpty.querySelector<HTMLElement>(
        "p:last-child"
      );

      if (heading && description) {
        if (matchingPlaces.length === 0) {
          heading.textContent = "По вашему запросу ничего не найдено.";
          description.textContent =
            "Очистите поиск или выберите другую префектуру.";
        } else {
          heading.textContent = "В этом фрагменте карты мест нет.";
          description.textContent =
            "Отдалите карту или переместитесь в другую область.";
        }
      }
    }
  }

  function updateUrl(): void {
    const url = new URL(location.href);
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


    if (state.filters.prefecture && state.filters.includeAdjacent) {
      url.searchParams.set("adjacent", "1");
    } else {
      url.searchParams.delete("adjacent");
    }

    history.replaceState(null, "", url);
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
    const matchingPlaces = getMatchingPlaces(places, state.filters);
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
      filters: { prefecture: "", query: "", includeAdjacent: false, category: "" },
    };
    if (prefectureFilter) prefectureFilter.value = "";
    if (categoryFilter) categoryFilter.value = "";
    if (searchInput) searchInput.value = "";
    updateUrl();
    applyFilters(true);
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

    const matchingPlaces = getMatchingPlaces(places, state.filters);
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

  renderState();

  if (mapElement && places.length > 0) {
    requestAnimationFrame(() => {
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
        }
      );

      placesMap = initializedMap;

      const matchingPlaces = getMatchingPlaces(places, state.filters);
      initializedMap.displayPlaces(matchingPlaces);

      if (state.filters.prefecture) {
        initializedMap.focusPlaces(matchingPlaces);
      } else if (
        state.filters.query.trim() &&
        matchingPlaces.length <= 100
      ) {
        initializedMap.focusPlaces(matchingPlaces);
      }

      if (initialPlace) {
        selectPlace(initialPlace);
      }

      initializedMap.map.invalidateSize();

      document
        .querySelectorAll<HTMLElement>("[data-place-id]")
        .forEach((card) => {
          function activateCard(): void {
            const placeId = Number(card.dataset.placeId);

            const place = places.find(
              (item) => item.id === placeId
            );

            if (place) {
              selectPlace(place, card, true);
            }
          }

          card.addEventListener("click", activateCard);
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activateCard();
            }
          });
        });
    });
  }
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  app!.innerHTML = `
    <main class="shell">
      <header class="hero compact">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>Не достучались до базы.</h1>
        </div>
      </header>

      <section class="error-card">
        <strong>Supabase error</strong>
        <pre>${escapeHtml(message)}</pre>
      </section>
    </main>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!
  );
}

function languageSwitch(activeLocale: "ru" | "ja" | "en"): string {
  return `<nav class="language-switch" aria-label="Язык">${(["ru", "ja", "en"] as const)
    .map((locale) => {
      const url = new URL(location.href);
      url.searchParams.set("lang", locale);
      return `<a href="${escapeHtml(url.pathname + url.search)}"${locale === activeLocale ? ' aria-current="page"' : ""}>${locale.toUpperCase()}</a>`;
    }).join("")}</nav>`;
}

function visitedLabel(date: string | null, locale: "ru" | "ja" | "en"): string {
  const label = { ru: "✓ Была здесь", ja: "✓ 訪問済み", en: "✓ Visited" }[locale];
  if (!date) return label;
  const match = /^(\d{4})-(\d{2})/.exec(date);
  return match ? `${label} · ${match[1]}/${match[2]}` : label;
}

async function start(): Promise<void> {
  renderLoading();

  try {
    const requestedLocale = new URLSearchParams(location.search).get("lang");
    const locale: "ru" | "ja" | "en" = requestedLocale === "ja" || requestedLocale === "en" ? requestedLocale : "ru";
    const [places, routes] = await Promise.all([getPlaces(locale), getRoutes("ru")]);
    renderPlaces(places, routes.length, locale);
  } catch (error) {
    renderError(error);
  }
}

void start();
