import type { BookingStatus, Trip, TripBooking, TripLeg, TripPlannerPlace } from "./trip-types";

export const STATUS_LABELS: Record<Trip["status"], string> = {
  idea: "Идея",
  planning: "Планирую",
  booked: "Забронировано",
  completed: "Завершена",
};
export const BOOKING_KIND_LABELS: Record<TripBooking["kind"], string> = {
  lodging: "Отель / жильё",
  transport: "Транспорт",
  admission: "Входной билет",
  other: "Другое",
};
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  planned: "Нужно оформить",
  booked: "Забронировано",
  paid: "Куплено / оплачено",
};
export const TRANSPORT_MODE_LABELS: Record<TripLeg["mode"], string> = {
  train: "Поезд",
  bus: "Автобус",
  car: "Машина",
  flight: "Самолёт",
  ferry: "Паром",
  walk: "Пешком",
  other: "Другое",
};
export function placeName(place: TripPlannerPlace): string {
  return place.place_translations.find((translation) => translation.locale === "ru")?.name
    ?? place.place_translations[0]?.name
    ?? `Место #${place.id}`;
}

export function resolvePlaceId(value: string, places: Map<number, TripPlannerPlace>): number | null {
  const explicitId = Number(value.match(/^#(\d+)/)?.[1] || 0);
  if (explicitId && places.has(explicitId)) return explicitId;
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("ru");
  if (!normalized) return null;
  const matches = [...places.values()].filter((place) => {
    const name = placeName(place).normalize("NFKC").toLocaleLowerCase("ru");
    return name === normalized || name.includes(normalized);
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function tripDates(trip: Trip): string {
  if (!trip.start_date && !trip.end_date) return "Даты пока не указаны";
  if (!trip.end_date || trip.end_date === trip.start_date) return trip.start_date ?? trip.end_date!;
  return `${trip.start_date ?? "?"} — ${trip.end_date}`;
}

export function setupMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("trips") && (text.includes("404") || text.includes("PGRST"))) {
    return "Таблицы поездок ещё не созданы. Выполните scripts/trip_planner_setup.sql в Supabase SQL Editor.";
  }
  return text;
}
