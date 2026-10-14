import * as THREE from "three";
import { lightPathPortrait } from "./light-path-model.js";

// Names belong to the objects, not to a dashboard. The labels and physical rings
// share the same commands, so keyboard, pointer and direct manipulation agree.
export function installWayfinding(lab, { getState, getStation, getSelected, getPreview, select, adjust }) {
  const root = document.createElement("div");
  root.className = "instrument-labels";
  root.setAttribute("aria-label", "Кольца объектива");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  root.append(svg);
  document.body.append(root);
  const definitions = [
    ["zoom", "Зум", lab.zoomControl, "#8bd8cf", s => `${s.focal.toFixed(0)} мм`],
    ["aperture", "Диафрагма", lab.apertureControl, "#c1b1e5", s => `ƒ / ${s.aperture.toFixed(1)}`],
    ["focus", "Фокус", lab.focusControl, "#e3b579", s => `${s.focus.toFixed(2)} м`],
    ["filter", "Фильтр", lab.filterMount, "#e3b579", s =>
      s.filter === "cpl" ? `CPL ${Math.round(s.filterAngle)}°` :
      s.filter === "nd" ? `ND ${s.ndStops.toFixed(1)} EV` :
      `MIST ${Math.round(s.softStrength * 100)}%`],
    ["screen", "Посмотреть", lab.monitor, "#8bd8cf", () => "Результат →"],
    ["bypass", "Сравнение", lab.monitor, "#e3b579", s => s.filterBypass ? "Без фильтра" : "С фильтром"],
    ["prism", "Стекло", lab.prismGlass, "#8bd8cf", s => `${Math.round(s.prismAngle * 180 / Math.PI)}°`],
    ["source", "Источник", lab.prismSource, "#e3b579", s => `${Math.round(s.inlineSourceAngle * 180 / Math.PI)}°`],
    ["align-source", "На матрицу", lab.prismSource, "#c1b1e5", () => "Навести луч"],
  ];
  const entries = definitions.map(([id, name, object, color, format]) => {
    const line = document.createElementNS(svg.namespaceURI, "path");
    svg.append(line);
    const button = document.createElement("button");
    button.type = "button";
    button.style.setProperty("--ring-color", color);
    const actionOnly = ["screen", "bypass", "align-source"].includes(id);
    button.innerHTML = `<span>${name}</span><strong></strong><small>${actionOnly ? "нажми" : "↔ потяни"}</small>`;
    button.classList.toggle("action-label", actionOnly);
    button.setAttribute("aria-label", actionOnly ? name : `${name}: нажми для осмотра, стрелки меняют значение`);
    root.append(button);
    let drag = null, suppressClick = false;
    button.addEventListener("pointerdown", e => {
      if (e.button !== 0 || actionOnly) return;
      drag = { start: e.clientX, last: e.clientX, moved: false };
      button.setPointerCapture(e.pointerId);
    });
    button.addEventListener("pointermove", e => {
      if (!drag) return;
      drag.moved ||= Math.abs(e.clientX - drag.start) > 4;
      const dx = e.clientX - drag.last;
      drag.last = e.clientX;
      if (drag.moved) {
        lab.targetView = null;
        adjust(id, dx * 0.008, e.shiftKey);
      }
    });
    button.addEventListener("pointerup", () => {
      suppressClick = !!drag?.moved;
      drag = null;
    });
    button.addEventListener("pointercancel", () => { drag = null; suppressClick = true; });
    button.addEventListener("click", () => {
      if (!suppressClick) id === "filter" ? adjust(id, 0) : select(id);
      suppressClick = false;
    });
    button.addEventListener("keydown", e => {
      if (!actionOnly && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.stopPropagation();
        e.preventDefault();
        adjust(id, e.key === "ArrowRight" ? 0.05 : -0.05, e.shiftKey);
      }
    });
    return { id, object, button, line, format, vector: new THREE.Vector3() };
  });
  const previous = lab.onFrame;
  lab.onFrame = function(time, dt) {
    previous?.(time, dt);
    const station = getStation(), state = getState();
    const portrait = station === "lens" && lightPathPortrait(innerWidth, innerHeight);
    root.hidden = !["lens", "aperture", "filters", "screen", "prism"].includes(station);
    if (root.hidden) return;
    const rect = lab.renderer.domElement.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`);
    const visible = entries.filter(e => {
      const show =
        (station === "prism" && ["prism", "source", "align-source"].includes(e.id)) ||
        (station === "lens" && ["zoom", "aperture", "focus", "screen"].includes(e.id) && !(e.id === "screen" && portrait && document.body.classList.contains("focus-shelf-open"))) ||
        (station === "aperture" && e.id === "aperture") ||
        (station === "filters" && state.filter !== "none" && ["filter", "screen"].includes(e.id)) ||
        (station === "screen" && state.filter !== "none" && ["filter", "bypass"].includes(e.id));
      e.button.hidden = e.line.hidden = !show;
      e.line.style.display = show ? "" : "none";
      return show;
    });
    if (!visible.length) return;
    for (const e of visible) {
      if (!["screen", "bypass", "align-source"].includes(e.id))
        e.button.setAttribute('aria-pressed', String(getSelected?.() === e.id));
      const anchor = station === "screen" ? lab.monitor : e.object;
      anchor.getWorldPosition(e.vector);
      e.vector.y += 0.57;
      e.vector.project(lab.camera);
      e.x = rect.left + (e.vector.x * .5 + .5) * rect.width;
      e.y = rect.top + (-e.vector.y * .5 + .5) * rect.height;
      if (e.id === "align-source") {
        const rays = lab.inlineResults ?? [];
        e.button.querySelector("small").textContent = rays.some(r => r.status === "sensor")
          ? "свет на матрице" : "луч не дошёл";
      }
      if (e.id === "filter") {
        e.button.querySelector("span").textContent = {
          cpl: "CPL · блики", nd: "ND · движение", soft: "MIST · огни"
        }[state.filter] ?? "Фильтр";
        const shutter = getPreview?.()?.shutter;
        e.button.querySelector("small").textContent = state.filter === "nd" && shutter
          ? `↔ 1/${Math.round(1/shutter)} с` : "↔ потяни";
      }
      const value = e.format(state);
      if (e.button.querySelector("strong").textContent !== value)
        e.button.querySelector("strong").textContent = value;
    }
    const controls = visible.filter(e => !(station === "lens" && e.id === "screen"));
    const screen = station === "lens" && visible.find(e => e.id === "screen");
    if (screen) {
      const width = innerWidth < 650 ? 104 : 122;
      const x = Math.max(16, Math.min(innerWidth - width - 16, screen.x - width * (portrait ? 0.5 : 1.7) - (portrait ? 0 : 16)));
      const top = portrait ? innerHeight - 144 : Math.max(125, screen.y - 90);
      screen.button.style.width = width + 'px';
      screen.button.style.transform = `translate(${Math.round(x)}px,${Math.round(top)}px)`;
      screen.button.querySelector('span').textContent = 'Кадр крупно';
      screen.line.setAttribute('d', `M ${x + width / 2} ${top + 68} L ${screen.x} ${screen.y}`);
    }
    controls.sort((a,b) => a.x - b.x);
    const width = Math.min(innerWidth < 650 ? 96 : 122, (innerWidth - 32 - (controls.length - 1) * 12) / controls.length), gap = 12;
    const total = controls.length * width + (controls.length - 1) * gap;
    const centre = controls.reduce((n,e) => n+e.x,0) / controls.length;
    const start = Math.max(16,Math.min(innerWidth-total-16,centre-total/2));
    // One quiet row above the assembly keeps labels from hiding optical paths.
    const top = (portrait || innerWidth < 650) ? 66 : Math.max(125,
      Math.min(innerHeight-190,Math.min(...controls.map(e=>e.y))-96));
    controls.forEach((e,i) => {
      const x=start+i*(width+gap), middle=x+width/2;
      e.button.style.width = width + "px";
      e.button.style.transform=`translate(${Math.round(x)}px,${Math.round(top)}px)`;
      e.line.setAttribute("d",`M ${middle} ${top+68} L ${middle} ${top+77} L ${e.x} ${e.y}`);
    });
  };
  return () => { root.remove(); lab.onFrame = previous; };
}
