import test from "node:test";
import assert from "node:assert/strict";
import { inlineBeam, WAVELENGTHS } from "../src/inline-optics.js";
import { solveLens } from "../src/lens-system.js";
const s = {
  prismAngle: (8 * Math.PI) / 180,
  inlineSourceAngle: -0.85,
  prismShape: "prism",
  aperture: 5.6,
};
const lens = solveLens(28, 1.5);
test("aligned prism transmits a continuous green path through lens onto sensor", () => {
  const r = inlineBeam(s, lens, 550);
  assert.equal(r.status, "sensor");
  assert.ok(Math.abs(r.sensorX) < 0.03);
  assert.equal(r.points.at(-1)[0], 2.55);
  assert.ok(r.points.every((p) => p.every(Number.isFinite)));
});
test("prism dispersion remains ordered on sensor", () => {
  const red = inlineBeam(s, lens, 650),
    blue = inlineBeam(s, lens, 470);
  assert.equal(red.status, "sensor");
  assert.equal(blue.status, "sensor");
  assert.ok(red.sensorX < blue.sensorX);
});
test("closing the iris never creates additional accepted rays", () => {
  const count = (a) =>
    WAVELENGTHS.filter(
      (w) => inlineBeam({ ...s, aperture: a }, lens, w).status === "sensor",
    ).length;
  assert.ok(count(22) <= count(5.6));
});
test("rotated input beam does not silently remain at the previous detector point", () => {
  const r = inlineBeam({ ...s, inlineSourceAngle: 0 }, lens);
  assert.notEqual(r.status, "sensor");
});
