import assert from "node:assert/strict";
import { test } from "node:test";
import { pickRandomPlace } from "../src/random-place.ts";

const places = [{ id: 1 }, { id: 2 }, { id: 3 }];

test("returns null when there are no candidates", () => {
  assert.equal(pickRandomPlace([], null), null);
});

test("selects from the supplied candidates", () => {
  assert.equal(pickRandomPlace(places, null, () => 0)?.id, 1);
  assert.equal(pickRandomPlace(places, null, () => 0.999)?.id, 3);
});

test("does not immediately repeat the selected place when alternatives exist", () => {
  assert.equal(pickRandomPlace(places, 1, () => 0)?.id, 2);
  assert.equal(pickRandomPlace([{ id: 1 }], 1, () => 0)?.id, 1);
});
