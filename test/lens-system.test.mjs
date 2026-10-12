import test from "node:test";
import assert from "node:assert/strict";
import {
  solveLens,
  traceRay,
  rayThroughStop,
  stopRadius,
  sensorBlur,
  filterTransmission,
  polarizedReflection,
} from "../src/lens-system.js";
test("mechanical zoom solver spans the full range and focus envelope", () => {
  for (let f = 16; f <= 50; f++)
    for (const d of [0.25, 0.3, 0.5, 1, 1.5, 3, 5]) {
      const s = solveLens(f, d);
      assert.ok(Math.abs(s.effectiveFocal - f) < 1e-6);
      assert.ok(Math.abs(traceRay(s, d, 0, 1).y) < 1e-6);
      assert.ok(s.positions.every((x, i, a) => !i || x > a[i - 1]));
    }
});
test("off-axis rays converge to the same inverted image when focused", () => {
  const s = solveLens(35, 1.5),
    r = stopRadius(s, 5.6),
    a = rayThroughStop(s, 1.5, 100, -r),
    b = rayThroughStop(s, 1.5, 100, r);
  assert.ok(a.y < 0);
  assert.ok(Math.abs(a.y - b.y) < 1e-8);
});
test("mechanical focus shifts rear group and reduces sensor blur", () => {
  const near = solveLens(50, 0.5),
    far = solveLens(50, 1.5);
  assert.ok(Math.abs(near.b - far.b) > 0.5);
  assert.ok(sensorBlur(near, 1.5, 5.6) > 0.05);
  assert.ok(sensorBlur(far, 1.5, 5.6) < 1e-8);
});
test("aperture constrains bundle without changing glass positions", () => {
  const s = solveLens(28, 1.5);
  assert.ok(Math.abs(stopRadius(s, 5.6) / stopRadius(s, 11.2) - 2) < 1e-9);
  assert.ok(sensorBlur(s, 2, 16) < sensorBlur(s, 2, 5.6));
});
test("ND attenuation and polarization obey their distinct laws", () => {
  assert.equal(filterTransmission("nd", 3), 1 / 8);
  assert.equal(polarizedReflection(0), 1);
  assert.ok(polarizedReflection(90) < 1e-20);
  assert.equal(filterTransmission("none"), 1);
});

test("focus sweep changes blur continuously without NaN", () => {
  for (let i = 0; i < 200; i++) {
    const focus = 0.3 + (i * 4.7) / 199,
      s = solveLens(28, focus),
      blur = sensorBlur(s, 1.5, 5.6);
    assert.ok(Number.isFinite(blur) && blur >= 0 && blur < 100);
  }
});
test("ray transfer preserves optical phase-space area", async () => {
  const { systemMatrix } = await import("../src/lens-system.js");
  for (const f of [16, 28, 50]) {
    const s = solveLens(f, 1.5),
      m = systemMatrix(s.a, s.b);
    assert.ok(Math.abs(m[0] * m[3] - m[1] * m[2] - 1) < 1e-10);
  }
});
