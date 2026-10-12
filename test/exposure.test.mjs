import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT } from "../src/optics.js";
import { exposure } from "../src/exposure.js";
const base = { ...DEFAULT, filter: "none", exposureAuto: false };
test("ND attenuates manual exposure by exact stops", () => {
  const a = exposure(base),
    b = exposure({ ...base, filter: "nd", ndStops: 3 });
  assert.ok(Math.abs(b.brightness / a.brightness - 1 / 8) < 1e-10);
});
test("auto exposure compensates moderate ND with longer shutter", () => {
  const a = exposure({ ...base, exposureAuto: true }),
    b = exposure({ ...base, exposureAuto: true, filter: "nd", ndStops: 2 });
  assert.ok(Math.abs(b.shutter / a.shutter - 4) < 1e-10);
  assert.ok(Math.abs(b.brightness - 1) < 1e-10);
});
test("automatic compensation respects shutter limits", () => {
  const e = exposure({
    ...base,
    weather: "night",
    filter: "nd",
    ndStops: 8,
    exposureAuto: true,
  });
  assert.equal(e.shutter, 0.25);
  assert.equal(e.limited, true);
  assert.ok(e.brightness < 1);
});
test("doubling exposure time doubles radiance, one stop", () => {
  assert.ok(
    Math.abs(
      exposure({ ...base, shutter: base.shutter * 2 }).brightness /
        exposure(base).brightness -
        2,
    ) < 1e-10,
  );
});
