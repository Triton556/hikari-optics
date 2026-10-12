export const SENSOR = { width: 23.5, height: 15.6, coc: 0.019 };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function maxAperture(f) {
  return (
    Math.ceil((lerp(3.5, 5.6, clamp((f - 16) / 34, 0, 1)) - 1e-9) * 10) / 10
  );
}
export function minFocus(f) {
  return (
    Math.ceil((lerp(0.25, 0.3, clamp((f - 16) / 34, 0, 1)) - 1e-9) * 100) / 100
  );
}
export function imageDistance(f, objectM) {
  const u = objectM * 1000;
  return (f * u) / (u - f);
}
export function fov(f, size = SENSOR.width) {
  return (2 * Math.atan(size / (2 * f)) * 180) / Math.PI;
}
export function dof(f, N, focusM) {
  const s = focusM * 1000,
    H = (f * f) / (N * SENSOR.coc) + f;
  const near = (H * s) / (H + (s - f));
  const denom = H - (s - f);
  return {
    near: near / 1000,
    far: denom <= 0 ? Infinity : (H * s) / denom / 1000,
    hyperfocal: H / 1000,
  };
}
export function circleOfConfusion(f, N, focusM, objectM) {
  const vi = imageDistance(f, focusM),
    vo = imageDistance(f, objectM);
  return Math.abs(((f / N) * (vi - vo)) / vo);
}
export function exposureEV(N, shutter, iso) {
  return Math.log2((N * N) / shutter) - Math.log2(iso / 100);
}
export const WEATHER = {
  sun: { name: "Солнечно", ev: 12.5, temp: 5600 },
  cloud: { name: "Пасмурно", ev: 10, temp: 6800 },
  golden: { name: "Закат", ev: 10.5, temp: 4000 },
  night: { name: "Ночь", ev: 5, temp: 8500 },
};
export const DEFAULT = {
  focal: 28,
  aperture: 5.6,
  focus: 1.5,
  distance: 1.5,
  iso: 400,
  shutter: 1 / 125,
  weather: "golden",
  light: 1,
  exposureAuto: true,
  cutaway: true,
  rays: true,
  explode: 0,
  animate: true,
  quality: "high",
  view: "desk",
  object: "cat",
  lesson: 0,
  showSensor: false,
};
export function normalizeState(v = {}) {
  const s = { ...DEFAULT, ...v };
  s.focal = clamp(Number(s.focal) || 28, 16, 50);
  s.aperture = clamp(Number(s.aperture) || 5.6, maxAperture(s.focal), 22);
  s.focus = clamp(Number(s.focus) || 1.5, minFocus(s.focal), 5);
  s.distance = clamp(Number(s.distance) || 1.5, 0.4, 4);
  s.iso = clamp(Number(s.iso) || 400, 100, 12800);
  s.shutter = clamp(Number(s.shutter) || 1 / 125, 1 / 2000, 1 / 4);
  s.light = clamp(Number(s.light) || 1, 0.15, 2);
  s.explode = clamp(Number(s.explode) || 0, 0, 1);
  if (typeof s.weather !== "string" || !Object.hasOwn(WEATHER, s.weather))
    s.weather = "golden";
  if (!["high", "low"].includes(s.quality)) s.quality = "high";
  for (const k of ["exposureAuto", "cutaway", "rays", "animate", "showSensor"])
    if (typeof s[k] !== "boolean") s[k] = DEFAULT[k];
  if (!["cat", "flower", "chart"].includes(s.object)) s.object = "cat";
  if (!["desk", "cutaway", "lens", "sensor", "room", "top"].includes(s.view))
    s.view = "desk";
  if (!["none", "nd", "cpl", "soft"].includes(s.filter)) s.filter = "none";
  if (!["prism", "slab", "mirror"].includes(s.prismShape))
    s.prismShape = "prism";
  const finite = (value, fallback) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;
  s.ndStops = clamp(finite(s.ndStops, 2), 0, 8);
  s.softStrength = clamp(finite(s.softStrength, 0.35), 0, 1);
  s.filterAngle = ((finite(s.filterAngle, 0) % 180) + 180) % 180;
  s.prismAngle =
    ((finite(s.prismAngle, (40 * Math.PI) / 180) % (Math.PI * 2)) +
      Math.PI * 2) %
    (Math.PI * 2);
  s.sourceAngle = clamp(finite(s.sourceAngle, 0), -0.25, 0.25);
  s.pane = s.pane === true;
  s.paneAngle = clamp(
    finite(s.paneAngle, Math.PI * 0.75),
    Math.PI * 0.53,
    Math.PI * 0.97,
  );
  s.inlineSourceAngle = clamp(finite(s.inlineSourceAngle, -0.85), -1.4, 1.4);
  s.experiment = ["polarization", "motion", "diffusion", "prism"].includes(
    s.experiment,
  )
    ? s.experiment
    : undefined;
  s.filterBypass = s.filterBypass === true && s.filter !== "none";
  s.compareShutter =
    s.filterBypass && Number.isFinite(s.compareShutter)
      ? clamp(s.compareShutter, 1 / 2000, 1 / 4)
      : undefined;
  for (const [id, d, z] of [
    ["cat", 1.5, 0],
    ["flower", 2.2, -0.72],
    ["chart", 3, 0.72],
  ]) {
    s[id + "Distance"] = clamp(finite(s[id + "Distance"], d), 0.4, 4);
    s[id + "Offset"] = clamp(finite(s[id + "Offset"], z), -0.8, 0.8);
  }
  return s;
}
export function optics(s) {
  const ev = exposureEV(s.aperture, s.shutter, s.iso);
  const sceneEV = WEATHER[s.weather].ev + Math.log2(s.light);
  const brightness = s.exposureAuto ? 1 : 2 ** clamp(sceneEV - ev, -7, 5);
  return {
    ev,
    sceneEV,
    brightness,
    fov: fov(s.focal),
    dof: dof(s.focal, s.aperture, s.focus),
    diameter: s.focal / s.aperture,
    image: imageDistance(s.focal, s.focus),
    coc: circleOfConfusion(s.focal, s.aperture, s.focus, s.distance),
    magnification: s.focal / (s.distance * 1000 - s.focal),
  };
}
