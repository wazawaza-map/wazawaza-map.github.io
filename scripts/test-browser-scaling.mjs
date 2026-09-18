import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: "custom",
});
after(() => server.close());
const { createPlaceIndex, CLUSTER_MAX_ZOOM } = await server.ssrLoadModule("/src/place-index.ts");
const { getCardPage, CARD_PAGE_SIZE } = await server.ssrLoadModule("/src/card-page.ts");
const { getMatchingPlaces } = await server.ssrLoadModule("/src/state.ts");

const places = Array.from({ length: 10000 }, (_, id) => ({
  id, latitude: 35 + Math.floor(id / 100) * 0.001,
  longitude: 139 + (id % 100) * 0.001,
  prefecture: "東京都", category: null, tags: [],
  visited: id % 2 === 0, visited_at: null, place_translations: [],
}));
const allBounds = [138, 34, 141, 37];

test("10,000 nearby places become a few overview clusters without losing their counts", () => {
  const index = createPlaceIndex(places);
  const features = index.getClusters(allBounds, 5);
  assert.ok(features.length < 20);
  assert.equal(features.reduce((count, feature) => count + (feature.properties.point_count ?? 1), 0), places.length);
  const cluster = features.find(feature => feature.properties.cluster);
  assert.ok(index.getClusterExpansionZoom(cluster.properties.cluster_id) > 5);
  assert.equal(index.getLeaves(cluster.properties.cluster_id, Infinity).length, cluster.properties.point_count);
});

test("viewport card candidates use real points rather than cluster centers", () => {
  const index = createPlaceIndex(places);
  const bounds = [139.02, 35.02, 139.04, 35.04];
  const actual = index.getClusters(bounds, CLUSTER_MAX_ZOOM + 1).map(feature => feature.properties.placeId).sort((a, b) => a - b);
  // Stay away from floating-point boundary rounding in the spatial index.
  const interiorBounds = [139.0201, 35.0201, 139.0399, 35.0399];
  const expected = places.filter(place => place.longitude > interiorBounds[0] && place.longitude < interiorBounds[2] && place.latitude > interiorBounds[1] && place.latitude < interiorBounds[3]);
  assert.ok(expected.every(place => actual.includes(place.id)));
  assert.ok(actual.length < places.length / 10);
  assert.equal(new Set(actual).size, actual.length);
});

test("clusters contain only places matching the current filters", () => {
  const matching = getMatchingPlaces(places, { prefecture: "", category: "", query: "", includeAdjacent: false, visitStatus: "visited" });
  const index = createPlaceIndex(matching);
  const features = index.getClusters(allBounds, 5);
  assert.equal(features.reduce((count, feature) => count + (feature.properties.point_count ?? 1), 0), 5000);
  const ids = index.getClusters(allBounds, CLUSTER_MAX_ZOOM + 1).map(feature => feature.properties.placeId);
  assert.ok(ids.every(id => id % 2 === 0));
  assert.deepEqual(createPlaceIndex([]).getClusters(allBounds, 5), []);
});

test("coincident places remain available individually for cards at maximum zoom", () => {
  const index = createPlaceIndex(places.slice(0, 100).map(place => ({ ...place, latitude: 35, longitude: 139 })));
  assert.equal(index.getClusters(allBounds, 10)[0].properties.point_count, 100);
  assert.equal(index.getClusters(allBounds, CLUSTER_MAX_ZOOM + 1).length, 100);
});

test("all card pages are bounded and reach every result exactly once", () => {
  const found = [];
  for (let page = 0; page < Math.ceil(places.length / CARD_PAGE_SIZE); page++) {
    const result = getCardPage(places, page);
    assert.ok(result.items.length <= 30);
    found.push(...result.items.map(place => place.id));
  }
  assert.deepEqual(found, places.map(place => place.id));
});

test("shrinking or empty result sets clamp the requested card page", () => {
  const result = getCardPage(places.slice(0, 35), 20);
  assert.equal(result.page, 1);
  assert.equal(result.start, 31);
  assert.equal(result.end, 35);
  assert.equal(result.items.length, 5);
  assert.equal(getCardPage([], 20).page, 0);
  assert.equal(getCardPage([], 20).start, 0);
  assert.deepEqual(getCardPage([], 20).items, []);
});
