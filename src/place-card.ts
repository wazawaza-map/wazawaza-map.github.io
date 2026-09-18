import type { Place } from "./types";
import { type AppLocale, categoryLabel } from "./categories";
import { prefectureLabel } from "./prefectures";
import { uiCopy, environmentLabel, formatMinutes } from "./i18n";
import { visitedLabel } from "./visited";
import { escapeHtml } from "./html";
import { knownTagIds, tagLabel } from "./tags";

function placeName(place: Place, locale: AppLocale): string {
  return place.place_translations[0]?.name ?? uiCopy(locale).unnamed;
}

function placeSummary(place: Place): string {
  return place.place_translations[0]?.summary ?? "";
}

export function placeCard(place: Place, locale: AppLocale): string {
  const copy = uiCopy(locale);
  const t = place.place_translations[0];
  const meta = [
    t?.area,
    prefectureLabel(place.prefecture, locale),
    place.station_walk_min != null
      ? locale === "ja"
        ? `${place.station_walk_min}${copy.transitWalk}`
        : `${place.station_walk_min} ${copy.transitWalk}`
      : null,
  ].filter(Boolean);

  return `
      <article
        class="place-card"
        data-place-id="${place.id}"
        data-prefecture="${escapeHtml(place.prefecture)}"
        role="button"
        tabindex="0"
        aria-label="${copy.openPlace} ${escapeHtml(placeName(place, locale))}"
      >
      <div class="place-card__meta">${escapeHtml(meta.join(" · "))}</div>
      <h2>${escapeHtml(placeName(place, locale))}</h2>
      <p>${escapeHtml(placeSummary(place) || t?.interest || copy.descriptionSoon)}</p>
      <div class="chips">
        ${knownTagIds(place.tags).map(tag => `<span>${escapeHtml(tagLabel(tag, locale))}</span>`).join("")}
        ${place.visited || place.visited_at ? `<span class="visited-chip">${escapeHtml(visitedLabel(place.visited_at, locale))}</span>` : ""}
        ${place.category ? `<span>${escapeHtml(categoryLabel(place.category, locale))}</span>` : ""}
        ${place.indoor_outdoor ? `<span>${escapeHtml(environmentLabel(place.indoor_outdoor, locale) ?? "")}</span>` : ""}
        ${place.visit_minutes ? `<span>≈ ${formatMinutes(place.visit_minutes, locale)}</span>` : ""}
      </div>
    </article>
  `;
}
