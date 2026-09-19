import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

// Use the app's existing TypeScript resolver; no browser or live database needed.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: "custom",
});
after(() => server.close());
const { createPlacesState, buildPlacesUrl } = await server.ssrLoadModule("/src/places-url.ts");
const { getTrips, updateRowIfChanged, renumberRows } = await server.ssrLoadModule("/src/trip-api.ts");
const { persistTripForm } = await server.ssrLoadModule("/src/trip-form.ts");
const { tripEditorPage } = await server.ssrLoadModule("/src/trip-view.ts");
const { tripUiState } = await server.ssrLoadModule("/src/trip-ui-state.ts");
const { placeCard } = await server.ssrLoadModule("/src/place-card.ts");
const { renderPlacesPage } = await server.ssrLoadModule("/src/places-view.ts");
const options = { supabaseUrl: "https://example.invalid", supabaseKey: "test-key", session: { access_token: "test-token" }, places: [] };
const places = [{ id: 42, slug: "quiet-temple", prefecture: "東京都" }];

test("place deep links round-trip filters and preserve language and unrelated URL parameters", () => {
  const url = new URL("https://example.invalid/?lang=ja&ref=guide&place=42&pref=東京都&cat=temple&visit=visited&adjacent=1&q=quiet#map");
  const { state, initialPlace } = createPlacesState(places, ["東京都"], ["temple"], url.searchParams);
  assert.equal(initialPlace, places[0]);
  assert.equal(state.selectedPlaceId, 42);
  assert.equal(state.filters.includeAdjacent, true);
  const serialized = buildPlacesUrl(url.href, state, places, "prefectures");
  assert.equal(serialized.searchParams.get("place"), "quiet-temple");
  assert.equal(serialized.searchParams.get("lang"), "ja");
  assert.equal(serialized.searchParams.get("ref"), "guide");
  assert.equal(serialized.searchParams.get("view"), "prefectures");
  assert.equal(serialized.hash, "#map");
  assert.deepEqual(createPlacesState(places, ["東京都"], ["temple"], serialized.searchParams).state, state);
});

test("invalid deep-link filters are cleared without losing the search", () => {
  const url = new URL("https://example.invalid/?place=missing&pref=missing&cat=missing&visit=missing&adjacent=1&q=hello&view=prefectures");
  const { state, initialPlace } = createPlacesState(places, ["東京都"], ["temple"], url.searchParams);
  assert.equal(initialPlace, null);
  assert.deepEqual(state.filters, { prefecture: "", category: "", tag: "", visitStatus: "", includeAdjacent: false, query: "hello" });
  assert.equal(buildPlacesUrl(url.href, state, places, "places").search, "?q=hello");
});

test("trip loading preserves older-schema fallback and day/stop ordering", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    urls.push(new URL(url));
    assert.equal(init.headers.Authorization, "Bearer test-token");
    if (urls.length === 1) return new Response("trip_bookings missing", { status: 400 });
    return Response.json([{ id: 7, trip_days: [
      { id: 2, day_number: 2, trip_stops: [] },
      { id: 1, day_number: 1, trip_stops: [{ id: 12, position: 2 }, { id: 11, position: 1 }] },
    ] }]);
  });
  const [trip] = await getTrips(options, 7);
  assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get("id"), "eq.7");
  assert.ok(!urls[1].searchParams.get("select").includes("trip_bookings"));
  assert.deepEqual(trip.trip_bookings, []);
  assert.deepEqual(trip.trip_days.map(day => day.id), [1, 2]);
  assert.deepEqual(trip.trip_days[0].trip_stops.map(stop => stop.id), [11, 12]);
});

test("saving unchanged times and empty fields performs no writes; changed values use authenticated PATCH", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, ...init });
    return new Response(null, { status: 204 });
  });
  assert.equal(await updateRowIfChanged(options, "trip_stops", 11,
    { planned_time: "09:30:00", notes: null }, { planned_time: "09:30", notes: "" }), false);
  assert.equal(requests.length, 0);
  assert.equal(await updateRowIfChanged(options, "trip_stops", 11,
    { notes: null }, { notes: "Bring tickets" }), true);
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[0].headers.Authorization, "Bearer test-token");
  assert.equal(requests[0].headers.Prefer, "return=minimal");
  assert.deepEqual(JSON.parse(requests[0].body), { notes: "Bring tickets" });
});

test("renumbering avoids intermediate position collisions", async (t) => {
  const positions = new Map([[11, 1], [12, 2]]);
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const id = Number(new URL(url).searchParams.get("id").slice(3));
    const { position } = JSON.parse(init.body);
    assert.ok(![...positions].some(([otherId, value]) => otherId !== id && value === position));
    positions.set(id, position);
    return new Response(null, { status: 204 });
  });
  await renumberRows(options, "trip_stops", [{ id: 12, position: 2 }, { id: 11, position: 1 }], "position");
  assert.deepEqual([...positions], [[11, 2], [12, 1]]);
});

test("trip markup escapes user content and retains map choices across renders", () => {
  tripUiState.savedTripMapLayer = { tripId: 7, mode: "day" };
  tripUiState.savedTripMapDay = { tripId: 7, dayId: 2 };
  const trip = { id: 7, title: '<script>alert("x")</script>', status: "idea", trip_days: [{ id: 2, day_number: 1, trip_stops: [] }], trip_bookings: [], supports_day_destinations: true, supports_inline_bookings: true };
  const route = { destinations: [], legs: [], supportsTimes: true, supportsLegDays: true, supportsBookingUrl: true, supportsDestinationDays: true };
  const html = tripEditorPage(options, trip, route, new Map());
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.match(html, /value="day" selected/);
  assert.match(html, /value="2" selected/);
  assert.ok(!html.includes("Точки городов и старые переезды"));
  assert.ok(!html.includes("Повторно выполните"));
  for (const key of Object.keys(tripUiState)) delete tripUiState[key];
});

test("public markup keeps the valid-prefecture count and escapes place names", (t) => {
  const previousLocation = globalThis.location;
  globalThis.location = new URL("https://example.invalid/?lang=en&view=prefectures");
  t.after(() => {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  });
  const app = { innerHTML: "" };
  const fixture = { id: 42, prefecture: "東京都", visited: true, place_translations: [{ name: "<Temple>", summary: "Quiet" }] };
  const result = renderPlacesPage(app, [fixture, { ...fixture, id: 43, prefecture: "Unknown" }], 0, "en");
  assert.equal(result.initialView, "prefectures");
  assert.deepEqual([...result.visitedPrefectures], ["東京都"]);
  assert.ok(!app.innerHTML.includes('class="place-card"'));
  assert.ok(placeCard(fixture, "en").includes("&lt;Temple&gt;"));
  assert.ok(!app.innerHTML.includes("<Temple>"));
});


test("trip form saving validates the title and leaves unchanged records alone", async (t) => {
  const writes = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    writes.push({ url, values: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  });
  const trip = { id: 7, title: "Kyoto", status: "idea", start_date: null, end_date: null, notes: null, trip_days: [], trip_bookings: [] };
  const data = new FormData();
  data.set("title", "   ");
  await assert.rejects(persistTripForm(options, trip, null, data), /Введите название поездки/);
  assert.equal(writes.length, 0);
  data.set("title", " Kyoto ");
  data.set("status", "idea");
  await persistTripForm(options, trip, null, data);
  assert.equal(writes.length, 0);
  data.set("title", " Kyoto in autumn ");
  await persistTripForm(options, trip, null, data);
  assert.equal(writes.length, 1);
  assert.equal(new URL(writes[0].url).pathname, "/rest/v1/trips");
  assert.equal(writes[0].values.title, "Kyoto in autumn");
});

test("reducing a multi-night stay detaches the formerly covered days", async (t) => {
  const writes = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    writes.push({ url, values: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  });
  const makeDay = (id, dayNumber, source) => ({
    id, day_number: dayNumber, date: null, overnight_city: null, lodging_name: null, lodging_url: null, lodging_google_maps_url: null,
    lodging_status: null, lodging_source_day_id: source, notes: null, trip_stops: [], trip_day_transports: [],
  });
  const trip = {
    id: 9, title: "Three nights", status: "planning", start_date: null, end_date: null, notes: null,
    trip_days: [makeDay(1, 1, null), makeDay(2, 2, 1), makeDay(3, 3, 1)], trip_bookings: [],
    supports_lodging_spans: true, supports_inline_bookings: false, supports_day_destinations: false,
    supports_daily_itinerary: false, supports_multiple_transports: false, supports_stop_transport: false,
  };
  const data = new FormData();
  data.set("title", trip.title);
  data.set("status", trip.status);
  data.set("day_1_lodging_nights", "1");
  data.set("day_2_lodging_source_day_id", "1");
  data.set("day_3_lodging_source_day_id", "1");
  await persistTripForm(options, trip, null, data);
  const dayWrites = writes.filter(({ url }) => new URL(url).pathname.endsWith("/trip_days"));
  assert.equal(dayWrites.length, 2);
  assert.deepEqual(dayWrites.map(({ values }) => values), [
    { date: null, notes: null, lodging_source_day_id: null },
    { date: null, notes: null, lodging_source_day_id: null },
  ]);
});
