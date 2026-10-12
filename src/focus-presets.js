import * as THREE from 'three';
import { benchX } from './placement.js';
import { maxAperture, dof } from './optics.js';

export const FOCAL_PRESETS = [
  { id: 'wide', focal: 16, title: 'Широкий план', detail: '16 мм · больше пространства' },
  { id: 'normal', focal: 28, title: 'Естественный', detail: '28 мм · средний план' },
  { id: 'close', focal: 50, title: 'Крупный план', detail: '50 мм · отделить от фона' },
];
export function focalPatch(id) {
  const p = FOCAL_PRESETS.find(p => p.id === id);
  if (!p) return null;
  return { focal: p.focal, aperture: maxAperture(p.focal), filter: 'none', filterBypass: false,
    experiment: undefined, pane: false, exposureAuto: true };
}

// A small experiment shelf, rather than a settings dashboard. All inputs use
// the same scene state as the rings and the sensor pass.
export function installFocusPresets({ lab, getState, apply, visit, getStation }) {
  const root = document.createElement('section');
  root.className = 'focus-shelf';
  root.setAttribute('aria-label', 'Опыты с фокусом');
  root.innerHTML = `<button class="focus-shelf-toggle" aria-expanded="false">Опыты с фокусом <span>16 · 28 · 50 мм · v8</span><b>⌃</b></button>
    <div class="focus-shelf-body" hidden>
      <div class="focus-recipes">${FOCAL_PRESETS.map(p => `<button data-focal="${p.id}" aria-pressed="false"><strong><em>${p.focal} мм</em><span>${p.title}</span></strong><small>${p.detail}</small></button>`).join('')}</div>
      <div class="focus-targets"><span>Резкость на</span><button data-target="cat">Котике</button><button data-target="flower">Цветке</button><button data-target="chart">Мишени</button><button data-depth>Глубже · ƒ/11</button></div>
      <div class="focus-footer"><output></output><button data-view="objects">Сцена</button><button data-view="screen">Кадр</button><button data-view="lens">Внутри объектива</button></div>
      <p>Мятная плоскость показывает выбранную дистанцию резкости. Фокусное расстояние меняет охват кадра. «Резкость на» переносит фокус между объектами.</p>
    </div>`;
  document.body.append(root);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.45,1.55),new THREE.MeshBasicMaterial({color:0x9ff7c6,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
  plane.rotation.y = Math.PI/2;
  plane.position.set(benchX(getState().focus),1.75,0);
  plane.layers.set(1); // Educational overlay excluded from the sensor image.
  lab.scene.add(plane);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(plane.geometry),new THREE.LineBasicMaterial({color:0xa9ffcc,transparent:true,opacity:.7}));
  outline.layers.set(1); plane.add(outline);
  const zone = new THREE.Mesh(new THREE.BoxGeometry(1,.012,2.4),new THREE.MeshBasicMaterial({color:0x73d7b5,transparent:true,opacity:.18,depthWrite:false}));
  zone.layers.set(1); lab.scene.add(zone);
  const previousFrame = lab.onFrame;
  lab.onFrame = (time,dt) => {
    previousFrame?.(time,dt);
    plane.visible = !body.hidden && ['objects','lens'].includes(getStation());
    zone.visible = plane.visible;
    const state = getState(), range = dof(state.focal,state.aperture,state.focus);
    const nearX = benchX(Math.max(.25,range.near)), farX = benchX(Math.min(5,range.far));
    zone.position.set((nearX+farX)/2,1.015,0); zone.scale.x = Math.max(.015,nearX-farX);
    plane.position.x += (benchX(getState().focus)-plane.position.x)*(1-Math.exp(-Math.max(0,dt)*8));
  };
  const body = root.querySelector('.focus-shelf-body');
  const toggle = root.querySelector('.focus-shelf-toggle');
  toggle.onclick = () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
    document.body.classList.toggle('focus-shelf-open', !body.hidden);
    if (!body.hidden) { visit('screen'); apply({filter:'none',filterBypass:false,experiment:undefined,pane:false,exposureAuto:true}); }
    sync();
  };
  root.querySelectorAll('[data-focal]').forEach(b => b.onclick = () => { apply(focalPatch(b.dataset.focal)); sync(); });
  root.querySelectorAll('[data-target]').forEach(b => b.onclick = () => {
    const s = getState(), target = b.dataset.target;
    apply({ focus: s[target + 'Distance'], filter: 'none', filterBypass: false, experiment: undefined, pane: false });
    sync();
  });
  root.querySelector('[data-depth]').onclick = () => {
    const s = getState();
    apply({ aperture: s.aperture >= 11 ? maxAperture(s.focal) : 11 }); sync();
  };
  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (b.dataset.view === 'lens') apply({cutaway:true}); visit(b.dataset.view); sync(); });
  function sync() {
    const s = getState();
    if (getStation() === 'desk') { body.hidden=true; toggle.setAttribute('aria-expanded','false'); document.body.classList.remove('focus-shelf-open'); }
    root.querySelector('output').textContent = `${Math.round(s.focal)} мм · ƒ/${s.aperture.toFixed(1)} · фокус ${s.focus.toFixed(2)} м`;
    root.querySelectorAll('[data-focal]').forEach(b => b.setAttribute('aria-pressed', String(focalPatch(b.dataset.focal).focal === s.focal)));
    root.querySelectorAll('[data-target]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(s.focus - s[b.dataset.target + 'Distance']) < .01)));
    root.querySelector('[data-depth]').setAttribute('aria-pressed', String(s.aperture >= 11));
    root.querySelector('[data-depth]').textContent = s.aperture >= 11 ? 'Мягче · открытая' : 'Глубже · ƒ/11';
    root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(getStation() === b.dataset.view)));
  }
  return sync;
}
