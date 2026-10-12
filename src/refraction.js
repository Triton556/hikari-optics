// Two-dimensional geometric optics. World units cancel in Snell's law.
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const unit = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
export function refract(direction, normal, n1, n2) {
  const d = unit(direction);
  let n = unit(normal);
  if (dot(d, n) > 0) n = n.map((v) => -v);
  const eta = n1 / n2,
    c = -dot(d, n),
    k = 1 - eta * eta * (1 - c * c);
  if (k < 0)
    return { direction: unit(d.map((v, i) => v + 2 * c * n[i])), tir: true };
  return {
    direction: unit(d.map((v, i) => eta * v + (eta * c - Math.sqrt(k)) * n[i])),
    tir: false,
  };
}
// SCHOTT N-F2 Sellmeier coefficients; lambda in micrometres.
// https://media.schott.com/api/public/content/061f3156c83a44ed9220770b0f65a869?v=d69b35e0
export function glassIndex(wavelengthNm) {
  const l2 = (wavelengthNm / 1000) ** 2;
  const B = [1.39757037, 0.159201403, 1.2686543],
    C = [0.00995906143, 0.0546931752, 119.248346];
  return Math.sqrt(
    1 + B.reduce((sum, b, i) => sum + (b * l2) / (l2 - C[i]), 0),
  );
}
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export function intersectPolygon(origin, direction, polygon) {
  let best = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      edge = [b[0] - a[0], b[1] - a[1]],
      rel = [a[0] - origin[0], a[1] - origin[1]],
      den = cross(direction, edge);
    if (Math.abs(den) < 1e-10) continue;
    const t = cross(rel, edge) / den,
      u = cross(rel, direction) / den;
    if (t > 1e-9 && u >= -1e-8 && u <= 1 + 1e-8 && (!best || t < best.distance))
      best = {
        point: [origin[0] + t * direction[0], origin[1] + t * direction[1]],
        normal: unit([edge[1], -edge[0]]),
        distance: t,
        edge: i,
      };
  }
  return best;
}
export function tracePrism(
  origin,
  direction,
  polygon,
  wavelengthNm = 550,
  maxBounces = 8,
  cornerAdjusted = false,
) {
  let p = origin,
    d = unit(direction),
    inside = false;
  const path = [{ point: [...p], inside: false }],
    index = glassIndex(wavelengthNm);
  for (let i = 0; i < maxBounces; i++) {
    const hit = intersectPolygon(p, d, polygon);
    if (!hit) {
      path.push({ point: [p[0] + d[0] * 3, p[1] + d[1] * 3], inside });
      break;
    }
    // An exact polygon vertex has no unique surface normal. Choose a nearby
    // member of the finite-width beam instead of inventing a refracting normal.
    if (
      !cornerAdjusted &&
      polygon.some(
        (v) => Math.hypot(v[0] - hit.point[0], v[1] - hit.point[1]) < 1e-8,
      )
    ) {
      const d0 = unit(direction);
      return tracePrism(
        [origin[0] - d0[1] * 1e-5, origin[1] + d0[0] * 1e-5],
        direction,
        polygon,
        wavelengthNm,
        maxBounces,
        true,
      );
    }
    path.push({ point: hit.point, inside });
    const r = refract(d, hit.normal, inside ? index : 1, inside ? 1 : index);
    if (!r.tir) inside = !inside;
    d = r.direction;
    p = hit.point;
    path[path.length - 1].tir = r.tir;
  }
  return { path, direction: d, inside, index, cornerAdjusted };
}
export function prismVertices(cx, cy, size, angle) {
  return [0, 1, 2].map((i) => {
    const a = angle + (i * Math.PI * 2) / 3;
    return [cx + Math.cos(a) * size, cy + Math.sin(a) * size];
  });
}

export function glassSlabVertices(cx, cy, width, height, angle) {
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([x, y]) => [
    cx + x * Math.cos(angle) - y * Math.sin(angle),
    cy + x * Math.sin(angle) + y * Math.cos(angle),
  ]);
}
export function traceMirror(origin, direction, center, angle, length = 1) {
  const tangent = [Math.cos(angle), Math.sin(angle)],
    normal = [-tangent[1], tangent[0]],
    d = unit(direction),
    den = dot(d, normal);
  if (Math.abs(den) < 1e-9)
    return {
      path: [
        { point: origin },
        { point: [origin[0] + d[0] * 3, origin[1] + d[1] * 3] },
      ],
      direction: d,
    };
  const t = dot([center[0] - origin[0], center[1] - origin[1]], normal) / den;
  const hit = [origin[0] + d[0] * t, origin[1] + d[1] * t];
  if (
    t <= 0 ||
    Math.abs(dot([hit[0] - center[0], hit[1] - center[1]], tangent)) >
      length / 2
  )
    return {
      path: [
        { point: origin },
        { point: [origin[0] + d[0] * 3, origin[1] + d[1] * 3] },
      ],
      direction: d,
    };
  const reflected = d.map((v, i) => v - 2 * den * normal[i]);
  return {
    path: [
      { point: origin },
      { point: hit },
      { point: [hit[0] + reflected[0] * 3, hit[1] + reflected[1] * 3] },
    ],
    direction: reflected,
  };
}
