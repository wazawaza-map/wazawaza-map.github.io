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
  transport_mode: TripLeg["mode"];
  transport_details: string | null;
  transport_booking_url: string | null;
  transport_departure_time: string | null;
  transport_arrival_time: string | null;
  transport_booked: boolean;
  transport_paid: boolean;
  notes: string | null;
  trip_stops: TripStop[];
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
