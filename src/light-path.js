import * as THREE from "three";
import { WORLD_SCALE } from "./lens-system.js";
import {
  lightPathObservation,
  lightPathView,
  lightPathDock,
  lightPathPortrait,
  TARGET_NAMES,
} from "./light-path-model.js";

// A causal inspection of the existing physical bench, not another dashboard.
// The same monitor is docked beside the cutaway, then restored at other stations.
export function installLightPath(
  lab,
  { getState, getStation, focusPlane, focusZone },
) {
  const home = {
    position: lab.monitor.position.clone(),
    scale: lab.monitor.scale.clone(),
    rotation: lab.monitor.rotation.clone(),
  };
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 144;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.13, 0.254),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  // The plaque sits on a short forward bracket, clear of the camera body.
  plaque.position.set(-0.32, -0.58, 0.56);
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.035, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x36514b, roughness: 0.7 }),
  );
  bracket.position.set(-0.32, -0.58, 0.28);
  bracket.layers.set(1);
  lab.monitor.add(bracket);
  plaque.layers.set(1);
  lab.monitor.add(plaque);
  // Instructional equipment never feeds its own image or shadows into capture.
  lab.monitor.traverse((object) => {
    object.layers.set(1);
    object.castShadow = false;
  });
  let observationKey = "";
  function renderObservation(state) {
    const o = lightPathObservation(state);
    const key = [
      o.target,
      o.distance,
      o.blurMm,
      state.focus,
      state.aperture,
      lab.monitor.scale.x,
    ].join(":");
    if (key === observationKey) return;
    observationKey = key;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#edf0df";
    ctx.fillRect(0, 0, 640, 144);
    ctx.fillStyle = "#2b4845";
    ctx.font = "600 25px system-ui";
    ctx.fillText(
      `${TARGET_NAMES[o.target]} · ${o.distance.toFixed(2)} м`,
      150,
      43,
    );
    ctx.font = "21px system-ui";
    ctx.fillText(
      `Фокус ${state.focus.toFixed(2)} м · ƒ/${state.aperture.toFixed(1)}`,
      150,
      79,
    );
    ctx.fillStyle = "#62766d";
    ctx.font = "18px system-ui";
    ctx.fillText(
      `Пятно точки ${o.blurMm.toFixed(3)} мм · ×${o.spotMagnification}`,
      150,
      114,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, 12, 120, 120);
    ctx.clip();
    ctx.fillStyle = "#203937";
    ctx.fillRect(12, 12, 120, 120);
    ctx.strokeStyle = "#688b7744";
    ctx.lineWidth = 1;
    for (let p = 12; p <= 132; p += 12) {
      ctx.beginPath();
      ctx.moveTo(p, 12);
      ctx.lineTo(p, 132);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, p);
      ctx.lineTo(132, p);
      ctx.stroke();
    }
    // Map mm through the same world scale as the physical sensor, accounting
    // for the dock's display scale. The 24× enlargement is therefore explicit
    // geometry, not an aperture-dependent artistic radius. The grid is symbolic.
    const radius = Math.max(
      1.6,
      (o.blurMm * WORLD_SCALE * o.spotMagnification * canvas.width) /
        (2 * 1.13 * lab.monitor.scale.x),
    );
    ctx.fillStyle = "#a3f0ca55";
    ctx.beginPath();
    ctx.arc(72, 72, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8f7d9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(72, 72, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    texture.needsUpdate = true;
  }
  function sync() {
    const active =
      (lab.station ?? getStation()) === "lens" &&
      getState().experiment !== "prism";
    plaque.visible = bracket.visible = active;
    if (active) {
      const dock = lightPathDock(innerWidth, innerHeight);
      lab.monitor.position.fromArray(dock.position);
      lab.monitor.scale.setScalar(dock.scale);
      lab.monitor.rotation.set(0, dock.rotationY, 0);
      plaque.position.x = bracket.position.x = dock.plaqueX;
      document.body.dataset.lightPathLayout = lightPathPortrait(innerWidth, innerHeight) ? "portrait" : "landscape";
      renderObservation(getState());
    } else {
      delete document.body.dataset.lightPathLayout;
      lab.monitor.position.copy(home.position);
      lab.monitor.scale.copy(home.scale);
      lab.monitor.rotation.copy(home.rotation);
    }
    if (focusPlane) focusPlane.userData.causalVisible = active;
    if (focusZone) focusZone.userData.causalVisible = active;
  }
  const previousVisit = lab.visit.bind(lab);
  lab.visit = function (id) {
    previousVisit(id);
    if (id === "lens" && getState().experiment !== "prism") {
      const view = lightPathView(innerWidth, innerHeight);
      lab.targetView = {
        pos: new THREE.Vector3(...view.pos),
        target: new THREE.Vector3(...view.target),
      };
      lab.camera.fov = view.fov;
      lab.camera.updateProjectionMatrix();
    }
    sync();
  };
  const previousUpdate = lab.update.bind(lab);
  lab.update = function (state) {
    previousUpdate(state);
    sync();
  };
  lab.lightPath = { sync, observation: () => lightPathObservation(getState()) };
  const previousResize = lab.resize.bind(lab);
  lab.resize = function () {
    previousResize();
    if (lab.station === "lens" && getState().experiment !== "prism") {
      const view = lightPathView(innerWidth, innerHeight);
      lab.targetView = {
        pos: new THREE.Vector3(...view.pos),
        target: new THREE.Vector3(...view.target),
      };
      lab.camera.fov = view.fov;
      lab.camera.updateProjectionMatrix();
    }
    sync();
  };
  sync();
  return sync;
}
