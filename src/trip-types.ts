export type TripPlannerSession = {
  access_token: string;
  user: { email?: string };
};

export type TripPlannerPlace = {
  id: number;
  prefecture: string;
  municipality: string | null;
  latitude: number;
  longitude: number;
  google_maps_url?: string | null;
  website_url?: string | null;
  place_translations: Array<{ locale: string; name: string }>;
};

export type TripStop = {
  id: number;
  place_id: number | null;
  position: number;
  custom_name: string | null;
  planned_time: string | null;
  notes: string | null;
  admission_status: BookingStatus | null;
  admission_url: string | null;
  to_transport_mode: TripLeg["mode"] | null;
  to_transport_details: string | null;
  to_departure_time: string | null;
  to_arrival_time: string | null;
  back_transport_mode: TripLeg["mode"] | null;
  back_transport_details: string | null;
  back_departure_time: string | null;
  back_arrival_time: string | null;
};

export type TripDayTransport = {
  id: number;
  position: number;
  mode: TripLeg["mode"];
  from_name: string | null;
  to_name: string | null;
  details: string | null;
  booking_url: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  booked: boolean;
  paid: boolean;
};

export type BookingStatus = "planned" | "booked" | "paid";

export type TripDay = {
  id: number;
  day_number: number;
  date: string | null;
  destination_id: number | null;
  city_destination_id: number | null;
  overnight_city: string | null;
  lodging_name: string | null;
  lodging_url: string | null;
  lodging_status: BookingStatus | null;
  lodging_source_day_id: number | null;
  transport_mode: TripLeg["mode"];
  transport_details: string | null;
  transport_booking_url: string | null;
  transport_departure_time: string | null;
  transport_arrival_time: string | null;
  transport_booked: boolean;
  transport_paid: boolean;
  notes: string | null;
  trip_stops: TripStop[];
  trip_day_transports: TripDayTransport[];
};

export type TripBooking = {
  id: number;
  kind: "lodging" | "transport" | "admission" | "other";
  title: string;
  status: BookingStatus;
  date: string | null;
  url: string | null;
  notes: string | null;
  position: number;
};

export type TripDestination = {
  id: number;
  trip_day_id: number | null;
  name: string;
  position: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
};

export type TripLeg = {
  id: number;
  trip_day_id: number | null;
  from_destination_id: number;
  to_destination_id: number;
  mode: "train" | "bus" | "car" | "flight" | "ferry" | "walk" | "other";
  details: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  booked: boolean;
  paid: boolean;
  booking_url: string | null;
};

export type TripRouteData = {
  destinations: TripDestination[];
  legs: TripLeg[];
  supportsTimes: boolean;
  supportsLegDays: boolean;
  supportsBookingUrl: boolean;
  supportsDestinationDays: boolean;
};

export type CitySearchResult = {
  latitude: number;
  longitude: number;
  label: string;
};

export type Trip = {
  id: number;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: "idea" | "planning" | "booked" | "completed";
  notes: string | null;
  home_city: string;
  updated_at: string;
  trip_days: TripDay[];
  trip_bookings: TripBooking[];
  supports_day_destinations: boolean;
  supports_inline_bookings: boolean;
  supports_daily_itinerary: boolean;
  supports_stop_transport: boolean;
  supports_multiple_transports: boolean;
  supports_lodging_spans: boolean;
};

export type TripPlannerOptions = {
  app: HTMLDivElement;
  session: TripPlannerSession;
  supabaseUrl: string;
  supabaseKey: string;
  places: TripPlannerPlace[];
  onShowPlaces: () => void;
  onLogout: () => void;
};


export type TripDataOptions = Pick<TripPlannerOptions, "session" | "supabaseUrl" | "supabaseKey">;
