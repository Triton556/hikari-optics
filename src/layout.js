// Greedy label placement in screen space. Preserve nearby anchors while avoiding
// overlap; hide only a label that cannot fit rather than cover another control.
export function placeLabels(labels, width, height) {
  const occupied = [],
    result = [];
  for (const label of [...labels].sort((a, b) => a.y - b.y)) {
    const w = label.width || 108,
      h = label.height || 28;
    const x = Math.max(w / 2 + 8, Math.min(width - w / 2 - 8, label.x));
    if (!label.visible) {
      result.push({ ...label, x, visible: false });
      continue;
    }
    let chosen = null;
    for (let step = 0; step < 24; step++) {
      const offset =
        step === 0 ? 0 : (step % 2 ? 1 : -1) * Math.ceil(step / 2) * (h + 5);
      const y = label.y + offset;
      if (y < h / 2 + 15 || y > height - 75 - h / 2) continue;
      if (
        occupied.some(
          (p) =>
            Math.abs(x - p.x) < (w + p.w) / 2 + 4 &&
            Math.abs(y - p.y) < (h + p.h) / 2 + 4,
        )
      )
        continue;
      chosen = { x, y, w, h };
      break;
    }
    if (chosen) {
      occupied.push(chosen);
      result.push({ ...label, ...chosen, visible: true });
    } else result.push({ ...label, x, visible: false });
  }
  return result;
}
