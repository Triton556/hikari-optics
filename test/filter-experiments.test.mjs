import test from "node:test";
import assert from "node:assert/strict";
import { glassReflection } from "../src/filter-experiments.js";
test("normal incidence glass reflection is 4%, independent of polarizer orientation", () => {
  assert.ok(Math.abs(glassReflection(1, 0) - 0.04) < 1e-10);
  assert.ok(
    Math.abs(glassReflection(1, 0, true) - glassReflection(1, 90, true)) <
      1e-10,
  );
});
test("Brewster-angle p reflection vanishes while s reflection remains", () => {
  const ci = Math.cos(Math.atan(1.5));
  assert.ok(glassReflection(ci, 90, true) < 1e-10);
  assert.ok(glassReflection(ci, 0, true) > 0.14);
});
test("reflection remains bounded at all angles", () => {
  for (let i = 0; i <= 90; i++)
    for (let a = 0; a <= 180; a += 5) {
      const r = glassReflection(Math.cos((i * Math.PI) / 180), a, true);
      assert.ok(r >= 0 && r <= 1);
    }
});
