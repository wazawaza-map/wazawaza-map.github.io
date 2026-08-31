import type { Place } from "./types";
import { prefectureLabel } from "./prefectures";
import { categoryLabel, type AppLocale } from "./categories";
import { visitedLabel } from "./visited";
import { environmentLabel, formatDuration, formatMinutes, uiCopy } from "./i18n";

type DrawerOptions = {
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  locale?: AppLocale;
};

export type PlaceDrawer = {
  destroy: () => void;
};

export function openPlaceDrawer(
  place: Place,
  options: DrawerOptions
): PlaceDrawer {
  const locale = options.locale ?? "ru";
  const copy = uiCopy(locale);
  const translation = place.place_translations[0];
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  backdrop.innerHTML = `
    <aside
      class="place-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-drawer-title"
    >
      <button class="place-drawer__close" type="button" aria-label="${copy.close}">×</button>
      <p class="eyebrow">${escapeHtml(categoryLabel(place.category, locale) || copy.place)}</p>
      <h2 id="place-drawer-title">${escapeHtml(translation?.name ?? copy.unnamed)}</h2>
      <p class="place-drawer__location">${escapeHtml(
        [translation?.area, prefectureLabel(place.prefecture, locale)].filter(Boolean).join(" · ")
      )}</p>
      ${place.visited || place.visited_at ? `<p class="visited-chip">${escapeHtml(visitedLabel(place.visited_at, options.locale))}</p>` : ""}
      ${
        translation?.interest || translation?.summary
          ? `<p class="place-drawer__lead">${escapeHtml(
              translation.interest ?? translation.summary ?? ""
            )}</p>`
          : ""
      }
      <div class="place-drawer__facts">
        ${fact(copy.time, formatDuration(place.visit_minutes, locale))}
        ${fact(
          copy.fromStation,
          place.station_walk_min != null
            ? formatMinutes(place.station_walk_min, locale)
            : null
        )}
        ${fact(copy.environment, environmentLabel(place.indoor_outdoor, locale))}
      </div>
      ${detail(copy.nearestStation, translation?.nearest_station)}
      ${detail(copy.directions, translation?.access_note, place.access_modes)}
      ${detail(
        copy.hoursAndSeason,
        translation?.hours_note,
        translation?.seasonality ? [translation.seasonality] : []
      )}
      ${detail(copy.price, translation?.price_note)}
      ${detail(copy.reservation, place.reservation)}
      ${
        place.tags.length
          ? `<div class="place-drawer__tags">${place.tags
              .map((tag) => `<span>${escapeHtml(tag)}</span>`)
              .join("")}</div>`
          : ""
      }
      <div class="place-drawer__actions">
        ${externalLink(place.google_maps_url, copy.openMaps)}
        ${externalLink(place.website_url, copy.officialSite, true)}
      </div>
    </aside>
  `;

  document.body.append(backdrop);

  const drawer = backdrop.querySelector<HTMLElement>(".place-drawer");
  const closeButton = backdrop.querySelector<HTMLButtonElement>(
    ".place-drawer__close"
  );
  let destroyed = false;

  function destroy(notify: boolean): void {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener("keydown", handleKeydown);
    backdrop.remove();

    if (notify) {
      options.onClose();
      options.returnFocusTo?.focus();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      destroy(true);
      return;
    }

    if (event.key !== "Tab" || !drawer) return;

    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>("button, a[href]")
    ).filter((element) => !element.hasAttribute("disabled"));

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) destroy(true);
  });
  closeButton?.addEventListener("click", () => destroy(true));
  document.addEventListener("keydown", handleKeydown);
  closeButton?.focus();

  return {
    destroy: () => destroy(false),
  };
}

function fact(label: string, value: string | null): string {
  if (!value) return "";

  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function detail(
  label: string,
  value: string | null | undefined,
  meta: string[] = []
): string {
  if (!value && meta.length === 0) return "";

  return `
    <section class="place-drawer__detail">
      <h3>${escapeHtml(label)}</h3>
      ${value ? `<p>${escapeHtml(value)}</p>` : ""}
      ${
        meta.length
          ? `<small>${escapeHtml(meta.join(" · "))}</small>`
          : ""
      }
    </section>
  `;
}

function externalLink(
  value: string | null,
  label: string,
  secondary = false
): string {
  const url = safeExternalUrl(value);
  if (!url) return "";

  return `<a${secondary ? ' class="secondary"' : ""} href="${escapeHtml(
    url
  )}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
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
