import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT,
  normalizeState,
  maxAperture,
  imageDistance,
  fov,
  dof,
  circleOfConfusion,
  exposureEV,
  optics,
} from "../src/optics.js";
test("zoom narrows field of view", () => assert.ok(fov(16) > fov(50)));
test("lens endpoints respect maximum opening", () => {
  assert.equal(maxAperture(16), 3.5);
  assert.equal(maxAperture(50), 5.6);
});
test("image beyond focal plane for finite subject", () =>
  assert.ok(imageDistance(28, 1.5) > 28));
test("in-focus circle zero", () =>
  assert.equal(circleOfConfusion(28, 5.6, 1.5, 1.5), 0));
test("stop down decreases defocus circle", () =>
  assert.ok(
    circleOfConfusion(50, 16, 1, 2) < circleOfConfusion(50, 5.6, 1, 2),
  ));
test("stop down expands depth of field", () => {
  const a = dof(50, 5.6, 1),
    b = dof(50, 16, 1);
  assert.ok(b.near < a.near);
  assert.ok(b.far > a.far);
});
test("ISO one stop", () =>
  assert.equal(exposureEV(4, 1 / 125, 100) - exposureEV(4, 1 / 125, 200), 1));
test("shutter one stop", () =>
  assert.equal(exposureEV(4, 1 / 250, 100) - exposureEV(4, 1 / 125, 100), 1));
test("normalize bad data", () => {
  const s = normalizeState({ focal: 100, aperture: 1, weather: "invalid" });
  assert.equal(s.focal, 50);
  assert.equal(s.aperture, 5.6);
  assert.equal(s.weather, "golden");
});
test("auto preview exposes consistently", () =>
  assert.equal(optics(DEFAULT).brightness, 1));
test("parameter sweep is finite and sensible", () => {
  for (let f = 16; f <= 50; f += 2)
    for (let n = 6; n <= 22; n += 4)
      for (let focus = 0.4; focus < 5; focus += 0.2) {
        const s = normalizeState({ ...DEFAULT, focal: f, aperture: n, focus });
        const o = optics(s);
        assert.ok(Number.isFinite(o.coc));
        assert.ok(o.dof.near > 0);
        assert.ok(o.dof.near <= focus);
        assert.ok(o.dof.far >= focus);
        assert.ok(o.diameter > 0);
      }
});
test("boolean and object state corruption falls back safely", () => {
  const s = normalizeState({
    rays: "false",
    animate: null,
    object: "<script>",
    view: "nonsense",
  });
  assert.equal(s.rays, true);
  assert.equal(s.animate, true);
  assert.equal(s.object, "cat");
  assert.equal(s.view, "desk");
});
test("sensor field-of-view anchors", () => {
  assert.ok(Math.abs(fov(16) - 72.56) < 0.2);
  assert.ok(Math.abs(fov(50) - 26.45) < 0.2);
});
test("wide open constraint updates with zoom", () => {
  const s = normalizeState({ ...DEFAULT, focal: 50, aperture: 3.5 });
  assert.equal(s.aperture, 5.6);
});
test("unfocused foreground and background both blur", () => {
  assert.ok(circleOfConfusion(50, 5.6, 1.5, 0.5) > 0);
  assert.ok(circleOfConfusion(50, 5.6, 1.5, 4) > 0);
});
test("manual darkness and ISO recovery", () => {
  const s = { ...DEFAULT, weather: "night", iso: 100, exposureAuto: false };
  const a = optics(s);
  s.iso = 12800;
  const b = optics(s);
  assert.ok(a.brightness < 0.1);
  assert.ok(b.brightness > a.brightness);
});
test("aperture slider and numeric model have matching tenth-stop floor", () => {
  for (let f = 16; f <= 50; f++) {
    const a = maxAperture(f);
    assert.ok(Math.abs(a * 10 - Math.round(a * 10)) < 1e-8);
    assert.equal(
      normalizeState({ ...DEFAULT, focal: f, aperture: 1 }).aperture,
      a,
    );
  }
});
test("further subject has smaller image distance", () =>
  assert.ok(imageDistance(50, 0.4) > imageDistance(50, 4)));
test("larger entrance pupil gathers more light at fixed focal length", () => {
  const a = optics({ ...DEFAULT, aperture: 5.6, exposureAuto: false });
  const b = optics({ ...DEFAULT, aperture: 11.2, exposureAuto: false });
  assert.ok(Math.abs(a.brightness / b.brightness - 4) < 1e-6);
});
test("scene illumination one stop", () => {
  const a = optics({ ...DEFAULT, light: 0.5, exposureAuto: false });
  const b = optics({ ...DEFAULT, light: 1, exposureAuto: false });
  assert.ok(Math.abs(b.brightness / a.brightness - 2) < 1e-6);
});
test("weather cannot resolve inherited object keys", () => {
  for (const weather of ["__proto__", "constructor", "toString", {}, null]) {
    const s = normalizeState({ ...DEFAULT, weather });
    assert.equal(s.weather, "golden");
    assert.ok(Number.isFinite(optics(s).sceneEV));
  }
});

test("immersive filter and object fields reject nonfinite state", () => {
  const s = normalizeState({
    filter: "unknown",
    ndStops: Infinity,
    filterAngle: NaN,
    prismAngle: -1e12,
    catDistance: NaN,
    catOffset: Infinity,
  });
  assert.equal(s.filter, "none");
  assert.equal(s.ndStops, 2);
  assert.equal(s.filterAngle, 0);
  assert.ok(s.prismAngle >= 0 && s.prismAngle < Math.PI * 2);
  assert.equal(s.catDistance, 1.5);
  assert.equal(s.catOffset, 0);
});
