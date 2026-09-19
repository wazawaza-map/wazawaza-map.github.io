import type { Trip, TripDay, TripDayTransport, TripDestination, TripRouteData } from "./trip-types";

function destinationName(id: number | null, destinations: TripDestination[], fallback = "Город не выбран"): string {
  return destinations.find((destination) => destination.id === id)?.name ?? fallback;
}

export function tripDayTransports(day: TripDay, index: number, trip: Trip, route: TripRouteData | null): TripDayTransport[] {
  if (trip.supports_multiple_transports) return day.trip_day_transports;
  const destinations = route?.destinations ?? [];
  const city = destinationName(day.city_destination_id, destinations);
  const overnight = destinationName(day.destination_id, destinations, day.overnight_city || "");
  const isFirst = index === 0;
  const isLast = index === trip.trip_days.length - 1;
  return [{
    id: -day.id,
    position: 1,
    mode: day.transport_mode || "train",
    from_name: isFirst ? trip.home_city || "Токио" : city,
    to_name: isFirst ? city : isLast ? trip.home_city || "Токио" : overnight,
    details: day.transport_details,
    booking_url: day.transport_booking_url,
    departure_time: day.transport_departure_time,
    arrival_time: day.transport_arrival_time,
    booked: day.transport_booked,
    paid: day.transport_paid,
  }];
}
