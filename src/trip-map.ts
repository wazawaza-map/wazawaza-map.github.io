import L from "leaflet";
import { escapeHtml } from "./html";
import { insertRow, updateRow } from "./trip-api";
import { searchJapaneseCity } from "./trip-city-search";
import { TRANSPORT_MODE_LABELS, placeName, setupMessage } from "./trip-format";
import type { Trip, TripDestination, TripPlannerOptions, TripPlannerPlace, TripRouteData, TripStop } from "./trip-types";
import { tripUiState } from "./trip-ui-state";

let activeTripMap: L.Map | undefined;
export function destroyTripMap(): void {
  const map = activeTripMap;
  activeTripMap = undefined;
  if (!map) return;
  map.stop();
  map.off();
  map.remove();
}

export function initializeTripMap(options: TripPlannerOptions, trip: Trip, tripRoute: TripRouteData | null, places: Map<number, TripPlannerPlace>, form: HTMLFormElement, persistChangedForm: () => Promise<void>, refreshEditor: () => Promise<void>) {
  const destinations = tripRoute?.destinations ?? [];
  const legs = tripRoute?.legs ?? [];
  const error = form.querySelector<HTMLElement>(".admin-error");
  let destinationPlacementId: number | null = null;
  let suggestedCityMarker: L.Marker | undefined;
  const routePoints = trip.trip_days.flatMap((day) => day.trip_stops.flatMap((stop) => {
    const place = stop.place_id ? places.get(stop.place_id) : undefined;
    return place ? [{ day, stop, place }] : [];
  }));
  const mapElement = document.querySelector<HTMLElement>("#admin-trip-map");
  const mapDaySelect = document.querySelector<HTMLSelectElement>("#trip-map-day");
  const mapLayerSelect = document.querySelector<HTMLSelectElement>("#trip-map-layer");
  const mapMessage = document.querySelector<HTMLElement>("#trip-map-message");
  let mapClickBusy = false;
  let updateMapLayers: ((fitBounds: boolean) => void) | undefined;
  mapDaySelect?.addEventListener("change", () => {
    tripUiState.savedTripMapDay = { tripId: trip.id, dayId: Number(mapDaySelect.value) };
    if (mapMessage) mapMessage.textContent = "";
    updateMapLayers?.(true);
  });
  mapLayerSelect?.addEventListener("change", () => {
    tripUiState.savedTripMapLayer = { tripId: trip.id, mode: mapLayerSelect.value as "overview" | "day" | "all" };
    updateMapLayers?.(true);
  });
  if (mapElement) {
    const map = L.map(mapElement, { minZoom: 4 });
    activeTripMap = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(activeTripMap);
    const cityLayer = L.layerGroup();
    const cityMarkers = new Map<number, L.Marker>();
    const dayLayers = new Map<number, L.LayerGroup>();
    const transportDayLayers = new Map<number, L.LayerGroup>();
    const dayLatLngs = new Map<number, L.LatLngExpression[]>();

    const addPlaceFromMap = async (place: TripPlannerPlace): Promise<void> => {
      if (mapClickBusy) return;
      if (destinationPlacementId) {
        if (mapMessage) mapMessage.textContent = "Для города нажмите на свободное место карты, не на маркер достопримечательности.";
        return;
      }
      const dayId = Number(mapDaySelect?.value);
      const day = trip.trip_days.find((item) => item.id === dayId);
      if (!day) return;
      tripUiState.savedTripMapDay = { tripId: trip.id, dayId: day.id };
      if (day.trip_stops.some((stop) => stop.place_id === place.id)) {
        if (mapMessage) mapMessage.textContent = `«${placeName(place)}» уже добавлено в день ${day.day_number}.`;
        return;
      }
      mapClickBusy = true;
      if (mapMessage) mapMessage.textContent = `Добавляю «${placeName(place)}»…`;
      try {
        await persistChangedForm();
        await insertRow<TripStop>(options, "trip_stops", {
          trip_day_id: day.id,
          place_id: place.id,
          custom_name: null,
          position: Math.max(0, ...day.trip_stops.map((stop) => stop.position)) + 1,
        });
        await refreshEditor();
      } catch (mapError) {
        mapClickBusy = false;
        const message = setupMessage(mapError);
        if (mapMessage) mapMessage.textContent = message;
        if (error) error.textContent = message;
      }
    };

    for (const place of options.places) {
      const marker = L.circleMarker([place.latitude, place.longitude], {
        radius: 4,
        weight: 1,
        color: "#f4f1e9",
        fillColor: "#d14b36",
        fillOpacity: 0.76,
      }).bindTooltip(`<strong>${escapeHtml(placeName(place))}</strong><br>${escapeHtml(place.prefecture)}<br><small>Нажмите, чтобы добавить</small>`).addTo(activeTripMap);
      marker.on("click", () => void addPlaceFromMap(place));
    }

    const cityLatLngs: L.LatLngExpression[] = [];
    const coordinateCounts = new Map<string, number>();
    const coordinateOccurrences = new Map<string, number>();
    destinations.forEach((destination) => {
      if (destination.latitude == null || destination.longitude == null) return;
      const key = `${destination.latitude}:${destination.longitude}`;
      coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
    });
    for (const [index, destination] of destinations.entries()) {
      if (destination.latitude == null || destination.longitude == null) continue;
      const point: L.LatLngExpression = [destination.latitude, destination.longitude];
      const coordinateKey = `${destination.latitude}:${destination.longitude}`;
      const occurrence = coordinateOccurrences.get(coordinateKey) ?? 0;
      const duplicateCount = coordinateCounts.get(coordinateKey) ?? 1;
      coordinateOccurrences.set(coordinateKey, occurrence + 1);
      const horizontalOffset = duplicateCount > 1 ? (occurrence - (duplicateCount - 1) / 2) * 24 : 0;
      cityLatLngs.push(point);
      const marker = L.marker(point, {
        draggable: true,
        title: destination.name,
        icon: L.divIcon({
          className: "admin-trip-city-marker-wrap",
          html: `<span class="admin-trip-city-marker"><b>${index + 1}</b></span>`,
          iconSize: [38, 38],
          iconAnchor: [19 - horizontalOffset, 19],
        }),
      }).bindTooltip(`<strong>${index + 1}. ${escapeHtml(destination.name)}</strong><br><small>Перетащите, чтобы уточнить точку</small>`).addTo(cityLayer);
      cityMarkers.set(destination.id, marker);
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        void saveDestinationCoordinates(destination, point.lat, point.lng);
      });
    }
    if (cityLatLngs.length > 1) {
      L.polyline(cityLatLngs, { color: "#245e82", weight: 4, opacity: 0.76, dashArray: "8 7" }).addTo(cityLayer);
    }
    const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
    for (const leg of legs) {
      if (!leg.trip_day_id) continue;
      const from = destinationById.get(leg.from_destination_id);
      const to = destinationById.get(leg.to_destination_id);
      if (from?.latitude == null || from.longitude == null || to?.latitude == null || to.longitude == null) continue;
      const layer = transportDayLayers.get(leg.trip_day_id) ?? L.layerGroup();
      const time = leg.departure_time || leg.arrival_time
        ? `${(leg.departure_time || "?").slice(0, 5)}–${(leg.arrival_time || "?").slice(0, 5)}`
        : "";
      L.polyline([[from.latitude, from.longitude], [to.latitude, to.longitude]], {
        color: "#245e82",
        weight: 5,
        opacity: 0.88,
      }).bindTooltip(`<strong>${escapeHtml(from.name)} → ${escapeHtml(to.name)}</strong><br>${escapeHtml(TRANSPORT_MODE_LABELS[leg.mode])}${time ? ` · ${escapeHtml(time)}` : ""}`).addTo(layer);
      transportDayLayers.set(leg.trip_day_id, layer);
    }

    activeTripMap.on("click", (event) => {
      if (!destinationPlacementId || mapClickBusy) return;
      const destination = destinations.find((item) => item.id === destinationPlacementId);
      if (!destination) return;
      mapClickBusy = true;
      if (mapMessage) mapMessage.textContent = `Ставлю «${destination.name}» на карту…`;
      void saveDestinationCoordinates(destination, event.latlng.lat, event.latlng.lng).catch((mapError) => {
        mapClickBusy = false;
        const message = setupMessage(mapError);
        if (mapMessage) mapMessage.textContent = message;
        if (error) error.textContent = message;
      });
    });

    const latLngs: L.LatLngExpression[] = [];
    for (const { day, stop, place } of routePoints) {
      const point: L.LatLngExpression = [place.latitude, place.longitude];
      latLngs.push(point);
      const dayLayer = dayLayers.get(day.id) ?? L.layerGroup();
      const points = dayLatLngs.get(day.id) ?? [];
      points.push(point);
      dayLayers.set(day.id, dayLayer);
      dayLatLngs.set(day.id, points);
      const label = `${day.day_number}.${stop.position}`;
      const marker = L.marker(point, {
        title: placeName(place),
        icon: L.divIcon({
          className: "admin-trip-marker-wrap",
          html: `<span class="admin-trip-marker">${label}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      }).bindTooltip(`<strong>${escapeHtml(label)} ${escapeHtml(placeName(place))}</strong><br>${escapeHtml(place.prefecture)}<br><small>Нажмите, чтобы добавить в выбранный день</small>`).addTo(dayLayer);
      marker.on("click", () => void addPlaceFromMap(place));
    }
    for (const [dayId, points] of dayLatLngs) {
      if (points.length > 1) L.polyline(points, { color: "#d14b36", weight: 3, opacity: 0.72 }).addTo(dayLayers.get(dayId)!);
    }

    const visiblePoints = (): L.LatLngExpression[] => {
      const mode = (mapLayerSelect?.value || "all") as "overview" | "day" | "all";
      if (mode === "overview") return cityLatLngs;
      if (mode === "day") {
        const dayId = Number(mapDaySelect?.value);
        const destinationId = trip.trip_days.find((day) => day.id === dayId)?.destination_id;
        const relevantDestinationIds = new Set<number>(destinationId ? [destinationId] : []);
        destinations.filter((destination) => destination.trip_day_id === dayId).forEach((destination) => relevantDestinationIds.add(destination.id));
        legs.filter((leg) => leg.trip_day_id === dayId).forEach((leg) => {
          relevantDestinationIds.add(leg.from_destination_id);
          relevantDestinationIds.add(leg.to_destination_id);
        });
        const cityPoint: L.LatLngExpression[] = [...relevantDestinationIds].flatMap((id) => {
          const destination = destinationById.get(id);
          return destination?.latitude != null && destination.longitude != null ? [[destination.latitude, destination.longitude]] : [];
        });
        return [...cityPoint, ...(dayLatLngs.get(dayId) ?? [])];
      }
      return [...cityLatLngs, ...latLngs];
    };
    updateMapLayers = (fitBounds) => {
      cityLayer.remove();
      cityMarkers.forEach((marker) => marker.remove());
      dayLayers.forEach((layer) => layer.remove());
      transportDayLayers.forEach((layer) => layer.remove());
      const mode = (mapLayerSelect?.value || "all") as "overview" | "day" | "all";
      if (mode === "overview" || mode === "all") cityLayer.addTo(map);
      if (mode === "day") {
        const dayId = Number(mapDaySelect?.value);
        const destinationId = trip.trip_days.find((day) => day.id === dayId)?.destination_id;
        const relevantDestinationIds = new Set<number>(destinationId ? [destinationId] : []);
        destinations.filter((destination) => destination.trip_day_id === dayId).forEach((destination) => relevantDestinationIds.add(destination.id));
        legs.filter((leg) => leg.trip_day_id === dayId).forEach((leg) => {
          relevantDestinationIds.add(leg.from_destination_id);
          relevantDestinationIds.add(leg.to_destination_id);
        });
        relevantDestinationIds.forEach((id) => cityMarkers.get(id)?.addTo(map));
        transportDayLayers.get(dayId)?.addTo(map);
        dayLayers.get(dayId)?.addTo(map);
      }
      if (mode === "all") dayLayers.forEach((layer) => layer.addTo(map));
      if (fitBounds) {
        const points = visiblePoints();
        if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: mode === "overview" ? 10 : 13 });
      }
    };
    updateMapLayers(false);
    if (tripUiState.savedTripMapView?.tripId === trip.id) {
      activeTripMap.setView(tripUiState.savedTripMapView.center, tripUiState.savedTripMapView.zoom);
    } else if (visiblePoints().length) {
      activeTripMap.fitBounds(L.latLngBounds(visiblePoints()), { padding: [36, 36], maxZoom: mapLayerSelect?.value === "overview" ? 10 : 13 });
    } else {
      activeTripMap.setView([36.2, 138.2], 5);
    }
    activeTripMap.on("moveend", () => {
      if (!activeTripMap) return;
      const center = activeTripMap.getCenter();
      tripUiState.savedTripMapView = { tripId: trip.id, center: [center.lat, center.lng], zoom: activeTripMap.getZoom() };
    });
    requestAnimationFrame(() => {
      if (activeTripMap === map) map.invalidateSize();
    });
  }

  async function saveDestinationCoordinates(destination: TripDestination, latitude: number, longitude: number): Promise<void> {
    await persistChangedForm();
    if (activeTripMap) {
      const center = activeTripMap.getCenter();
      tripUiState.savedTripMapView = { tripId: trip.id, center: [center.lat, center.lng], zoom: activeTripMap.getZoom() };
    }
    await updateRow(options, "trip_destinations", destination.id, { latitude, longitude });
    await refreshEditor();
  }


  async function placeDestination(destinationId: number): Promise<void> {
    destinationPlacementId = destinationId;
    const destination = destinations.find((item) => item.id === destinationPlacementId);
    mapElement?.classList.add("is-placing-city");
    mapElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!destination || !activeTripMap) return;
    const currentName = String(new FormData(form).get(`destination_${destination.id}_name`) || destination.name).trim();
    if (mapMessage) mapMessage.textContent = `Ищу «${currentName}» в Японии…`;
    suggestedCityMarker?.remove();
    const suggestion = await searchJapaneseCity(currentName);
    if (!suggestion) {
      if (mapMessage) mapMessage.textContent = `Не нашла «${currentName}». Нажмите на нужное место карты вручную.`;
      return;
    }
    activeTripMap.flyTo([suggestion.latitude, suggestion.longitude], 10);
    suggestedCityMarker = L.marker([suggestion.latitude, suggestion.longitude], {
      title: `Предложение: ${suggestion.label}`,
      icon: L.divIcon({
        className: "admin-trip-city-suggestion-wrap",
        html: `<span class="admin-trip-city-suggestion">?</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    }).bindTooltip(`<strong>${escapeHtml(suggestion.label)}</strong><br><small>Нажмите, чтобы подтвердить</small>`, { permanent: true, direction: "top" }).addTo(activeTripMap);
    suggestedCityMarker.on("click", () => {
      if (mapClickBusy) return;
      mapClickBusy = true;
      if (mapMessage) mapMessage.textContent = `Сохраняю «${currentName}»…`;
      void saveDestinationCoordinates(destination, suggestion.latitude, suggestion.longitude).catch((mapError) => {
        mapClickBusy = false;
        const message = setupMessage(mapError);
        if (mapMessage) mapMessage.textContent = message;
        if (error) error.textContent = message;
      });
    });
    if (mapMessage) mapMessage.textContent = "Нашла вариант. Нажмите на жёлтый маркер, чтобы подтвердить, или выберите другую точку вручную.";
  }
  return { placeDestination };
}
