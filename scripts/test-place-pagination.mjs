import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  envDir: false,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://example.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("test-key"),
  },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: "custom",
});
after(() => server.close());
const { getPlaces } = await server.ssrLoadModule("/src/supabase.ts");

function fixtures(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    prefecture: index < 600 ? "京都府" : "東京都",
    visited: index % 2 === 0,
    visited_at: index % 2 === 0 ? "2026-01-01" : null,
    place_translations: [
      { locale: "ru", name: `Место ${index + 1}` },
      { locale: "ja", name: `場所 ${index + 1}` },
    ],
  }));
}

function mockPages(t, records, cap = Infinity) {
  const offsets = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    offsets.push(offset);
    assert.equal(url.origin, "https://example.invalid");
    assert.equal(url.pathname, "/rest/v1/places");
    assert.equal(url.searchParams.get("order"), "prefecture.asc,id.asc");
    assert.equal(init.headers.apikey, "test-key");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    assert.equal(limit, 500);
    return Response.json(records.slice(offset, offset + Math.min(limit, cap)));
  });
  return offsets;
}

for (const count of [0, 37, 1000, 1237]) {
  test(`loads all ${count} places in order, including the last page`, async (t) => {
    const records = fixtures(count);
    const offsets = mockPages(t, records);
    const places = await getPlaces("ja");
    assert.deepEqual(places.map(place => place.id), records.map(place => place.id));
    assert.ok(places.every(place => place.place_translations[0].locale === "ja"));
    assert.equal(offsets.at(-1), count);
    assert.equal(offsets.length, Math.ceil(count / 500) + 1);
  });
}

test("continues after short pages when the server cap is lower than the requested size", async (t) => {
  const records = fixtures(713);
  const offsets = mockPages(t, records, 200);
  assert.equal((await getPlaces()).length, 713);
  assert.deepEqual(offsets, [0, 200, 400, 600, 713]);
});

test("a later HTTP error rejects the load instead of returning a partial collection", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) return Response.json(fixtures(500));
    return new Response("Database unavailable", { status: 503 });
  });
  await assert.rejects(getPlaces(), /Supabase 503/);
  assert.equal(calls, 2);
});

test("a later network failure rejects the whole load", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) return Response.json(fixtures(500));
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(getPlaces(), /Failed to fetch/);
});

test("legacy visited-column fallback restarts pagination and derives visits on every page", async (t) => {
  const records = fixtures(713).map(({ visited, ...place }) => place);
  const offsets = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    if (url.searchParams.get("select").split(",").includes("visited")) {
      return Response.json({ code: "42703", message: "column places.visited does not exist" }, { status: 400 });
    }
    return Response.json(records.slice(offset, offset + 500));
  });
  const places = await getPlaces("ja");
  assert.equal(places.length, 713);
  assert.deepEqual(offsets, [0, 0, 500, 713]);
  assert.ok(places.every(place => place.visited === Boolean(place.visited_at)));
  assert.ok(places.every(place => place.place_translations[0].locale === "ja"));
});

test("repeated pages fail rather than looping forever or duplicating markers", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(fixtures(2));
  });
  await assert.rejects(getPlaces(), /duplicate records/);
  assert.equal(calls, 2);
});
