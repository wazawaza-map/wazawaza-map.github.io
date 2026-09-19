import { updateRowIfChanged } from "./trip-api";
import type { Trip, TripDataOptions, TripRouteData } from "./trip-types";

export async function persistTripForm(options: TripDataOptions, trip: Trip, tripRoute: TripRouteData | null, data: FormData): Promise<void> {
  const destinations = tripRoute?.destinations ?? [];
  const legs = tripRoute?.legs ?? [];
  const title = String(data.get("title") || "").trim();
  if (!title) throw new Error("Введите название поездки.");
  await updateRowIfChanged(options, "trips", trip.id, trip, {
    title,
    status: data.get("status"),
    start_date: String(data.get("start_date") || "") || null,
    end_date: String(data.get("end_date") || "") || null,
    notes: String(data.get("notes") || "").trim() || null,
    ...(trip.supports_daily_itinerary ? { home_city: String(data.get("home_city") || "").trim() || "Токио" } : {}),
  });
  for (const day of trip.trip_days) {
    const dayValues: Record<string, unknown> = {
      date: String(data.get(`day_${day.id}_date`) || "") || null,
      lodging_name: String(data.get(`day_${day.id}_lodging_name`) || "").trim() || null,
      lodging_url: String(data.get(`day_${day.id}_lodging_url`) || "").trim() || null,
      notes: String(data.get(`day_${day.id}_notes`) || "").trim() || null,
    };
    if (trip.supports_inline_bookings) {
      dayValues.lodging_status = String(data.get(`day_${day.id}_lodging_status`) || "") || null;
    }
    if (trip.supports_day_destinations) {
      const destinationId = Number(data.get(`day_${day.id}_destination_id`)) || null;
      dayValues.destination_id = destinationId;
      const destination = destinations.find((item) => item.id === destinationId);
      dayValues.overnight_city = destination
        ? String(data.get(`destination_${destination.id}_name`) || destination.name).trim() || null
        : null;
    }
    if (trip.supports_daily_itinerary) {
      dayValues.city_destination_id = Number(data.get(`day_${day.id}_city_destination_id`)) || null;
      dayValues.transport_mode = data.get(`day_${day.id}_transport_mode`) || "train";
      dayValues.transport_details = String(data.get(`day_${day.id}_transport_details`) || "").trim() || null;
      dayValues.transport_booking_url = String(data.get(`day_${day.id}_transport_booking_url`) || "").trim() || null;
      dayValues.transport_departure_time = String(data.get(`day_${day.id}_transport_departure_time`) || "") || null;
      dayValues.transport_arrival_time = String(data.get(`day_${day.id}_transport_arrival_time`) || "") || null;
      dayValues.transport_booked = data.get(`day_${day.id}_transport_booked`) === "on";
      dayValues.transport_paid = data.get(`day_${day.id}_transport_paid`) === "on";
    }
    await updateRowIfChanged(options, "trip_days", day.id, day, dayValues);
    for (const stop of day.trip_stops) {
      const stopValues: Record<string, unknown> = {
        planned_time: String(data.get(`stop_${stop.id}_planned_time`) || "") || null,
        notes: String(data.get(`stop_${stop.id}_notes`) || "").trim() || null,
      };
      if (trip.supports_inline_bookings) {
        stopValues.admission_status = String(data.get(`stop_${stop.id}_admission_status`) || "") || null;
        stopValues.admission_url = String(data.get(`stop_${stop.id}_admission_url`) || "").trim() || null;
      }
      await updateRowIfChanged(options, "trip_stops", stop.id, stop, stopValues);
    }
  }
  for (const booking of trip.trip_bookings) {
    const bookingTitle = String(data.get(`booking_${booking.id}_title`) || "").trim();
    if (!bookingTitle) throw new Error("Укажите название дела.");
    await updateRowIfChanged(options, "trip_bookings", booking.id, booking, {
      kind: data.get(`booking_${booking.id}_kind`),
      title: bookingTitle,
      status: data.get(`booking_${booking.id}_status`),
      date: String(data.get(`booking_${booking.id}_date`) || "") || null,
      url: String(data.get(`booking_${booking.id}_url`) || "").trim() || null,
      notes: String(data.get(`booking_${booking.id}_notes`) || "").trim() || null,
    });
  }
  for (const destination of destinations) {
    const name = String(data.get(`destination_${destination.id}_name`) || "").trim();
    if (!name) throw new Error("Укажите название города.");
    const destinationValues: Record<string, unknown> = {
      name,
      notes: String(data.get(`destination_${destination.id}_notes`) || "").trim() || null,
    };
    if (tripRoute?.supportsDestinationDays) {
      destinationValues.trip_day_id = Number(data.get(`destination_${destination.id}_trip_day_id`)) || null;
    }
    await updateRowIfChanged(options, "trip_destinations", destination.id, destination, destinationValues);
  }
  for (const leg of legs) {
    const mode = data.get(`leg_${leg.id}_mode`);
    if (mode === null) continue;
    const values: Record<string, unknown> = {
      mode,
      details: String(data.get(`leg_${leg.id}_details`) || "").trim() || null,
      booked: data.get(`leg_${leg.id}_booked`) === "on",
      paid: data.get(`leg_${leg.id}_paid`) === "on",
    };
    if (tripRoute?.supportsLegDays) {
      values.trip_day_id = Number(data.get(`leg_${leg.id}_trip_day_id`)) || null;
    }
    if (tripRoute?.supportsTimes) {
      values.departure_time = String(data.get(`leg_${leg.id}_departure_time`) || "") || null;
      values.arrival_time = String(data.get(`leg_${leg.id}_arrival_time`) || "") || null;
    }
    if (tripRoute?.supportsBookingUrl) {
      values.booking_url = String(data.get(`leg_${leg.id}_booking_url`) || "").trim() || null;
    }
    await updateRowIfChanged(options, "trip_legs", leg.id, leg, values);
  }
}
