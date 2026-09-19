import { escapeHtml } from "./html";
import { BOOKING_STATUS_LABELS, TRANSPORT_MODE_LABELS, placeName, tripDates } from "./trip-format";
import { tripDayTransports } from "./trip-day-transports";
import type { Trip, TripDay, TripDestination, TripPlannerPlace, TripRouteData, TripStop } from "./trip-types";

export type TelegramTripMessage = { title: string; text: string };

function destinationName(id: number | null, destinations: TripDestination[], fallback = "Город не выбран"): string {
  return destinations.find((destination) => destination.id === id)?.name ?? fallback;
}

function timeRange(departure: string | null, arrival: string | null): string | null {
  if (!departure && !arrival) return null;
  return `${(departure || "?").slice(0, 5)}–${(arrival || "?").slice(0, 5)}`;
}

function addLink(lines: string[], label: string, value: string | null | undefined): void {
  if (value) lines.push(`${label}: ${value}`);
}

function stopLines(stop: TripStop, index: number, places: Map<number, TripPlannerPlace>): string[] {
  const place = stop.place_id ? places.get(stop.place_id) : undefined;
  const title = place ? placeName(place) : stop.custom_name || `Остановка ${index + 1}`;
  const lines = [`📍 ${index + 1}. ${title}`];
  if (stop.planned_time) lines.push(`⏰ ${stop.planned_time.slice(0, 5)}`);
  if (stop.notes) lines.push(stop.notes);
  if (place) {
    addLink(lines, "🗺 Google Maps", place.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`);
    addLink(lines, "🌐 Сайт", place.website_url);
  }
  if (stop.admission_status) lines.push(`🎟 ${BOOKING_STATUS_LABELS[stop.admission_status]}`);
  addLink(lines, "Билет", stop.admission_url);

  const directions = [
    ["Туда", stop.to_transport_mode, stop.to_transport_details, timeRange(stop.to_departure_time, stop.to_arrival_time)],
    ["Обратно / дальше", stop.back_transport_mode, stop.back_transport_details, timeRange(stop.back_departure_time, stop.back_arrival_time)],
  ] as const;
  directions.forEach(([label, mode, details, time]) => {
    if (!mode) return;
    lines.push(`🚉 ${label}: ${[TRANSPORT_MODE_LABELS[mode], details, time].filter(Boolean).join(" · ")}`);
  });
  return lines;
}

function dayMessage(day: TripDay, index: number, trip: Trip, route: TripRouteData | null, places: Map<number, TripPlannerPlace>): TelegramTripMessage {
  const destinations = route?.destinations ?? [];
  const city = destinationName(day.city_destination_id, destinations);
  const overnight = destinationName(day.destination_id, destinations, day.overnight_city || "");
  const isLast = index === trip.trip_days.length - 1;
  const transports = tripDayTransports(day, index, trip, route);
  const lines = [
    `🗺 ${trip.title}`,
    `День ${day.day_number} · ${day.date || "без даты"} · ${city}`,
  ];
  transports.forEach((transport, transportIndex) => {
    lines.push("", `🚆 ${transportIndex + 1}. ${transport.from_name || "Откуда?"} → ${transport.to_name || "Куда?"}`);
    lines.push([TRANSPORT_MODE_LABELS[transport.mode], transport.details, timeRange(transport.departure_time, transport.arrival_time)].filter(Boolean).join(" · "));
    if (transport.paid) lines.push("✅ Транспорт оплачен");
    else if (transport.booked) lines.push("✅ Транспорт забронирован");
    addLink(lines, "Билет / бронь", transport.booking_url);
  });
  if (day.notes) lines.push("", `📝 ${day.notes}`);
  if (day.trip_stops.length) {
    lines.push("");
    day.trip_stops.forEach((stop, stopIndex) => {
      if (stopIndex) lines.push("");
      lines.push(...stopLines(stop, stopIndex, places));
    });
  }
  if (day.lodging_name || day.lodging_status || (!isLast && overnight)) {
    lines.push("", `🏨 Ночёвка${overnight ? ` · ${overnight}` : ""}`);
    if (day.lodging_name) lines.push(day.lodging_name);
    if (day.lodging_status) lines.push(BOOKING_STATUS_LABELS[day.lodging_status]);
    addLink(lines, "Бронь", day.lodging_url);
  }
  return { title: `День ${day.day_number} · ${city}`, text: lines.filter((line, lineIndex) => line || lines[lineIndex - 1] !== "").join("\n").trim() };
}

export function buildTelegramTripMessages(trip: Trip, route: TripRouteData | null, places: Map<number, TripPlannerPlace>): TelegramTripMessage[] {
  const messages = trip.trip_days.map((day, index) => dayMessage(day, index, trip, route, places));
  const general = trip.trip_bookings.filter((booking) => booking.kind === "other");
  if (trip.notes || general.length) {
    const lines = [`🗺 ${trip.title}`, `Общее · ${tripDates(trip)}`];
    if (trip.notes) lines.push("", `📝 ${trip.notes}`);
    if (general.length) {
      lines.push("", "✅ Прочие дела");
      general.forEach((booking) => {
        lines.push(`• ${booking.title} · ${BOOKING_STATUS_LABELS[booking.status]}${booking.date ? ` · ${booking.date}` : ""}`);
        addLink(lines, "  Ссылка", booking.url);
        if (booking.notes) lines.push(`  ${booking.notes}`);
      });
    }
    messages.push({ title: "Общее", text: lines.join("\n") });
  }
  return messages;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export function showTelegramTripExport(messages: TelegramTripMessage[]): void {
  document.querySelector("[data-telegram-export]")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "admin-telegram-export-overlay";
  overlay.dataset.telegramExport = "";
  overlay.innerHTML = `<section class="admin-telegram-export" role="dialog" aria-modal="true" aria-labelledby="telegram-export-title">
    <header><div><p class="admin-kicker">TELEGRAM</p><h2 id="telegram-export-title">Сообщения по дням</h2></div><button type="button" class="secondary" data-close-telegram-export>Закрыть</button></header>
    <p class="admin-telegram-export__hint">Здесь есть все ссылки, включая приватные бронирования. Отправляйте их только туда, куда собирались.</p>
    <button type="button" data-copy-all-telegram>Копировать всё</button>
    <div class="admin-telegram-export__messages">${messages.map((message, index) => `<article><header><strong>${escapeHtml(message.title)}</strong><span>${message.text.length} зн.</span></header><textarea readonly rows="12" data-telegram-message="${index}">${escapeHtml(message.text)}</textarea><button type="button" class="secondary" data-copy-telegram="${index}">Копировать этот день</button></article>`).join("")}</div>
  </section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close-telegram-export]")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector<HTMLButtonElement>("[data-copy-all-telegram]")?.addEventListener("click", async (event) => {
    await copyText(messages.map((message) => message.text).join("\n\n──────────\n\n"));
    (event.currentTarget as HTMLButtonElement).textContent = "Скопировано ✓";
  });
  overlay.querySelectorAll<HTMLButtonElement>("[data-copy-telegram]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(messages[Number(button.dataset.copyTelegram)]?.text || "");
      button.textContent = "Скопировано ✓";
    });
  });
}
