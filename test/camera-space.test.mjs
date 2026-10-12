import test from "node:test";
import assert from "node:assert/strict";
import { constrainVisitor, prismInspectionView, VISITOR_BOUNDS as b } from "../src/camera-space.js";
test("interior station is unchanged", () =>
  assert.deepEqual(
    constrainVisitor([0.7, 2.4, 3.25], [1.3, 1.62, 0]),
    [0.7, 2.4, 3.25],
  ));
test("ceiling and wall constraints preserve viewing direction", () => {
  const t = [1.3, 1.62, 0];
  for (const p of [
    [1, 20, 3],
    [-20, 3, 1],
    [3, 2, -20],
    [1, 4, 25],
  ]) {
    const q = constrainVisitor(p, t);
    const ratios = q.map((v, i) => (v - t[i]) / (p[i] - t[i]));
    assert.ok(Math.max(...ratios) - Math.min(...ratios) < 1e-10);
    q.forEach((v, i) =>
      assert.ok(v >= b.min[i] - 1e-10 && v <= b.max[i] + 1e-10),
    );
  }
});
test("all orbit elevations and headings remain within room", () => {
  for (let a = 0; a < 360; a += 3)
    for (let e = 0; e <= 90; e += 3) {
      const r = (a * Math.PI) / 180,
        h = (e * Math.PI) / 180;
      const q = constrainVisitor(
        [
          19 * Math.cos(r) * Math.cos(h),
          1.5 + 19 * Math.sin(h),
          19 * Math.sin(r) * Math.cos(h),
        ],
        [0, 1.5, 0],
      );
      q.forEach((v, i) =>
        assert.ok(v >= b.min[i] - 1e-9 && v <= b.max[i] + 1e-9),
      );
    }
});

test("prism inspection destinations are reachable and stationary after clamping", () => {
  for (const width of [320, 390, 649, 650, 1188, 1920]) {
    const view = prismInspectionView(width);
    assert.deepEqual(constrainVisitor(view.pos, view.target), view.pos);
    view.pos.forEach((v, i) => assert.ok(v >= b.min[i] && v <= b.max[i]));
  }
});
