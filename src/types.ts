export type PlaceTranslation = {
  locale: "ru" | "ja" | "en";
  name: string;
  summary: string | null;
  area: string | null;
  nearest_station: string | null;
  access_note: string | null;
  interest: string | null;
  seasonality: string | null;
  price_note: string | null;
  hours_note: string | null;
  cluster_name: string | null;
};

export type Place = {
  id: number;
  slug: string | null;
  prefecture: string;
  municipality: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
  tags: string[];
  access_modes: string[];
  visit_minutes: number | null;
  indoor_outdoor: string | null;
  station_walk_min: number | null;
  reservation: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  place_translations: PlaceTranslation[];
};

export type RouteTranslation = {
  locale: "ru" | "ja" | "en";
  name: string;
  seasonality: string | null;
  note: string | null;
};

export type Route = {
  id: number;
  legacy_id: string;
  cluster_id: string | null;
  cross_prefecture: boolean;
  base_hub: string | null;
  transport_modes: string[];
  duration_min: number | null;
  difficulty: string | null;
  without_car: boolean | null;
  route_translations: RouteTranslation[];
};
