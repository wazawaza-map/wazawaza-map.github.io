import L from "leaflet";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { AppLocale } from "./categories";
import { prefectureLabel } from "./prefectures";
import { uiCopy } from "./i18n";

type PrefectureProperties = GeoJsonProperties & {
  N03_001?: string;
};

export async function createPrefectureMap(
  container: HTMLElement,
  visitedPrefectures: Set<string>,
  visitedPlaceCounts: Map<string, number>,
  onSelectPrefecture: (prefecture: string) => void,
  locale: AppLocale
) {
  const copy = uiCopy(locale);
  const response = await fetch(`${import.meta.env.BASE_URL}prefectures.geojson`);

  if (!response.ok) {
    throw new Error(`Could not load prefecture boundaries (${response.status})`);
  }

  const data = await response.json() as FeatureCollection<Geometry, PrefectureProperties>;
  const map = L.map(container, {
    center: [36.2, 138.2],
    zoom: 5,
    minZoom: 2,
    maxZoom: 9,
    zoomSnap: 0.25,
    zoomControl: true,
    attributionControl: false,
  });

  let prefectureLayer: L.GeoJSON<PrefectureProperties>;

  prefectureLayer = L.geoJSON<PrefectureProperties>(data, {
    style: (feature) => {
      const prefecture = feature?.properties?.N03_001 ?? "";
      const visited = visitedPrefectures.has(prefecture);

      return {
        color: "#262626",
        weight: 1,
        opacity: 1,
        fillColor: visited ? "#b25735" : "#ded9cc",
        fillOpacity: visited ? 0.88 : 0.72,
      };
    },
    onEachFeature: (feature, layer) => {
      const prefecture = feature.properties?.N03_001;
      if (!prefecture) return;

      const visited = visitedPrefectures.has(prefecture);
      const placeCount = visitedPlaceCounts.get(prefecture) ?? 0;
      const status = visited ? copy.prefectureVisited : copy.prefectureNotVisited;
      const places = copy.visitedPlaces(placeCount);

      layer.bindTooltip(
        `<strong>${escapeHtml(prefectureLabel(prefecture, locale))}</strong><br>${escapeHtml(status)} · ${escapeHtml(places)}`,
        { sticky: true }
      );

      layer.on({
        add: () => {
          if (!(layer instanceof L.Path)) return;
          const element = layer.getElement();
          if (!element) return;
          element.setAttribute("tabindex", "0");
          element.setAttribute("role", "button");
          element.setAttribute("aria-label", `${prefectureLabel(prefecture, locale)}: ${status}, ${places}`);
          element.addEventListener("keydown", (event) => {
            const key = (event as KeyboardEvent).key;
            if (key === "Enter" || key === " ") {
              event.preventDefault();
              onSelectPrefecture(prefecture);
            }
          });
        },
        mouseover: () => {
          if (layer instanceof L.Path) {
            layer.setStyle({ weight: 2.5, fillOpacity: 1 });
            layer.bringToFront();
          }
        },
        mouseout: () => {
          prefectureLayer.resetStyle(layer);
        },
        click: () => onSelectPrefecture(prefecture),
      });
    },
  }).addTo(map);

  let fitted = false;
  function refresh() {
    map.invalidateSize();
    const size = map.getSize();
    if (!fitted && size.x > 0 && size.y > 0) {
      map.fitBounds(prefectureLayer.getBounds(), { padding: [18, 18] });
      fitted = true;
    }
  }
  refresh();

  return {
    map,
    refresh,
    destroy() {
      map.remove();
    },
  };
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
