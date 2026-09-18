import assert from "node:assert/strict";
import { after, test } from "node:test";
import { TAGS, tagLabel, knownTagIds, mergePlaceTags } from "../src/tags.ts";
import { createServer } from "vite";
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
after(() => server.close());
const { getMatchingPlaces } = await server.ssrLoadModule("/src/state.ts");
const { createPlacesState, buildPlacesUrl } = await server.ssrLoadModule("/src/places-url.ts");
const { placeCard } = await server.ssrLoadModule("/src/place-card.ts");

test("catalog has unique stable IDs and all three labels", () => {
  assert.equal(new Set(TAGS.map(tag => tag.id)).size, TAGS.length);
  for (const tag of TAGS) for (const locale of ["ru", "ja", "en"]) assert.ok(tagLabel(tag.id, locale));
});
test("legacy dark passage aliases resolve to one translated ID", () => {
  assert.deepEqual(knownTagIds(["戒壇巡り", "kaidan-meguri", "unknown"]), ["kaidan-meguri"]);
  assert.equal(tagLabel("戒壇巡り", "ja"), "戒壇巡り");
  assert.equal(tagLabel("unknown", "en"), "unknown");
});
test("editing selected tags retains uncatalogued legacy tags and removes deselected IDs", () => {
  assert.deepEqual(mergePlaceTags(["фотогенично", "anime", "戒壇巡り"], ["work-haikyu"]), ["фотогенично", "work-haikyu"]);
});
test("tag filtering combines with prefecture, category and visited filters", () => {
  const places = [
    { id: 1, prefecture: "東京都", category: "temple", visited: true, tags: ["戒壇巡り"], place_translations: [] },
    { id: 2, prefecture: "東京都", category: "museum", visited: true, tags: ["anime"], place_translations: [] },
    { id: 3, prefecture: "北海道", category: "temple", visited: true, tags: ["kaidan-meguri"], place_translations: [] },
  ];
  const filters = { prefecture: "東京都", category: "temple", visitStatus: "visited", tag: "kaidan-meguri", query: "", includeAdjacent: false };
  assert.deepEqual(getMatchingPlaces(places, filters).map(place => place.id), [1]);
  assert.deepEqual(getMatchingPlaces(places, { ...filters, query: "dark passage" }).map(place => place.id), [1]);
  assert.deepEqual(getMatchingPlaces(places, { ...filters, visitStatus: "unvisited" }), []);
});
test("tag deep link survives language switching and reset removes it", () => {
  const { state } = createPlacesState([], [], [], new URLSearchParams("tag=work-haikyu"));
  assert.equal(state.filters.tag, "work-haikyu");
  assert.equal(buildPlacesUrl("https://example.com/?lang=ja", state, [], "places").searchParams.get("tag"), "work-haikyu");
  state.filters.tag = "";
  assert.equal(buildPlacesUrl("https://example.com/?tag=work-haikyu", state, [], "places").searchParams.has("tag"), false);
  assert.equal(createPlacesState([], [], [], new URLSearchParams("tag=unknown")).state.filters.tag, "");
});
test("cards show translated catalog tags and escape unknown legacy tags", () => {
  const place = { id: 1, prefecture: "東京都", tags: ["work-haikyu", "<script>"], place_translations: [] };
  assert.match(placeCard(place, "ja"), /ハイキュー!!/);
  assert.ok(!placeCard(place, "ja").includes("<script>"));
});
