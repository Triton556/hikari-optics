import test from "node:test";
import assert from "node:assert/strict";
import {
  imageDistance,
  circleOfConfusion,
  maxAperture,
  normalizeState,
  DEFAULT,
} from "../src/optics.js";
// Independent ray-similarity check against circle-of-confusion implementation.
test("similar triangles agree with sensor footprint across the optical range", () => {
  for (const focal of [16, 20, 28, 35, 50])
    for (const aperture of [maxAperture(focal), 8, 16, 22])
      for (const focus of [0.3, 0.7, 1.5, 5])
        for (const distance of [0.4, 1, 2, 4]) {
          const sensor = imageDistance(focal, focus),
            image = imageDistance(focal, distance),
            radius = focal / aperture / 2;
          const top = radius * (1 - sensor / image),
            bottom = -radius * (1 - sensor / image);
          assert.ok(
            Math.abs(
              Math.abs(top - bottom) -
                circleOfConfusion(focal, aperture, focus, distance),
            ) < 1e-9,
          );
        }
});
test("a one-dimensional thin lens inverts image orientation", () => {
  for (const focal of [16, 28, 50])
    for (const distance of [0.4, 1.5, 4]) {
      const u = distance * 1000,
        v = imageDistance(focal, distance),
        height = 100;
      const centralRaySlope = -height / u;
      assert.ok(centralRaySlope * v < 0);
      assert.ok(Math.abs(1 / u + 1 / v - 1 / focal) < 1e-12);
    }
});
test("extreme persisted numeric values cannot propagate NaN to supported fields", () => {
  for (const value of [
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    "bad",
    0,
    -1,
    1e90,
  ]) {
    const s = normalizeState(
      Object.fromEntries(
        [
          "focal",
          "aperture",
          "focus",
          "distance",
          "light",
          "shutter",
          "iso",
          "explode",
        ].map((k) => [k, value]),
      ),
    );
    for (const k of [
      "focal",
      "aperture",
      "focus",
      "distance",
      "light",
      "shutter",
      "iso",
      "explode",
    ])
      assert.ok(Number.isFinite(s[k]), `${k}: ${value}`);
  }
});
