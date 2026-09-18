import type L from "leaflet";

// Preserved across editor renders, as in the original planner.
export const tripUiState: {
  savedTripMapView?: { tripId: number; center: L.LatLngTuple; zoom: number };
  savedTripMapDay?: { tripId: number; dayId: number };
  savedTripMapLayer?: { tripId: number; mode: "overview" | "day" | "all" };
  savedTripRouteOpen?: { tripId: number; open: boolean };
} = {};
