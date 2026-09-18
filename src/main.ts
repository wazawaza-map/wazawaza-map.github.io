import type { AppLocale } from "./categories";
import { renderPlaces } from "./places-controller";
import { renderError, renderLoading } from "./places-view";
import "./styles.css";
import { getPlaces, getRoutes } from "./supabase";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app not found");
}

async function start(): Promise<void> {
  const requestedLocale = new URLSearchParams(location.search).get("lang");
  const locale: AppLocale = requestedLocale === "ja" || requestedLocale === "en" ? requestedLocale : "ru";
  document.documentElement.lang = locale;
  renderLoading(app!, locale);

  try {
    const places = await getPlaces(locale);
    renderPlaces(app!, places, null, locale);

    // Route statistics are optional: neither latency nor failure should block
    // the map. Update just the count so filters, drawers, and map state survive.
    const routeCount = app!.querySelector<HTMLElement>("#route-count");
    void getRoutes("ru").then((routes) => {
      if (routeCount) routeCount.textContent = String(routes.length);
    }).catch(() => {
      // Keep the unknown-count placeholder; an unavailable count is not zero.
    });
  } catch (error) {
    renderError(app!, error, locale);
  }
}

void start();
