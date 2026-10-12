// Conservative visitor volume inside the classroom, including near-plane margin.
// Kept independent of Three so geometry constraints can be checked directly.
export const VISITOR_BOUNDS = {
  min: [-8.3, 0.75, -6.6],
  max: [10.6, 5.2, 9.6],
};

export function constrainVisitor(position, target, bounds = VISITOR_BOUNDS) {
  // Shorten the viewing ray, preserving the look direction rather than sliding
  // sideways along a wall. Targets are station anchors inside the room.
  const anchor = target.map((v, i) =>
    Math.max(bounds.min[i], Math.min(bounds.max[i], v)),
  );
  let fraction = 1;
  for (let i = 0; i < 3; i++) {
    const delta = position[i] - anchor[i];
    if (delta > 0)
      fraction = Math.min(fraction, (bounds.max[i] - anchor[i]) / delta);
    if (delta < 0)
      fraction = Math.min(fraction, (bounds.min[i] - anchor[i]) / delta);
  }
  return anchor.map((v, i) => v + (position[i] - v) * Math.max(0, fraction));
}

// Portrait turns the long optical bench into depth, leaving the bending plane
// visible. Constrain the destination itself so arrival can settle at the ceiling.
export function prismInspectionView(width) {
  const target = [0.4, 1.55, 0];
  const desired = width < 650 ? [-4.3, 7.7, 2.7] : [-0.7, 5.2, 5.9];
  return { pos: constrainVisitor(desired, target), target };
}
