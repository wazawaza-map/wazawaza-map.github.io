import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
after(() => server.close());
const { tripEditorPage } = await server.ssrLoadModule("/src/trip-view.ts");

test("overnight appears between its city and outbound transport, with travel from and back home", () => {
  const trip = {
    id: 1, title: "Test", status: "idea", start_date: null, end_date: null, notes: null,
    supports_day_destinations: true, supports_inline_bookings: true, trip_bookings: [],
    trip_days: [{ id: 10, day_number: 1, date: null, destination_id: 3, lodging_name: "Hotel <X>", lodging_url: "https://example.com", lodging_status: "booked", notes: null, trip_stops: [] }],
  };
  const route = {
    destinations: [{ id: 2, name: "Home", position: 1 }, { id: 3, name: "Sendai", position: 2 }, { id: 4, name: "Home", position: 3 }],
    legs: [
      { id: 20, from_destination_id: 2, to_destination_id: 3, mode: "train" },
      { id: 21, from_destination_id: 3, to_destination_id: 4, mode: "train" },
    ], supportsTimes: true, supportsLegDays: true, supportsBookingUrl: true, supportsDestinationDays: true,
  };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  const home = html.indexOf('data-destination-id="2"');
  const outbound = html.indexOf('data-leg-id="20"');
  const city = html.indexOf('data-destination-id="3"');
  const firstNight = html.indexOf('aria-label="Ночёвка после дня 1"');
  const returnLeg = html.indexOf('data-leg-id="21"');
  const returnHome = html.indexOf('data-destination-id="4"');
  assert.ok(home < outbound && outbound < city && city < firstNight && firstNight < returnLeg && returnLeg < returnHome);
  assert.ok(returnHome < html.indexOf('data-day-id="10"'));
  assert.match(html, /name="day_10_destination_id"/);
  assert.match(html, /name="day_10_lodging_name" value="Hotel &lt;X&gt;"/);
  assert.match(html, /name="day_10_lodging_url" type="url" value="https:\/\/example.com"/);
  assert.match(html, /name="day_10_lodging_status"/);
  assert.equal((html.match(/name="day_10_lodging_name"/g) ?? []).length, 1);
  assert.ok(!html.includes("Hotel <X>"));
});

test("unassigned nights remain editable exactly once", () => {
  const trip = { id: 1, title: "Test", status: "idea", trip_bookings: [], supports_day_destinations: true, supports_inline_bookings: true,
    trip_days: [{ id: 12, day_number: 2, destination_id: null, lodging_name: "Ryokan", trip_stops: [] }] };
  const route = { destinations: [{ id: 3, name: "Sendai", position: 1 }], legs: [], supportsTimes: true, supportsLegDays: true, supportsBookingUrl: true, supportsDestinationDays: true };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  assert.match(html, /Ночёвки без выбранного города/);
  assert.equal((html.match(/name="day_12_lodging_name"/g) ?? []).length, 1);
});

test("empty night after the final city is hidden without losing its day base", () => {
  const trip = { id: 1, title: "Return home", status: "idea", trip_bookings: [], supports_day_destinations: true, supports_inline_bookings: true,
    trip_days: [{ id: 15, day_number: 2, destination_id: 4, lodging_name: null, lodging_url: null, lodging_status: null, trip_stops: [] }] };
  const route = { destinations: [{ id: 3, name: "Sendai", position: 1 }, { id: 4, name: "Home", position: 2 }], legs: [], supportsTimes: true, supportsLegDays: true, supportsBookingUrl: true, supportsDestinationDays: true };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  assert.ok(!html.includes('aria-label="Ночёвка после дня 2"'));
  assert.match(html, /type="hidden" name="day_15_destination_id" value="4"/);
  assert.ok(!html.includes('name="day_15_lodging_name"'));
});

test("previously saved lodging after final city stays editable", () => {
  const trip = { id: 1, title: "Extra night", status: "idea", trip_bookings: [], supports_day_destinations: true, supports_inline_bookings: true,
    trip_days: [{ id: 15, day_number: 2, destination_id: 4, lodging_name: "Airport hotel", lodging_url: null, lodging_status: null, trip_stops: [] }] };
  const route = { destinations: [{ id: 4, name: "Home", position: 1 }], legs: [], supportsTimes: true, supportsLegDays: true, supportsBookingUrl: true, supportsDestinationDays: true };
  const html = tripEditorPage({ places: [] }, trip, route, new Map());
  assert.match(html, /aria-label="Ночёвка после дня 2"/);
  assert.match(html, /name="day_15_lodging_name" value="Airport hotel"/);
});
