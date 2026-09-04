import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getVisitedPrefectureCounts } from "../src/visited.ts";
import { PREFECTURE_NAMES } from "../src/prefectures.ts";

test("counts dated and undated visits, without counting an unvisited place", () => {
  const counts = getVisitedPrefectureCounts([
    { prefecture: "東京都", visited: true, visited_at: null },
    { prefecture: "東京都", visited: true, visited_at: "2024-03-01" },
    { prefecture: "神奈川県", visited: false, visited_at: "2023-01-01" },
    { prefecture: "大阪府", visited: false, visited_at: null },
  ]);
  assert.deepEqual([...counts], [["東京都", 2], ["神奈川県", 1]]);
});

test("no visits produces an empty overview", () => {
  assert.equal(getVisitedPrefectureCounts([]).size, 0);
  assert.equal(getVisitedPrefectureCounts([
    { prefecture: "東京都", visited: false, visited_at: null },
  ]).size, 0);
});

test("bundled boundaries contain exactly the 47 named prefectures", () => {
  const boundaries = JSON.parse(readFileSync(new URL("../public/prefectures.geojson", import.meta.url), "utf8"));
  const names = boundaries.features.map((feature) => feature.properties.N03_001);
  assert.equal(boundaries.type, "FeatureCollection");
  assert.equal(names.length, 47);
  assert.equal(new Set(names).size, 47);
  assert.deepEqual(names.sort(), [...PREFECTURE_NAMES].sort());
  assert.ok(boundaries.features.every((feature) =>
    ["Polygon", "MultiPolygon"].includes(feature.geometry.type)
  ));
});
