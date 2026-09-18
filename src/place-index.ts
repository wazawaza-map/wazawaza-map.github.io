import Supercluster from "supercluster";
import type { Place } from "./types";

export const CLUSTER_MAX_ZOOM = 18;

export function createPlaceIndex(places: Place[]) {
  return new Supercluster<{ placeId: number }>({
    radius: 60,
    maxZoom: CLUSTER_MAX_ZOOM,
    extent: 256,
  }).load(places.map((place) => ({
    type: "Feature" as const,
    properties: { placeId: place.id },
    geometry: { type: "Point" as const, coordinates: [place.longitude, place.latitude] },
  })));
}
