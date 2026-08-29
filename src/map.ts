import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Place } from "./types";

export function createPlacesMap(
  container: HTMLElement,
  places: Place[],
  onSelectPlace?: (place: Place) => void,
  onViewportPlacesChange?: (places: Place[]) => void
) {
  const map = L.map(container, {
    center: [36.2, 138.2],
    zoom: 5,
    minZoom: 4,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const markers = new Map<number, L.Marker>();
  let displayedPlaceIds = new Set(places.map((place) => place.id));
  let selectedPlaceId: number | null = null;

  function updateMarkerSelection(): void {
    for (const [placeId, marker] of markers) {
      const selected = placeId === selectedPlaceId;

      marker.getElement()?.classList.toggle(
        "is-selected-marker",
        selected
      );
      marker.setZIndexOffset(selected ? 1000 : 0);
    }
  }

  function notifyViewportPlaces(): void {
    const mapSize = map.getSize();
    const visiblePlaces = places.filter(
      (place) => {
        if (!displayedPlaceIds.has(place.id)) return false;

        const point = map.latLngToContainerPoint([
          place.latitude,
          place.longitude,
        ]);

        return (
          point.x >= -12 &&
          point.x <= mapSize.x + 12 &&
          point.y >= 0 &&
          point.y <= mapSize.y + 41
        );
      }
    );

    onViewportPlacesChange?.(visiblePlaces);
  }

  map.on("moveend", notifyViewportPlaces);

  for (const place of places) {
    const translation = place.place_translations[0];

    const marker = L.marker([
      place.latitude,
      place.longitude,
    ]).addTo(map);

    marker.bindPopup(`
      <strong>${escapeHtml(translation?.name ?? "Без названия")}</strong>
      ${
        translation?.area
          ? `<br><span>${escapeHtml(translation.area)}</span>`
          : ""
      }
    `);

    marker.on("click", () => {
      onSelectPlace?.(place);
    });

    markers.set(place.id, marker);
  }

  if (places.length > 0) {
    const bounds = L.latLngBounds(
      places.map((place) => [
        place.latitude,
        place.longitude,
      ])
    );

    map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 8,
    });
  }

  return {
    map,

    focusPlace(place: Place) {
      map.setView(
        [place.latitude, place.longitude],
        Math.max(map.getZoom(), 10),
        {
          animate: true,
        }
      );

      markers.get(place.id)?.openPopup();
    },

    selectPlace(place: Place | null) {
      selectedPlaceId = place?.id ?? null;
      updateMarkerSelection();
    },

    focusPlaces(placesToFocus: Place[]) {
      if (placesToFocus.length === 0) return;

      const bounds = L.latLngBounds(
        placesToFocus.map((place) => [
          place.latitude,
          place.longitude,
        ])
      );

      map.flyToBounds(bounds, {
        padding: [30, 30],
        maxZoom: 9,
      });
    },

    displayPlaces(placesToDisplay: Place[]) {
      displayedPlaceIds = new Set(
        placesToDisplay.map((place) => place.id)
      );

      for (const [placeId, marker] of markers) {
        if (displayedPlaceIds.has(placeId)) {
          if (!map.hasLayer(marker)) {
            marker.addTo(map);
          }
        } else {
          marker.removeFrom(map);
        }
      }

      updateMarkerSelection();
      notifyViewportPlaces();
    },

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
