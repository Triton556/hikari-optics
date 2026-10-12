import {
  tracePrism,
  traceMirror,
  prismVertices,
  glassSlabVertices,
} from "./refraction.js";
import { traceRay, stopRadius, WORLD_SCALE, FRONT_X } from "./lens-system.js";
export const INLINE_X = -1.2;
export const WAVELENGTHS = [650, 610, 580, 550, 500, 470, 430];
export function inlineBeam(s, solution, wavelength = 550, offset = 0) {
  const a = s.inlineSourceAngle ?? 0,
    d = [Math.cos(a), Math.sin(a)];
  const origin = [
    0.1 - 0.89 * d[0] - offset * d[1],
    -0.89 * d[1] + offset * d[0],
  ];
  const shape = s.prismShape ?? "prism";
  const polygon =
    shape === "slab"
      ? glassSlabVertices(0.1, 0, 0.13, 0.65, s.prismAngle - Math.PI / 2)
      : prismVertices(0.1, 0, 0.3, s.prismAngle);
  const result =
    shape === "mirror"
      ? traceMirror(origin, d, [0.1, 0], s.prismAngle, 0.65)
      : tracePrism(origin, d, polygon, wavelength);
  const points = result.path.map((p) => [
    p.point[0] + INLINE_X,
    1.62,
    p.point[1],
  ]);
  const ray = result.direction;
  const exit = points[Math.max(0, points.length - 2)];
  if (points.length < 3 || result.inside || ray[0] <= 0.01)
    return { points, status: "deflected" };
  const t = (FRONT_X - exit[0]) / ray[0];
  if (t <= 0) return { points, status: "deflected" };
  const z = exit[2] + ray[1] * t;
  if (Math.abs(z) > 0.46) return { points, status: "missed", entrance: z };
  points.pop();
  points.push([FRONT_X, 1.62, z]);
  const entrance = z / WORLD_SCALE,
    slope = ray[1] / ray[0];
  const virtualObjectHeight = entrance - slope * 1000;
  const stop = traceRay(solution, 1, virtualObjectHeight, entrance, {
    stopAt: solution.stopX,
  });
  if (Math.abs(stop.y) > stopRadius(solution, s.aperture)) {
    for (const p of stop.path)
      points.push([FRONT_X + p.x * WORLD_SCALE, 1.62, p.y * WORLD_SCALE]);
    return { points, status: "iris", entrance: z };
  }
  const lens = traceRay(solution, 1, virtualObjectHeight, entrance);
  for (const p of lens.path) {
    points.push([FRONT_X + p.x * WORLD_SCALE, 1.62, p.y * WORLD_SCALE]);
    if (Math.abs(p.y * WORLD_SCALE) > 0.46)
      return { points, status: "barrel", entrance: z };
  }
  return {
    points,
    status: Math.abs(lens.y) <= 11.75 ? "sensor" : "outside-sensor",
    sensorX: lens.y,
    entrance: z,
    slope,
  };
}
export function alignInlineSource(s, solution) {
  let best = { cost: Infinity, angle: 0 };
  for (let i = -140; i <= 140; i++) {
    const a = i / 100,
      r = inlineBeam({ ...s, inlineSourceAngle: a }, solution);
    const cost =
      r.status === "sensor"
        ? Math.abs(r.sensorX)
        : 100 + Math.abs(r.entrance ?? 10);
    if (cost < best.cost) best = { cost, angle: a };
  }
  return best.angle;
}
