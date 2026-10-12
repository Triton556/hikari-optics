import test from "node:test";
import assert from "node:assert/strict";
import {
  refract,
  glassIndex,
  tracePrism,
  prismVertices,
} from "../src/refraction.js";
test("normal incidence does not bend", () => {
  const r = refract([1, 0], [-1, 0], 1, 1.5);
  assert.ok(Math.abs(r.direction[1]) < 1e-12);
  assert.equal(r.tir, false);
});
test("Snell sine ratio and total internal reflection", () => {
  const a = Math.PI / 6,
    r = refract([Math.cos(a), Math.sin(a)], [-1, 0], 1, 1.5);
  assert.ok(Math.abs(r.direction[1] - 0.5 / 1.5) < 1e-12);
  assert.equal(refract([0.5, Math.sqrt(0.75)], [-1, 0], 1.5, 1).tir, true);
});
test("blue glass refractive index exceeds red", () =>
  assert.ok(glassIndex(450) > glassIndex(650)));
test("parallel slab returns original direction", () => {
  const r = tracePrism(
    [-2, 0.1],
    [1, 0.2],
    [
      [-0.5, -2],
      [0.5, -2],
      [0.5, 2],
      [-0.5, 2],
    ],
  );
  assert.ok(Math.abs(r.direction[1] / r.direction[0] - 0.2) < 1e-10);
  assert.equal(r.inside, false);
});
test("prism splits blue and red directions", () => {
  const p = prismVertices(0, 0, 0.65, 50*Math.PI/180),
    b = tracePrism([-2, 0], [1, 0], p, 450),
    r = tracePrism([-2, 0], [1, 0], p, 650);
  assert.ok(b.path.length >= 4);
  assert.ok(Math.abs(b.direction[1] - r.direction[1]) > 0.001);
});

test("mirror obeys equal angle reflection", async () => {
  const { traceMirror } = await import("../src/refraction.js");
  const r = traceMirror([-2, 0], [1, 0], [0, 0], Math.PI / 4);
  assert.ok(Math.abs(r.direction[0]) < 1e-10);
  assert.ok(Math.abs(r.direction[1] - 1) < 1e-10);
});
test("ray missing finite mirror is not reflected", async () => {
  const { traceMirror } = await import("../src/refraction.js");
  const r = traceMirror([-2, 3], [1, 0], [0, 0], Math.PI / 2, 0.5);
  assert.deepEqual(r.direction, [1, 0]);
  assert.equal(r.path.length, 2);
});
test("rotated slab preserves parallel outgoing ray", async () => {
  const { glassSlabVertices } = await import("../src/refraction.js");
  const r = tracePrism([-2, 0], [1, 0], glassSlabVertices(0, 0, 0.3, 2, 0.3));
  assert.ok(Math.abs(r.direction[1]) < 1e-10);
  assert.equal(r.inside, false);
});

test("full prism rotation has bounded finite traces including exact tips", () => {
  for (let i = 0; i < 360; i++) {
    const r = tracePrism(
      [-0.79, 0],
      [1, 0],
      prismVertices(0.1, 0, 0.3, (i * Math.PI) / 180),
    );
    assert.ok(r.path.length <= 10);
    assert.equal(r.inside, false, `angle ${i}`);
    for (const point of r.path) assert.ok(point.point.every(Number.isFinite));
  }
});

test('N-F2 dispersion agrees with manufacturer reference indices',()=>{for(const [w,n]of [[587.6,1.62005],[486.1,1.63208],[656.3,1.61506],[435.8,1.64209]])assert.ok(Math.abs(glassIndex(w)-n)<2e-5,`${w} nm`)});
