import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet-icons";
import type { Place } from "./types";
import { visitedLabel } from "./visited";
import type { AppLocale } from "./categories";
import { uiCopy } from "./i18n";
import { escapeHtml } from "./html";
import { CLUSTER_MAX_ZOOM, createPlaceIndex } from "./place-index";

export function createPlacesMap(
  container: HTMLElement,
  places: Place[],
  onSelectPlace?: (place: Place) => void,
  onViewportPlacesChange?: (places: Place[]) => void,
  locale: AppLocale = "ru",
  initialPlaces = places,
) {
  const copy = uiCopy(locale);
  const map = L.map(container, {
    center: [36.2, 138.2], zoom: 5, minZoom: 4, maxZoom: 19,
    worldCopyJump: true,
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const byId = new Map(places.map((place) => [place.id, place]));
  const order = new Map(places.map((place, index) => [place.id, index]));
  let displayedPlaces = initialPlaces;
  let index = createPlaceIndex(displayedPlaces);
  const markers = new Map<string, L.Marker>();
  let selectedPlace: Place | null = null;
  let selectedMarker: L.Marker | undefined;

  function placeMarker(place: Place): L.Marker {
    const translation = place.place_translations[0];
    const name = translation?.name ?? copy.unnamed;
    const marker = L.marker([place.latitude, place.longitude], { title: name, alt: name });
    // Popup content is only built if the marker is actually opened.
    marker.bindPopup(() => `
      <strong>${escapeHtml(name)}</strong>
      ${translation?.area ? `<br><span>${escapeHtml(translation.area)}</span>` : ""}
      ${place.visited || place.visited_at ? `<br><span class="visited-popup">${escapeHtml(visitedLabel(place.visited_at, locale))}</span>` : ""}
    `);
    marker.on("add", () => {
      marker.getElement()?.classList.toggle("is-visited-marker", Boolean(place.visited || place.visited_at));
    });
    marker.on("click", () => {
      onSelectPlace?.(place);
      selectedMarker?.openPopup();
    });
    return marker;
  }

  function refreshMarkers(): void {
    const bounds = map.getBounds().pad(0.15);
    const features = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      Math.floor(map.getZoom()),
    );
    const keep = new Set<string>();
    for (const feature of features) {
      const props = feature.properties;
      const clustered = "cluster" in props && props.cluster;
      if (!clustered && props.placeId === selectedPlace?.id) continue;
      const key = clustered ? `cluster:${props.cluster_id}` : `place:${props.placeId}`;
      keep.add(key);
      if (markers.has(key)) continue;
      let marker: L.Marker;
      if (clustered) {
        const clusterId = props.cluster_id;
        const label = copy.clusterLabel(props.point_count);
        marker = L.marker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], {
          title: label,
          alt: label,
          icon: L.divIcon({
            className: "place-cluster",
            html: `<span>${props.point_count_abbreviated}</span>`,
            iconSize: [44, 44], iconAnchor: [22, 22],
          }),
        });
        marker.on("click", () => {
          map.setView(marker.getLatLng(), Math.min(index.getClusterExpansionZoom(clusterId), 19));
        });
      } else {
        const place = byId.get(props.placeId);
        if (!place) continue;
        marker = placeMarker(place);
      }
      markers.set(key, marker);
      marker.addTo(map);
    }
    for (const [key, marker] of markers) {
      if (!keep.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
  }

  function notifyViewportPlaces(): void {
    const size = map.getSize();
    const northwest = map.containerPointToLatLng([-12, 0]);
    const southeast = map.containerPointToLatLng([size.x + 12, size.y + 41]);
    // Query unclustered points for counts/cards, not the cluster centroids.
    const visible = index.getClusters(
      [northwest.lng, southeast.lat, southeast.lng, northwest.lat],
      CLUSTER_MAX_ZOOM + 1,
    ).flatMap((feature) => {
      const place = byId.get(feature.properties.placeId);
      return place ? [place] : [];
    });
    visible.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    onViewportPlacesChange?.(visible);
  }

  function refresh(): void {
    refreshMarkers();
    notifyViewportPlaces();
  }
  map.on("moveend resize", refresh);

  if (initialPlaces.length) {
    map.fitBounds(L.latLngBounds(initialPlaces.map((place) => [place.latitude, place.longitude])), {
      padding: [30, 30], maxZoom: 8,
    });
  }
  refreshMarkers();

  return {
    map,
    focusPlace(place: Place) {
      map.setView([place.latitude, place.longitude], Math.max(map.getZoom(), 10), { animate: true });
      selectedMarker?.openPopup();
    },
    selectPlace(place: Place | null) {
      if (selectedPlace?.id === place?.id) return;
      selectedMarker?.remove();
      selectedMarker = undefined;
      selectedPlace = place;
      if (place) {
        selectedMarker = placeMarker(place).addTo(map);
        selectedMarker.getElement()?.classList.add("is-selected-marker");
        selectedMarker.setZIndexOffset(1000);
      }
      refreshMarkers();
    },
    focusPlaces(placesToFocus: Place[]) {
      if (!placesToFocus.length) return;
      map.flyToBounds(L.latLngBounds(placesToFocus.map((place) => [place.latitude, place.longitude])), {
        padding: [30, 30], maxZoom: 9,
      });
    },
    displayPlaces(placesToDisplay: Place[]) {
      if (placesToDisplay !== displayedPlaces) {
        displayedPlaces = placesToDisplay;
        index = createPlaceIndex(displayedPlaces);
        // Cluster IDs belong to one immutable index only.
        for (const marker of markers.values()) marker.remove();
        markers.clear();
      }
      refresh();
    },
    destroy() { map.remove(); },
  };
}
