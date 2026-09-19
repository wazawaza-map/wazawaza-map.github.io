import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
after(() => server.close());
const { tripEditorPage } = await server.ssrLoadModule("/src/trip-view.ts");

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
    transport_booked: false, transport_paid: false, notes: null, trip_stops: [], ...extra,
  };
}

test("day-first overview represents Komatsu, Komatsu, Toyama with travel home", () => {
  const trip = {
    id: 2, title: "Исикава — Тояма", status: "planning", start_date: "2026-10-10", end_date: null,
    notes: null, home_city: "Токио", supports_daily_itinerary: true,
    supports_day_destinations: true, supports_inline_bookings: true, trip_bookings: [],
    trip_days: [
      day(10, 1, 13, 13, { lodging_name: "Hotel & Komatsu", lodging_status: "booked" }),
      day(11, 2, 13, 14, { lodging_name: "Toyama hotel" }),
      day(12, 3, 14, null),
    ],
  };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  assert.match(html, /value="Токио → Комацу"/);
  assert.match(html, /value="Комацу → Тояма"/);
  assert.match(html, /value="Тояма → Токио"/);
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
