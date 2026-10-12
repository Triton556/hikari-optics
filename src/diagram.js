import { imageDistance, optics, clamp } from "./optics.js";
// Scaled optical schematic: object/lens/sensor distances are displayed compressed.
// Ray intersections after the equivalent thin lens remain analytically consistent.
export function drawDiagram(canvas, s) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = canvas.clientWidth || 600,
    h = canvas.clientHeight || 230;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  c.fillStyle = "#f4f3e7";
  c.fillRect(0, 0, w, h);
  const cy = h * 0.49,
    lx = w * 0.5,
    sx = w * 0.83,
    ox = w * 0.09;
  const aperture = clamp(88 / s.aperture, 5, 29),
    o = optics(s);
  const vi = imageDistance(s.focal, s.focus),
    vo = imageDistance(s.focal, s.distance);
  const ix = lx + ((sx - lx) * vo) / vi;
  const oh = 42,
    ih = oh * (0.48 + ((s.focal - 16) / 34) * 0.32);
  c.setLineDash([4, 5]);
  c.strokeStyle = "#b9c3af";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(20, cy);
  c.lineTo(w - 20, cy);
  c.stroke();
  c.setLineDash([]);
  function line(points, color, width = 1) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }
  function arrow(x, y, h, color) {
    line(
      [
        [x, y],
        [x, y + h],
      ],
      color,
      2.5,
    );
    const dir = Math.sign(h);
    line(
      [
        [x - 5, y + h - dir * 7],
        [x, y + h],
        [x + 5, y + h - dir * 7],
      ],
      color,
      2.5,
    );
  }
  arrow(ox, cy, -oh, "#cb8263");
  c.fillStyle = "#cee4df";
  c.strokeStyle = "#74a99c";
  c.lineWidth = 1.5;
  c.beginPath();
  c.ellipse(lx, cy, 8, 45, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = "#415b54";
  c.fillRect(lx - 3, cy - 48, 6, 48 - aperture);
  c.fillRect(lx - 3, cy + aperture, 6, 48 - aperture);
  for (const n of [-1, 0, 1]) {
    const ay = cy + n * aperture;
    const sy = ay + ((cy + ih - ay) * (sx - lx)) / (ix - lx);
    line(
      [
        [ox, cy - oh],
        [lx, ay],
        [sx, sy],
      ],
      n === 0 ? "#bc795e" : "#d69979",
      1.2,
    );
    c.fillStyle = "#cb9877";
    c.beginPath();
    c.arc(sx, sy, 2.5, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#83a698";
  c.fillRect(sx - 2, cy - 58, 4, 116);
  arrow(sx + 7, cy, ih, "#658d7c");
  c.font = "10px system-ui";
  c.fillStyle = "#607668";
  c.textAlign = "center";
  c.fillText("ОБЪЕКТ", ox, cy + 68);
  c.fillText("ЭКВИВАЛЕНТНАЯ ЛИНЗА", lx, cy + 68);
  c.fillText("МАТРИЦА", sx, cy + 78);
  c.fillStyle = "#8f9b84";
  c.font = "9px system-ui";
  c.fillText(`${s.distance.toFixed(2)} м`, ox, cy + 85);
  c.fillText(`f = ${s.focal} мм`, lx, cy + 85);
  c.fillStyle = "#517462";
  c.font = "11px system-ui";
  c.textAlign = "left";
  c.fillText(
    o.coc < 0.019
      ? "● Пятно меньше принятого порога резкости"
      : "◌ Плоскость резкости не совпадает с объектом",
    18,
    24,
  );
  c.font = "9px system-ui";
  c.fillStyle = "#9ba58d";
  c.fillText("Масштаб расстояний сжат для наглядности", 18, h - 13);
  // Independent magnified sensor footprint, derived from the actual CoC in mm.
  // This avoids exaggerating the geometric distance in the optical diagram.
  const mx = w - 64,
    my = 61,
    mr = 26;
  c.fillStyle = "#e8ecde";
  c.beginPath();
  c.arc(mx, my, mr, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(mx, my, mr, 0, Math.PI * 2);
  c.clip();
  const radius = Math.max(1.2, o.coc * 260);
  c.fillStyle = o.coc < 0.019 ? "#619b8677" : "#d99b6f77";
  c.beginPath();
  c.arc(mx, my, radius, 0, Math.PI * 2);
  c.fill();
  c.setLineDash([2, 2]);
  c.strokeStyle = "#668c70";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(mx, my, 0.019 * 260, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.restore();
  c.font = "8px system-ui";
  c.textAlign = "center";
  c.fillStyle = "#68816b";
  c.fillText("ПЯТНО · УВЕЛИЧЕНО", mx, my + 36);
  c.fillText(`${o.coc.toFixed(3)} мм`, mx, my + 47);
}
