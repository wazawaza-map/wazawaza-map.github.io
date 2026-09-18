import { CATEGORIES, normalizeCategory, type AppLocale } from "./categories";
import { uiCopy } from "./i18n";
import { PREFECTURE_NAMES, prefectureLabel } from "./prefectures";
import type { Place } from "./types";
import { getVisitedPrefectureCounts } from "./visited";

import { escapeHtml } from "./html";
import { TAGS, knownTagIds, tagFilterCopy } from "./tags";

function languageSwitch(activeLocale: AppLocale): string {
  return `<nav class="language-switch" aria-label="${uiCopy(activeLocale).language}">${(["ru", "ja", "en"] as const)
    .map((locale) => {
      const url = new URL(location.href);
      url.searchParams.set("lang", locale);
      return `<a href="${escapeHtml(url.pathname + url.search)}"${locale === activeLocale ? ' aria-current="page"' : ""}>${locale.toUpperCase()}</a>`;
    }).join("")}</nav>`;
}

export function renderLoading(app: HTMLDivElement, locale: AppLocale): void {
  const copy = uiCopy(locale);
  app!.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>${copy.heroTitle}</h1>
        </div>
        <p class="lede">${copy.heroLead}</p>
      </header>

      <section class="status-card">
        <span class="spinner" aria-hidden="true"></span>
        ${copy.loading}
      </section>
    </main>
  `;
}

export function renderError(app: HTMLDivElement, error: unknown, locale: AppLocale): void {
  const copy = uiCopy(locale);
  const message = error instanceof Error ? error.message : String(error);

  app!.innerHTML = `
    <main class="shell">
      <header class="hero compact">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>${copy.databaseError}</h1>
        </div>
      </header>

      <section class="error-card">
        <strong>Supabase error</strong>
        <pre>${escapeHtml(message)}</pre>
      </section>
    </main>
  `;
}

export function renderPlacesPage(app: HTMLDivElement, places: Place[], routeCount: number | null, locale: AppLocale) {
  const copy = uiCopy(locale);
  const prefectureCount = new Set(
    places
      .map((place) => place.prefecture)
      .filter((prefecture) => PREFECTURE_NAMES.includes(prefecture)),
  ).size;

  const prefectures = Array.from(
    new Set([...PREFECTURE_NAMES, ...places.map((place) => place.prefecture)])
  ).sort((a, b) => prefectureLabel(a, locale).localeCompare(prefectureLabel(b, locale), locale));
  const availableCategoryIds = new Set(
    places.map((place) => normalizeCategory(place.category)).filter(Boolean)
  );
  const categories = CATEGORIES.filter((category) =>
    availableCategoryIds.has(category.id)
  );
  const visitedPlaceCounts = getVisitedPrefectureCounts(places);
  const visitedPrefectures = new Set(
    Array.from(visitedPlaceCounts.keys()).filter(
      (prefecture) => PREFECTURE_NAMES.includes(prefecture)
    )
  );
  const initialParams = new URLSearchParams(location.search);
  const initialView: "places" | "prefectures" = initialParams.get("view") === "prefectures"
    ? "prefectures"
    : "places";

  app!.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          ${languageSwitch(locale)}
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>${copy.heroTitle}</h1>
        </div>
        <p class="lede">${copy.heroLead}</p>
      </header>

      <section class="stats" aria-label="${copy.statsLabel}">
        <div><strong>${places.length}</strong><span>${copy.publishedPlaces}</span></div>
        <div><strong>${prefectureCount}</strong><span>${copy.prefectures}</span></div>
        <div><strong id="route-count">${routeCount ?? "—"}</strong><span>${copy.routes}</span></div>
      </section>

      ${
        places.length === 0
          ? `
            <section class="empty">
              <p class="eyebrow">DATABASE CONNECTED</p>
              <h2>${copy.databaseEmptyTitle}</h2>
              <p>${copy.databaseEmptyText}</p>
            </section>
          `
          : `
            <nav class="view-switch" aria-label="${copy.viewLabel}">
              <button type="button" data-map-view="places" aria-pressed="${initialView === "places"}">${copy.placesView}</button>
              <button type="button" data-map-view="prefectures" aria-pressed="${initialView === "prefectures"}">${copy.prefecturesView}</button>
            </nav>
            <section class="filters" data-view-content="places"${initialView === "prefectures" ? " hidden" : ""}>
              <div class="search-filter">
                <label for="search-filter">${copy.search}</label>
                <div class="search-filter__field">
                  <input
                    id="search-filter"
                    type="search"
                    placeholder="${copy.searchPlaceholder}"
                    autocomplete="off"
                  >
                  <button id="search-clear" type="button" aria-label="${copy.clearSearch}" hidden>×</button>
                </div>
              </div>
              <label>
                <span>${copy.prefecture}</span>
                <select id="prefecture-filter">
                  <option value="">${copy.allPrefectures}</option>
                  ${prefectures
                    .map(
                      (prefecture) =>
                        `<option value="${escapeHtml(prefecture)}">${escapeHtml(prefectureLabel(prefecture, locale))}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <label>
                <span>${copy.category}</span>
                <select id="category-filter">
                  <option value="">${copy.allCategories}</option>
                  ${categories.map((category) =>
                    `<option value="${category.id}">${escapeHtml(category[locale])}</option>`
                  ).join("")}
                </select>
              </label>
              <label>
                <span>${copy.visit}</span>
                <select id="visit-filter">
                  <option value="">${copy.allPlaces}</option>
                  <option value="visited">${copy.visitedOnly}</option>
                  <option value="unvisited">${copy.unvisitedOnly}</option>
                </select>
              </label>
              <label>
                <span>${tagFilterCopy(locale).title}</span>
                <select id="tag-filter">
                  <option value="">${tagFilterCopy(locale).all}</option>
                  ${TAGS.filter(tag => places.some(place => knownTagIds(place.tags).includes(tag.id))).map(tag => `<option value="${tag.id}">${escapeHtml(tag[locale])}</option>`).join("")}
                </select>
              </label>
              <label class="adjacent-filter">
                <input id="adjacent-filter" type="checkbox">
                <span>${copy.adjacent}</span>
              </label>
              <button id="lucky-place" class="filters-lucky" type="button" title="${copy.luckyHint}">${copy.luckyPlace}</button>
              <button id="filters-reset" class="filters-reset" type="button">${copy.resetFilters}</button>
            </section>
            <section class="result-summary" data-view-content="places" aria-live="polite"${initialView === "prefectures" ? " hidden" : ""}>
              <div>
                <strong id="matching-count">${places.length}</strong>
                <span>${copy.matchingFilters}</span>
              </div>
              <div>
                <strong id="visible-count">${places.length}</strong>
                <span>${copy.visibleOnMap}</span>
              </div>
            </section>
            <section class="map-section" data-view-content="places"${initialView === "prefectures" ? " hidden" : ""}>
              <div id="places-map" class="places-map"></div>
            </section>
            <section id="results-empty" class="filter-empty" data-view-content="places" hidden>
              <p class="eyebrow">${copy.nothingFound}</p>
              <h2>${copy.changeSearch}</h2>
              <p>${copy.changeSearchHint}</p>
            </section>
            <section class="grid" data-view-content="places"${initialView === "prefectures" ? " hidden" : ""}></section>
            <nav id="card-pagination" class="card-pagination" data-view-content="places" aria-label="${copy.cardPages}" hidden>
              <button type="button" data-card-page="previous">${copy.previousPage}</button>
              <span data-card-range aria-live="polite"></span>
              <button type="button" data-card-page="next">${copy.nextPage}</button>
            </nav>
            <section id="prefectures-view" class="prefectures-view"${initialView === "places" ? " hidden" : ""}>
              <div class="prefectures-view__intro">
                <div>
                  <p class="eyebrow">${copy.visitedPrefectures}</p>
                  <p>${copy.visitedPrefecturesHint}</p>
                </div>
                <p class="prefectures-view__count"><strong>${visitedPrefectures.size}</strong><span>/ 47</span></p>
              </div>
              <div class="prefectures-map-shell">
                <div id="prefectures-map" class="prefectures-map" aria-label="${copy.visitedPrefectures}"></div>
                <div class="prefectures-map__legend" aria-hidden="true">
                  <span><i class="is-visited"></i>${copy.prefectureVisited}</span>
                  <span><i></i>${copy.prefectureNotVisited}</span>
                </div>
              </div>
              <p class="map-data-credit"><a href="https://github.com/northprint/japan-map-selector" target="_blank" rel="noreferrer">${copy.mapDataCredit}</a></p>
            </section>
          `
      }
    </main>
  `;

  return { copy, prefectures, categories, visitedPlaceCounts, visitedPrefectures, initialParams, initialView };
}
