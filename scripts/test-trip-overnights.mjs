import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
after(() => server.close());
const { tripEditorPage } = await server.ssrLoadModule("/src/trip-view.ts");
const { buildTripExportHtml } = await server.ssrLoadModule("/src/trip-export.ts");
const { buildTelegramTripMessages } = await server.ssrLoadModule("/src/trip-telegram-export.ts");

const destinations = [
  { id: 13, name: "Комацу", position: 1, trip_day_id: 10 },
  { id: 14, name: "Тояма", position: 2, trip_day_id: 11 },
];
const route = { destinations, legs: [], supportsTimes: true, supportsLegDays: true, supportsBookingUrl: true, supportsDestinationDays: true };

function day(id, dayNumber, cityDestinationId, destinationId, extra = {}) {
  return {
    id, day_number: dayNumber, date: `2026-10-${9 + dayNumber}`, city_destination_id: cityDestinationId,
    destination_id: destinationId, overnight_city: null, lodging_name: null, lodging_url: null,
    lodging_status: null, transport_mode: "train", transport_details: null,
    transport_booking_url: null, transport_departure_time: null, transport_arrival_time: null,
    transport_booked: false, transport_paid: false, notes: null, trip_stops: [], trip_day_transports: [], ...extra,
  };
}

function transport(id, position, fromName, toName, extra = {}) {
  return {
    id, position, mode: "train", from_name: fromName, to_name: toName, details: null, booking_url: null,
    departure_time: null, arrival_time: null, booked: false, paid: false, ...extra,
  };
}

test("day-first overview represents Komatsu, Komatsu, Toyama with travel home", () => {
  const trip = {
    id: 2, title: "Исикава — Тояма", status: "planning", start_date: "2026-10-10", end_date: null,
    notes: null, home_city: "Токио", supports_daily_itinerary: true, supports_multiple_transports: true,
    supports_day_destinations: true, supports_inline_bookings: true, trip_bookings: [],
    trip_days: [
      day(10, 1, 13, 13, { lodging_name: "Hotel & Komatsu", lodging_status: "booked", trip_day_transports: [transport(101, 1, "Токио", "Комацу")] }),
      day(11, 2, 13, 14, { lodging_name: "Toyama hotel", trip_day_transports: [transport(102, 1, "Комацу", "Тояма")] }),
      day(12, 3, 14, null, { trip_day_transports: [transport(103, 1, "Тояма", "Токио")] }),
    ],
  };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  assert.match(html, /name="day_transport_101_from_name" value="Токио"/);
  assert.match(html, /name="day_transport_102_to_name" value="Тояма"/);
  assert.match(html, /name="day_transport_103_to_name" value="Токио"/);
  assert.equal((html.match(/aria-label="Ночёвка после дня/g) ?? []).length, 2);
  assert.equal((html.match(/name="day_10_lodging_name"/g) ?? []).length, 1);
  assert.equal((html.match(/name="day_11_lodging_name"/g) ?? []).length, 1);
  assert.ok(!html.includes('name="day_12_lodging_name"'));
  assert.match(html, /type="hidden" name="day_12_destination_id" value=""/);
  assert.equal((html.match(/data-scroll-day=/g) ?? []).length, 3);
  assert.ok(html.indexOf('data-scroll-day="10"') < html.indexOf('id="trip-day-10"'));
  assert.ok(html.includes("Hotel &amp; Komatsu"));
  assert.ok(!html.includes("Hotel & Komatsu"));
});

test("a saved final-night hotel remains editable", () => {
  const trip = {
    id: 3, title: "Extra night", status: "idea", start_date: null, end_date: null, notes: null,
    home_city: "Токио", supports_daily_itinerary: true, supports_day_destinations: true,
    supports_inline_bookings: true, trip_bookings: [],
    trip_days: [day(15, 1, 14, 14, { lodging_name: "Airport hotel" })],
  };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  assert.match(html, /aria-label="Ночёвка после дня 1"/);
  assert.match(html, /name="day_15_lodging_name" value="Airport hotel"/);
});

test("transport for an individual place is optional and expands only when saved", () => {
  const emptyTransport = {
    id: 81, place_id: null, position: 1, custom_name: "Rabbit park", planned_time: null, notes: null,
    admission_status: null, admission_url: null, to_transport_mode: null, to_transport_details: null,
    to_departure_time: null, to_arrival_time: null, back_transport_mode: null, back_transport_details: null,
    back_departure_time: null, back_arrival_time: null,
  };
  const baseTrip = {
    id: 4, title: "Transport", status: "planning", start_date: null, end_date: null, notes: null,
    home_city: "Токио", supports_daily_itinerary: true, supports_day_destinations: true,
    supports_inline_bookings: true, supports_stop_transport: true, trip_bookings: [],
  };
  const hiddenHtml = tripEditorPage({ places: [] }, {
    ...baseTrip, trip_days: [day(20, 1, 13, null, { trip_stops: [emptyTransport] })],
  }, route, new Map());
  assert.match(hiddenHtml, /data-add-stop-transport="81"/);
  assert.match(hiddenHtml, /data-stop-transport-panel="81" hidden/);
  assert.match(hiddenHtml, /name="stop_81_transport_enabled" value="0"/);

  const visibleHtml = tripEditorPage({ places: [] }, {
    ...baseTrip, trip_days: [day(20, 1, 13, null, { trip_stops: [{
      ...emptyTransport, to_transport_mode: "bus", to_transport_details: "Komatsu station",
      back_transport_mode: "train", back_transport_details: "To Toyama",
    }] })],
  }, route, new Map());
  assert.match(visibleHtml, /name="stop_81_transport_enabled" value="1"/);
  assert.match(visibleHtml, /name="stop_81_to_transport_details" value="Komatsu station"/);
  assert.match(visibleHtml, /name="stop_81_back_transport_details" value="To Toyama"/);
  assert.ok(!visibleHtml.includes('data-stop-transport-panel="81" hidden'));
});

test("print export includes the itinerary but omits private booking links and notes", () => {
  const stop = {
    id: 81, place_id: null, position: 1, custom_name: "Rabbit <park>", planned_time: "09:30:00", notes: "Bring carrots",
    admission_status: "paid", admission_url: "https://tickets.invalid/private", to_transport_mode: "bus",
    to_transport_details: "From station", to_departure_time: "08:45:00", to_arrival_time: "09:20:00",
    back_transport_mode: "train", back_transport_details: "To hotel", back_departure_time: null, back_arrival_time: null,
  };
  const trip = {
    id: 5, title: "Trip <draft>", status: "booked", start_date: "2026-10-10", end_date: null,
    notes: "Personal plan", home_city: "Токио", supports_daily_itinerary: true, supports_multiple_transports: true,
    supports_day_destinations: true, supports_inline_bookings: true, supports_stop_transport: true,
    trip_days: [day(20, 1, 13, 13, { trip_stops: [stop], lodging_url: "https://hotel.invalid/private", trip_day_transports: [
      transport(301, 1, "Карумаи", "Хатинохе", { mode: "bus" }),
      transport(302, 2, "Хатинохе", "Итиносэки"),
    ] })],
    trip_bookings: [{ id: 1, kind: "other", title: "Buy insurance", status: "planned", date: null, url: "https://secret.invalid", notes: "CONFIRMATION-123", position: 1 }],
  };
  const html = buildTripExportHtml(trip, route, new Map());
  assert.ok(html.includes("Trip &lt;draft&gt;"));
  assert.ok(html.includes("Rabbit &lt;park&gt;"));
  assert.ok(html.includes("Карумаи → Хатинохе"));
  assert.ok(html.includes("Хатинохе → Итиносэки"));
  assert.ok(html.includes("Туда:</b> Автобус · From station · 08:45–09:20"));
  assert.ok(html.includes("Buy insurance"));
  assert.ok(!html.includes("tickets.invalid"));
  assert.ok(!html.includes("hotel.invalid"));
  assert.ok(!html.includes("secret.invalid"));
  assert.ok(!html.includes("CONFIRMATION-123"));
});

test("Telegram export splits days and keeps every useful and private link", () => {
  const stop = {
    id: 82, place_id: 77, position: 1, custom_name: null, planned_time: "09:30:00", notes: "Bring carrots",
    admission_status: "paid", admission_url: "https://tickets.example/entry", to_transport_mode: "bus",
    to_transport_details: "From station", to_departure_time: "08:45:00", to_arrival_time: "09:20:00",
    back_transport_mode: "train", back_transport_details: "To hotel", back_departure_time: null, back_arrival_time: null,
  };
  const trip = {
    id: 6, title: "Telegram trip", status: "booked", start_date: "2026-10-10", end_date: null,
    notes: "Private plan", home_city: "Токио", supports_daily_itinerary: true,
    supports_day_destinations: true, supports_inline_bookings: true, supports_stop_transport: true, supports_multiple_transports: true,
    trip_days: [day(20, 1, 13, 13, { trip_stops: [stop], lodging_name: "Hotel", lodging_url: "https://hotel.example/booking", trip_day_transports: [
      transport(201, 1, "Карумаи", "Хатинохе", { mode: "bus", booking_url: "https://bus.example/ticket" }),
      transport(202, 2, "Хатинохе", "Итиносэки", { booking_url: "https://train.example/ticket" }),
    ] })],
    trip_bookings: [{ id: 1, kind: "other", title: "Insurance", status: "planned", date: null, url: "https://insurance.example/form", notes: "Policy note", position: 1 }],
  };
  const places = new Map([[77, {
    id: 77, prefecture: "石川県", municipality: "小松市", latitude: 36.1, longitude: 136.4,
    google_maps_url: "https://maps.example/rabbits", website_url: "https://rabbits.example",
    place_translations: [{ locale: "ru", name: "Кролики" }],
  }]]);
  const messages = buildTelegramTripMessages(trip, route, places);
  assert.equal(messages.length, 2);
  assert.match(messages[0].text, /День 1/);
  assert.match(messages[0].text, /1\. Карумаи → Хатинохе/);
  assert.match(messages[0].text, /2\. Хатинохе → Итиносэки/);
  assert.match(messages[0].text, /https:\/\/bus\.example\/ticket/);
  assert.match(messages[0].text, /https:\/\/train\.example\/ticket/);
  assert.match(messages[0].text, /https:\/\/maps\.example\/rabbits/);
  assert.match(messages[0].text, /https:\/\/rabbits\.example/);
  assert.match(messages[0].text, /https:\/\/tickets\.example\/entry/);
  assert.match(messages[0].text, /https:\/\/hotel\.example\/booking/);
  assert.match(messages[1].text, /https:\/\/insurance\.example\/form/);
  assert.match(messages[1].text, /Policy note/);
});
