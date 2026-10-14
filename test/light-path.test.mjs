import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  lightPathObservation,
  lightPathView,
  lightPathDock,
  focusTargetPatch,
} from "../src/light-path-model.js";
import { VISITOR_BOUNDS } from "../src/camera-space.js";
import { DEFAULT, normalizeState } from "../src/optics.js";
const base = normalizeState({
  ...DEFAULT,
  object: "cat",
  catDistance: 1.5,
  flowerDistance: 2.2,
  chartDistance: 3,
  focus: 1.5,
  aperture: 5.6,
  focal: 50,
});
test("causal spot follows the selected object and reaches zero at focus", () => {
  assert.ok(lightPathObservation(base).blurMm < 1e-8);
  const patch = focusTargetPatch(base, "flower");
  assert.equal(patch.object, "flower");
  assert.equal(patch.distance, 2.2);
  assert.ok(lightPathObservation({ ...base, ...patch }).blurMm < 1e-8);
  assert.equal(focusTargetPatch(base, "__proto__"), null);
});
test("stopping down reduces the same paraxial spot without moving groups", () => {
  const state = { ...base, focus: 3 };
  const a = lightPathObservation(state),
    b = lightPathObservation({ ...state, aperture: 11 });
  assert.ok(b.blurMm < a.blurMm);
  assert.equal(a.rearGroupMm, b.rearGroupMm);
  assert.equal(a.stopMm, b.stopMm);
  assert.equal(a.spotMagnification, 24);
});
test("focus movement changes mechanical rear group and spot together", () => {
  const a = lightPathObservation(base),
    b = lightPathObservation({ ...base, focus: 3 });
  assert.notEqual(a.rearGroupMm, b.rearGroupMm);
  assert.ok(b.blurMm > a.blurMm);
});
test("combined light-path destinations stay inside the visitor bounds", () => {
  for (const width of [320, 390, 650, 1024, 1440]) {
    const v = lightPathView(width);
    for (let i = 0; i < 3; i++)
      assert.ok(
        v.pos[i] >= VISITOR_BOUNDS.min[i] && v.pos[i] <= VISITOR_BOUNDS.max[i],
      );
  }
});

test("monitor and causal plaque fit phone, portrait tablets, and desktop", () => {
  for (const [width, height] of [[320,720], [390,720], [650,900], [768,1024],
    [1024,1366], [1024,768], [1188,762], [1440,900]]) {
    const view = lightPathView(width, height), dock = lightPathDock(width, height);
    const camera = new THREE.PerspectiveCamera(view.fov, width / height, 0.04, 80);
    camera.position.fromArray(view.pos);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld();
    const monitor = new THREE.Object3D();
    monitor.position.fromArray(dock.position);
    monitor.rotation.y = dock.rotationY;
    monitor.scale.setScalar(dock.scale);
    monitor.updateMatrixWorld();
    // The full housing, stand, and forward explanatory plaque, not just center.
    const points = [];
    for (const x of [-0.56, 0.56]) for (const y of [-0.735, 0.41])
      for (const z of [-0.175, 0.175]) points.push([x, y, z]);
    for (const x of [dock.plaqueX - 0.565, dock.plaqueX + 0.565])
      for (const y of [-0.707, -0.453]) points.push([x, y, 0.56]);
    for (const xyz of points) {
      const point = new THREE.Vector3(...xyz).applyMatrix4(monitor.matrixWorld).project(camera);
      assert.ok(Math.abs(point.x) < 0.95 && Math.abs(point.y) < 0.9,
        `${width}×${height}: projected bounds ${point.toArray()}`);
      assert.ok(point.z > -1 && point.z < 1);
    }
  }
});
