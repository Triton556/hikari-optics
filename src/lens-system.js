// Educational nine-element paraxial zoom, not a manufacturer's prescription.
// Fixed element powers; zoom/focus change mechanical group positions. Distances mm.
export const ELEMENT_POWERS = Object.freeze([
  0.035, -0.02, 0.012, -0.04, 0.015, -0.04, 0.045, -0.025, 0.04,
]);
export const SENSOR_X = 80;
export const WORLD_SCALE = 2.3 / SENSOR_X;
export const FRONT_X = 0.25;
export function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}
const T = (d) => [1, d, 0, 1],
  L = (p) => [1, 0, -p, 1];
export function elementPositions(a, b) {
  return [0, 2, 4, a, a + 2, a + 4, b, b + 2, b + 4];
}
export function systemMatrix(a, b) {
  const xs = elementPositions(a, b);
  let m = [1, 0, 0, 1],
    last = 0;
  for (let i = 0; i < xs.length; i++) {
    m = multiply(L(ELEMENT_POWERS[i]), multiply(T(xs[i] - last), m));
    last = xs[i];
  }
  return m;
}
function residual(a, b, f, u) {
  const m = systemMatrix(a, b),
    q = multiply(T(SENSOR_X - b - 4), multiply(m, T(u)));
  return [(-m[2] - 1 / f) * 100, q[1] / u];
}
export function solveLens(focal, focusM) {
  let a = 18,
    b = 57;
  const u = focusM * 1000;
  for (let n = 0; n < 24; n++) {
    const r = residual(a, b, focal, u);
    if (Math.abs(r[0]) + Math.abs(r[1]) < 1e-11) break;
    const h = 0.001,
      ra = residual(a + h, b, focal, u),
      rb = residual(a, b + h, focal, u);
    const aa = (ra[0] - r[0]) / h,
      ab = (rb[0] - r[0]) / h,
      ba = (ra[1] - r[1]) / h,
      bb = (rb[1] - r[1]) / h,
      det = aa * bb - ab * ba;
    if (Math.abs(det) < 1e-12) throw Error("Degenerate optical system");
    const da = (bb * r[0] - ab * r[1]) / det,
      db = (-ba * r[0] + aa * r[1]) / det;
    a -= Math.max(-10, Math.min(10, da));
    b -= Math.max(-10, Math.min(10, db));
  }
  const m = systemMatrix(a, b),
    error = residual(a, b, focal, u);
  if (
    error.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e-7) ||
    !(a > 5 && b > a + 6 && b < 75)
  )
    throw Error("Optical solution did not converge");
  return {
    a,
    b,
    positions: elementPositions(a, b),
    matrix: m,
    effectiveFocal: -1 / m[2],
    stopX: a + 7,
    sensorX: SENSOR_X,
    focusM,
    focal,
  };
}
export function traceRay(
  solution,
  objectM,
  objectHeight,
  entranceHeight,
  { stopAt = 80 } = {},
) {
  const u = objectM * 1000;
  let y = entranceHeight,
    slope = (entranceHeight - objectHeight) / u,
    last = 0;
  const path = [];
  for (let i = 0; i < solution.positions.length; i++) {
    const x = solution.positions[i];
    if (x > stopAt) break;
    y += slope * (x - last);
    path.push({ x, y });
    slope -= ELEMENT_POWERS[i] * y;
    last = x;
  }
  y += slope * (stopAt - last);
  path.push({ x: stopAt, y });
  return { path, y, slope };
}
export function stopRadius(solution, aperture) {
  const unit = traceRay(solution, solution.focusM, 0, 1, {
    stopAt: solution.stopX,
  }).y;
  return (Math.abs(unit) * solution.focal) / (2 * aperture);
}
export function rayThroughStop(solution, objectM, objectHeight, pupilHeight) {
  const zero = traceRay(solution, objectM, objectHeight, 0, {
    stopAt: solution.stopX,
  }).y;
  const one = traceRay(solution, objectM, objectHeight, 1, {
    stopAt: solution.stopX,
  }).y;
  const entrance = (pupilHeight - zero) / (one - zero);
  return { ...traceRay(solution, objectM, objectHeight, entrance), entrance };
}
export function sensorBlur(solution, objectM, aperture) {
  const r = stopRadius(solution, aperture);
  return Math.abs(
    rayThroughStop(solution, objectM, 0, r).y -
      rayThroughStop(solution, objectM, 0, -r).y,
  );
}
export function filterTransmission(type, ndStops = 0, angle = 0) {
  if (type === "nd") return 2 ** -Math.max(0, Math.min(8, ndStops));
  if (type === "cpl") return 0.45; // unpolarized average; reflected polarized component handled separately
  return 1;
}
export function polarizedReflection(angle, polarization = 0) {
  return Math.cos(((angle - polarization) * Math.PI) / 180) ** 2;
}
