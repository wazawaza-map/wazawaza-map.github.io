import { escapeHtml } from "./html";
import { BOOKING_STATUS_LABELS, STATUS_LABELS, TRANSPORT_MODE_LABELS, placeName, tripDates } from "./trip-format";
import { tripDayTransports } from "./trip-day-transports";
import { lodgingSourceDay } from "./trip-lodging";
import type { Trip, TripDay, TripDestination, TripPlannerPlace, TripRouteData, TripStop } from "./trip-types";

function destinationName(id: number | null, destinations: TripDestination[], fallback = "Город не выбран"): string {
  return destinations.find((destination) => destination.id === id)?.name ?? fallback;
}

function timeRange(departure: string | null, arrival: string | null): string {
  if (!departure && !arrival) return "";
  return `${(departure || "?").slice(0, 5)}–${(arrival || "?").slice(0, 5)}`;
}

function stopTransport(stop: TripStop): string {
  const directions = [
    {
      label: "Туда",
      mode: stop.to_transport_mode,
      details: stop.to_transport_details,
      time: timeRange(stop.to_departure_time, stop.to_arrival_time),
    },
    {
      label: "Обратно / дальше",
      mode: stop.back_transport_mode,
      details: stop.back_transport_details,
      time: timeRange(stop.back_departure_time, stop.back_arrival_time),
    },
  ].filter((direction) => direction.mode);
  if (!directions.length) return "";
  return `<div class="stop-transport">${directions.map((direction) => `<p><b>${direction.label}:</b> ${escapeHtml(TRANSPORT_MODE_LABELS[direction.mode!])}${direction.details ? ` · ${escapeHtml(direction.details)}` : ""}${direction.time ? ` · ${escapeHtml(direction.time)}` : ""}</p>`).join("")}</div>`;
}

function stopBlock(stop: TripStop, index: number, places: Map<number, TripPlannerPlace>): string {
  const place = stop.place_id ? places.get(stop.place_id) : undefined;
  const title = place ? placeName(place) : stop.custom_name || `Остановка ${index + 1}`;
  const meta = [
    stop.planned_time?.slice(0, 5),
    stop.admission_status ? BOOKING_STATUS_LABELS[stop.admission_status] : null,
  ].filter(Boolean).join(" · ");
  return `<li class="stop">
    <div class="stop-title"><span>${index + 1}</span><div><h3>${escapeHtml(title)}</h3>${meta ? `<p>${escapeHtml(meta)}</p>` : ""}</div></div>
    ${stop.notes ? `<p class="notes">${escapeHtml(stop.notes)}</p>` : ""}
    ${stopTransport(stop)}
  </li>`;
}

function dayBlock(day: TripDay, index: number, trip: Trip, route: TripRouteData | null, places: Map<number, TripPlannerPlace>): string {
  const destinations = route?.destinations ?? [];
  const city = destinationName(day.city_destination_id, destinations);
  const lodging = lodgingSourceDay(day, trip.trip_days);
  const overnight = destinationName(lodging.destination_id, destinations, lodging.overnight_city || "");
  const isLast = index === trip.trip_days.length - 1;
  const transports = tripDayTransports(day, index, trip, route);
  const showLodging = Boolean(lodging.lodging_name || lodging.lodging_status || (!isLast && overnight));
  return `<section class="day">
    <header><span>День ${day.day_number}</span><div><h2>${escapeHtml(city)}</h2><time>${escapeHtml(day.date || "Без даты")}</time></div></header>
    ${transports.map((transport) => {
      const meta = [TRANSPORT_MODE_LABELS[transport.mode], transport.details, timeRange(transport.departure_time, transport.arrival_time), transport.paid ? "Оплачено" : transport.booked ? "Забронировано" : null].filter(Boolean).join(" · ");
      return `<div class="travel"><b>${escapeHtml(transport.from_name || "Откуда?")} → ${escapeHtml(transport.to_name || "Куда?")}</b><p>${escapeHtml(meta)}</p></div>`;
    }).join("")}
    ${showLodging ? `<div class="lodging"><b>${day.lodging_source_day_id ? "Та же ночёвка" : "Ночёвка"}${overnight ? ` · ${escapeHtml(overnight)}` : ""}</b>${lodging.lodging_name ? `<p>${escapeHtml(lodging.lodging_name)}</p>` : ""}${lodging.lodging_status ? `<p>${escapeHtml(BOOKING_STATUS_LABELS[lodging.lodging_status])}</p>` : ""}</div>` : ""}
    ${day.notes ? `<p class="day-notes">${escapeHtml(day.notes)}</p>` : ""}
    ${day.trip_stops.length ? `<ol class="stops">${day.trip_stops.map((stop, stopIndex) => stopBlock(stop, stopIndex, places)).join("")}</ol>` : `<p class="empty">Места пока не добавлены.</p>`}
  </section>`;
}

export function buildTripExportHtml(trip: Trip, route: TripRouteData | null, places: Map<number, TripPlannerPlace>): string {
  const otherTasks = trip.trip_bookings.filter((booking) => booking.kind === "other");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(trip.title)} · WazaWaza</title><style>
    :root{font-family:Arial,sans-serif;color:#20201e;background:#f4f1e9}*{box-sizing:border-box}body{margin:0}.toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;padding:12px 5vw;border-bottom:1px solid #bbb;background:#f4f1e9}.toolbar button{padding:10px 16px;border:1px solid #222;background:#222;color:#fff;cursor:pointer}main{width:min(900px,90vw);margin:36px auto 70px}.trip-head{padding-bottom:22px;border-bottom:3px solid #222}.trip-head h1{margin:6px 0 10px;font:500 42px/1.05 Georgia,serif}.kicker{margin:0;color:#245e82;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.meta,.notes,.day-notes,.empty{color:#5d5951;line-height:1.5}.day{margin-top:24px;padding:22px;border:1px solid #222;background:#fff;break-inside:avoid}.day>header{display:flex;gap:16px;align-items:center;padding-bottom:14px;border-bottom:1px solid #bbb}.day>header>span{display:grid;min-width:68px;height:38px;place-items:center;background:#245e82;color:#fff;font-size:12px;font-weight:800}.day h2{display:inline;margin:0 10px 0 0;font:500 28px Georgia,serif}.day time{color:#666;font-size:13px}.travel,.lodging{margin-top:14px;padding:13px 15px;background:#eef2f3}.lodging{background:#eef0e6}.travel p,.lodging p{display:inline;margin:0 0 0 8px;color:#5d5951}.stops{display:grid;gap:10px;margin:18px 0 0;padding:0;list-style:none}.stop{padding:14px;border:1px solid #ccc}.stop-title{display:flex;gap:11px;align-items:start}.stop-title>span{display:grid;width:28px;height:28px;flex:none;place-items:center;border-radius:50%;background:#222;color:#fff;font-size:11px}.stop h3{margin:2px 0 3px;font-size:16px}.stop-title p,.stop-transport p{margin:3px 0;color:#5d5951;font-size:12px}.stop-transport{margin-top:10px;padding:9px 11px;border-left:3px solid #245e82;background:#f0f4f5}.notes{margin:9px 0 0}.tasks{margin-top:24px;padding:20px;border:1px solid #222}.tasks h2{margin-top:0;font:500 24px Georgia,serif}.tasks li{margin:7px 0}.privacy{margin-top:20px;color:#777;font-size:11px}@media print{.toolbar{display:none}body{background:#fff}main{width:auto;margin:0}.day{page-break-inside:avoid}.privacy{margin-bottom:0}}@media(max-width:600px){main{width:min(94vw,900px);margin-top:20px}.trip-head h1{font-size:34px}.day{padding:16px}.travel p,.lodging p{display:block;margin:5px 0 0}}
  </style></head><body><div class="toolbar"><button id="print-trip" type="button">Печать / сохранить PDF</button></div><main>
    <header class="trip-head"><p class="kicker">WAZAWAZA · ПЛАН ПОЕЗДКИ</p><h1>${escapeHtml(trip.title)}</h1><p class="meta">${escapeHtml(tripDates(trip))} · ${escapeHtml(STATUS_LABELS[trip.status])}</p>${trip.notes ? `<p class="notes">${escapeHtml(trip.notes)}</p>` : ""}</header>
    ${trip.trip_days.map((day, index) => dayBlock(day, index, trip, route, places)).join("")}
    ${otherTasks.length ? `<section class="tasks"><h2>Прочие дела</h2><ul>${otherTasks.map((booking) => `<li>${escapeHtml(booking.title)} · ${escapeHtml(BOOKING_STATUS_LABELS[booking.status])}${booking.date ? ` · ${escapeHtml(booking.date)}` : ""}</li>`).join("")}</ul></section>` : ""}
    <p class="privacy">Ссылки на бронирования и номера подтверждений намеренно не включены.</p>
  </main></body></html>`;
}

export function openTripExportPreview(): Window {
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("Браузер заблокировал окно экспорта. Разрешите всплывающие окна для WazaWaza.");
  preview.document.write("<!doctype html><title>Готовлю экспорт…</title><p style='font-family:sans-serif;padding:24px'>Готовлю экспорт поездки…</p>");
  preview.document.close();
  return preview;
}

export function writeTripExportPreview(preview: Window, trip: Trip, route: TripRouteData | null, places: Map<number, TripPlannerPlace>): void {
  preview.document.open();
  preview.document.write(buildTripExportHtml(trip, route, places));
  preview.document.close();
  preview.document.querySelector("#print-trip")?.addEventListener("click", () => preview.print());
}
