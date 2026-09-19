import type { Trip, TripDataOptions, TripDestination, TripLeg, TripRouteData, TripStop } from "./trip-types";

async function request<T>(
  options: TripDataOptions,
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<T> {
  const response = await fetch(`${options.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: options.supabaseKey,
      Authorization: `Bearer ${options.session.access_token}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getTrips(options: TripDataOptions, id?: number): Promise<Trip[]> {
  async function fetchTrips(includeBookings: boolean, includeDayDestinations: boolean, includeInlineBookings: boolean, includeDailyItinerary: boolean, includeStopTransport: boolean, includeMultipleTransports: boolean, includeLodgingSpans: boolean, includeLodgingGoogleMaps: boolean): Promise<Trip[]> {
    const dayFields = [
      "id", "day_number", "date", ...(includeDayDestinations ? ["destination_id"] : []),
      ...(includeDailyItinerary ? ["city_destination_id", "transport_mode", "transport_details", "transport_booking_url", "transport_departure_time", "transport_arrival_time", "transport_booked", "transport_paid"] : []),
      "overnight_city", "lodging_name", "lodging_url", ...(includeLodgingGoogleMaps ? ["lodging_google_maps_url"] : []), ...(includeInlineBookings ? ["lodging_status"] : []), ...(includeLodgingSpans ? ["lodging_source_day_id"] : []), "notes",
      `trip_stops(id,place_id,position,custom_name,planned_time,notes${includeInlineBookings ? ",admission_status,admission_url" : ""}${includeStopTransport ? ",to_transport_mode,to_transport_details,to_departure_time,to_arrival_time,back_transport_mode,back_transport_details,back_departure_time,back_arrival_time" : ""})`,
      ...(includeMultipleTransports ? ["trip_day_transports(id,position,mode,from_name,to_name,details,booking_url,departure_time,arrival_time,booked,paid)"] : []),
    ].join(",");
    const baseFields = ["id", "title", "start_date", "end_date", "status", "notes", ...(includeDailyItinerary ? ["home_city"] : []), "updated_at", `trip_days(${dayFields})`];
    const select = [...baseFields, ...(includeBookings
      ? ["trip_bookings(id,kind,title,status,date,url,notes,position)"]
      : [])].join(",");
    const params = new URLSearchParams({ select, order: "updated_at.desc,id.desc" });
    if (id) params.set("id", `eq.${id}`);
    return request<Trip[]>(options, `trips?${params}`);
  }

  let trips: Trip[] | undefined;
  let includeBookings = true;
  let includeDayDestinations = true;
  let includeInlineBookings = true;
  let includeDailyItinerary = true;
  let includeStopTransport = true;
  let includeMultipleTransports = true;
  let includeLodgingSpans = true;
  let includeLodgingGoogleMaps = true;
  for (let attempt = 0; attempt < 9 && !trips; attempt += 1) {
    try {
      trips = await fetchTrips(includeBookings, includeDayDestinations, includeInlineBookings, includeDailyItinerary, includeStopTransport, includeMultipleTransports, includeLodgingSpans, includeLodgingGoogleMaps);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (includeBookings && message.includes("trip_bookings")) {
        includeBookings = false;
      } else if (includeInlineBookings && (message.includes("lodging_status") || message.includes("admission_status") || message.includes("admission_url"))) {
        includeInlineBookings = false;
      } else if (includeStopTransport && (message.includes("to_transport_") || message.includes("back_transport_") || message.includes("to_departure_time") || message.includes("to_arrival_time") || message.includes("back_departure_time") || message.includes("back_arrival_time"))) {
        includeStopTransport = false;
      } else if (includeMultipleTransports && message.includes("trip_day_transports")) {
        includeMultipleTransports = false;
      } else if (includeLodgingSpans && message.includes("lodging_source_day_id")) {
        includeLodgingSpans = false;
      } else if (includeLodgingGoogleMaps && message.includes("lodging_google_maps_url")) {
        includeLodgingGoogleMaps = false;
      } else if (includeDailyItinerary && (message.includes("home_city") || message.includes("city_destination_id") || message.includes("transport_"))) {
        includeDailyItinerary = false;
      } else if (includeDayDestinations && message.includes("destination_id")) {
        includeDayDestinations = false;
      } else {
        throw error;
      }
    }
  }
  if (!trips) throw new Error("Не удалось загрузить поездки.");
  for (const trip of trips) {
    if (!includeBookings) trip.trip_bookings = [];
    trip.supports_day_destinations = includeDayDestinations;
    trip.supports_inline_bookings = includeInlineBookings;
    trip.supports_daily_itinerary = includeDailyItinerary;
    trip.supports_stop_transport = includeStopTransport;
    trip.supports_multiple_transports = includeMultipleTransports;
    trip.supports_lodging_spans = includeLodgingSpans;
    trip.supports_lodging_google_maps = includeLodgingGoogleMaps;
    if (!includeDailyItinerary) trip.home_city = "Токио";
    trip.trip_days.sort((a, b) => a.day_number - b.day_number);
    trip.trip_days.forEach((day) => {
      if (!includeMultipleTransports) day.trip_day_transports = [];
      else {
        day.trip_day_transports ??= [];
        day.trip_day_transports.sort((a, b) => a.position - b.position);
      }
      if (!includeDayDestinations) day.destination_id = null;
      if (!includeLodgingSpans) day.lodging_source_day_id = null;
      if (!includeLodgingGoogleMaps) day.lodging_google_maps_url = null;
      if (!includeInlineBookings) day.lodging_status = null;
      if (!includeDailyItinerary) {
        day.city_destination_id = null;
        day.transport_mode = "train";
        day.transport_details = null;
        day.transport_booking_url = null;
        day.transport_departure_time = null;
        day.transport_arrival_time = null;
        day.transport_booked = false;
        day.transport_paid = false;
      }
      day.trip_stops.forEach((stop) => {
        if (!includeInlineBookings) {
          stop.admission_status = null;
          stop.admission_url = null;
        }
        if (!includeStopTransport) {
          stop.to_transport_mode = null;
          stop.to_transport_details = null;
          stop.to_departure_time = null;
          stop.to_arrival_time = null;
          stop.back_transport_mode = null;
          stop.back_transport_details = null;
          stop.back_departure_time = null;
          stop.back_arrival_time = null;
        }
      });
      day.trip_stops.sort((a, b) => a.position - b.position);
    });
    trip.trip_bookings.sort((a, b) => a.position - b.position);
  }
  return trips;
}

export async function getTripRoute(options: TripDataOptions, tripId: number): Promise<TripRouteData | null> {
  let supportsTimes = true;
  let supportsLegDays = true;
  let supportsBookingUrl = true;
  let supportsDestinationDays = true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const legFields = [
        "id", ...(supportsLegDays ? ["trip_day_id"] : []), "from_destination_id", "to_destination_id", "mode", "details",
        ...(supportsTimes ? ["departure_time", "arrival_time"] : []), "booked", "paid", ...(supportsBookingUrl ? ["booking_url"] : []),
      ].join(",");
      const destinationFields = [
        "id", ...(supportsDestinationDays ? ["trip_day_id"] : []), "name", "position", "latitude", "longitude", "notes",
      ].join(",");
      const [destinations, legacyLegs] = await Promise.all([
        request<TripDestination[]>(options, `trip_destinations?trip_id=eq.${tripId}&select=${destinationFields}&order=position.asc`),
        request<TripLeg[]>(options, `trip_legs?trip_id=eq.${tripId}&select=${legFields}`),
      ]);
      return {
        destinations: destinations.map((destination) => ({
          ...destination,
          trip_day_id: supportsDestinationDays ? destination.trip_day_id : null,
        })),
        legs: legacyLegs.map((leg) => ({
          ...leg,
          trip_day_id: supportsLegDays ? leg.trip_day_id : null,
          departure_time: supportsTimes ? leg.departure_time : null,
          arrival_time: supportsTimes ? leg.arrival_time : null,
          booking_url: supportsBookingUrl ? leg.booking_url : null,
        })),
        supportsTimes,
        supportsLegDays,
        supportsBookingUrl,
        supportsDestinationDays,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (supportsTimes && (message.includes("departure_time") || message.includes("arrival_time"))) {
        supportsTimes = false;
      } else if (supportsDestinationDays && message.includes("trip_day_id") && message.includes("trip_destinations")) {
        supportsDestinationDays = false;
      } else if (supportsLegDays && message.includes("trip_day_id")) {
        supportsLegDays = false;
      } else if (supportsBookingUrl && message.includes("booking_url")) {
        supportsBookingUrl = false;
      } else if (message.includes("trip_destinations") || message.includes("trip_legs") || message.includes("PGRST205")) {
        return null;
      } else {
        throw error;
      }
    }
  }
  throw new Error("Не удалось загрузить транспортные участки.");
}

export async function insertRow<T>(options: TripDataOptions, table: string, values: unknown): Promise<T> {
  const rows = await request<T[]>(options, table, "POST", values, "return=representation");
  if (!rows[0]) throw new Error(`Supabase не вернул созданную запись из ${table}.`);
  return rows[0];
}

export async function updateRow(options: TripDataOptions, table: string, id: number, values: unknown): Promise<void> {
  await request<void>(options, `${table}?id=eq.${id}`, "PATCH", values, "return=minimal");
}

function comparableValue(field: string, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (field.endsWith("_time") && typeof value === "string") return value.slice(0, 5);
  return value;
}

function rowHasChanges(current: object, values: Record<string, unknown>): boolean {
  const record = current as Record<string, unknown>;
  return Object.entries(values).some(([field, value]) =>
    comparableValue(field, record[field]) !== comparableValue(field, value)
  );
}

export async function updateRowIfChanged(
  options: TripDataOptions,
  table: string,
  id: number,
  current: object,
  values: Record<string, unknown>,
): Promise<boolean> {
  if (!rowHasChanges(current, values)) return false;
  await updateRow(options, table, id, values);
  return true;
}

export async function deleteRow(options: TripDataOptions, table: string, id: number): Promise<void> {
  await request<void>(options, `${table}?id=eq.${id}`, "DELETE", undefined, "return=minimal");
}

export async function renumberRows(
  options: TripDataOptions,
  table: "trip_days" | "trip_stops" | "trip_day_transports",
  rows: Array<{ id: number; position?: number; day_number?: number }>,
  field: "position" | "day_number",
): Promise<void> {
  if (!rows.length) return;
  const currentMaximum = Math.max(0, ...rows.map((row) => Number(row[field]) || 0));
  const temporaryStart = currentMaximum + rows.length + 1_000;
  for (const [index, row] of rows.entries()) {
    await updateRow(options, table, row.id, { [field]: temporaryStart + index });
  }
  for (const [index, row] of rows.entries()) {
    await updateRow(options, table, row.id, { [field]: index + 1 });
  }
}

export async function compactStopPositions(options: TripDataOptions, stops: TripStop[]): Promise<void> {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  for (const [index, stop] of sorted.entries()) {
    const position = index + 1;
    if (stop.position !== position) await updateRow(options, "trip_stops", stop.id, { position });
  }
}
