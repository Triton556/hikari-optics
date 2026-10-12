// The optical bench deliberately compresses longitudinal scene distances.
export const benchX = (distance) => -2.6 - (distance - 1.5) * 0.62;
export const DEFAULT_DISTANCES = { cat: 1.5, flower: 2.2, chart: 3 };
export const DEFAULT_OFFSETS = { cat: 0, flower: -0.72, chart: 0.72 };
export function canPlace(state, id, distance, offset) {
  const radius = id === "cat" ? 0.56 : 0.27,
    x = benchX(distance);
  for (const other of ["cat", "flower", "chart"]) {
    if (other === id) continue;
    const d = state[other + "Distance"] ?? DEFAULT_DISTANCES[other],
      z = state[other + "Offset"] ?? DEFAULT_OFFSETS[other];
    const separation = Math.hypot(x - benchX(d), offset - z);
    if (separation < radius + (other === "cat" ? 0.56 : 0.27) + 0.005)
      return false;
  }
  return true;
}

// Check the whole drag segment, not only its final position. This prevents a
// fast pointer movement from teleporting a pedestal through a neighbour.
export function canMove(state, id, distance, offset) {
  const fromX = benchX(state[id + "Distance"] ?? DEFAULT_DISTANCES[id]);
  const fromZ = state[id + "Offset"] ?? DEFAULT_OFFSETS[id];
  const dx = benchX(distance) - fromX,
    dz = offset - fromZ;
  const length2 = dx * dx + dz * dz;
  for (const other of Object.keys(DEFAULT_DISTANCES)) {
    if (other === id) continue;
    const x = benchX(state[other + "Distance"] ?? DEFAULT_DISTANCES[other]);
    const z = state[other + "Offset"] ?? DEFAULT_OFFSETS[other];
    const t = length2
      ? Math.max(
          0,
          Math.min(1, ((x - fromX) * dx + (z - fromZ) * dz) / length2),
        )
      : 0;
    const clearance =
      (id === "cat" ? 0.56 : 0.27) + (other === "cat" ? 0.56 : 0.27) + 0.005;
    if (Math.hypot(fromX + t * dx - x, fromZ + t * dz - z) < clearance)
      return false;
  }
  return true;
}
