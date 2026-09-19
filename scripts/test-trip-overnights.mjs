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
