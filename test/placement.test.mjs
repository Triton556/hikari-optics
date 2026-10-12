import test from "node:test";
import assert from "node:assert/strict";
import {
  canPlace,
  DEFAULT_DISTANCES,
  DEFAULT_OFFSETS,
} from "../src/placement.js";
test("default subjects do not overlap", () => {
  for (const id of Object.keys(DEFAULT_DISTANCES))
    assert.ok(canPlace({}, id, DEFAULT_DISTANCES[id], DEFAULT_OFFSETS[id]));
});
test("cannot drag a pedestal through another pedestal", () =>
  assert.equal(canPlace({}, "flower", 1.5, 0), false));
test("free empty spot is available", () =>
  assert.equal(canPlace({}, "cat", 0.5, 0), true));

import { canMove } from "../src/placement.js";
test("a fast drag cannot cross another pedestal even if the endpoint is free", () => {
  const state = {
    catDistance: 2,
    catOffset: 0,
    flowerDistance: 0.4,
    flowerOffset: 0,
    chartOffset: 0.8,
  };
  assert.equal(canPlace(state, "flower", 4, 0), true);
  assert.equal(canMove(state, "flower", 4, 0), false);
});
test("clear longitudinal motion and lateral motion are allowed", () => {
  assert.equal(canMove({}, "cat", 0.5, 0), true);
  assert.equal(canMove({}, "flower", 2.2, -0.78), true);
});
