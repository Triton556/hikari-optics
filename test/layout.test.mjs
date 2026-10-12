import test from "node:test";
import assert from "node:assert/strict";
import { placeLabels } from "../src/layout.js";
test("crowded mobile labels fit without overlaps", () => {
  const labels = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    x: 200 + i * 10,
    y: 250 + i * 2,
    visible: true,
  }));
  const p = placeLabels(labels, 375, 490).filter((x) => x.visible);
  assert.equal(p.length, 6);
  for (const a of p) {
    assert.ok(a.x - a.w / 2 >= 0 && a.x + a.w / 2 <= 375);
    for (const b of p)
      if (a !== b)
        assert.ok(
          Math.abs(a.x - b.x) >= (a.w + b.w) / 2 ||
            Math.abs(a.y - b.y) >= (a.h + b.h) / 2,
        );
  }
});
test("offscreen labels never reserve visible space", () => {
  const p = placeLabels(
    [
      { id: "a", x: 10, y: 10, visible: false },
      { id: "b", x: 180, y: 200, visible: true },
    ],
    360,
    440,
  );
  assert.equal(p.find((x) => x.id === "a").visible, false);
  assert.equal(p.find((x) => x.id === "b").y, 200);
});
