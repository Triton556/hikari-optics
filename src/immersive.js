import * as THREE from "three";
import { constrainVisitor } from "./camera-space.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  tracePrism,
  prismVertices,
  glassSlabVertices,
  traceMirror,
} from "./refraction.js";
import { OpticsScene } from "./scene.js";
import {
  solveLens,
  rayThroughStop,
  stopRadius,
  FRONT_X,
  WORLD_SCALE,
  filterTransmission,
} from "./lens-system.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export class ImmersiveLab extends OpticsScene {
  constructor(container, onSelect, onAdjust, onHover) {
    super(container, onSelect);
    this.onAdjust = onAdjust;
    this.onHover = onHover;
    this.direct = [];
    this.dragging = null;
    this.sensor.scale.set(
      (23.5 * WORLD_SCALE) / 0.82,
      (15.6 * WORLD_SCALE) / 0.55,
      1,
    );
    this.sensorFrame.scale.set(1, 0.54 / 0.66, 0.8 / 0.93);
    this.makeTargetStages();
    this.makeControls();
    this.makePrism();
    this.refreshEnvironment();
    container.addEventListener("graphics-status", (e) => {
      if (e.detail === "restored") this.refreshEnvironment();
    });
    this.onFrame = () => {
      for (const o of this.rayGroup?.children ?? [])
        if (o.material.uniforms?.time)
          o.material.uniforms.time.value = this.time;
    };
    this.controls.enablePan = false;
    this.controls.maxDistance = 19;
    this.camera.position.set(
      innerWidth < 650 ? 0.2 : -2.4,
      innerWidth < 650 ? 4 : 3.4,
      innerWidth < 650 ? 9.4 : 9.4,
    );
    this.controls.target.set(0, 1.35, 0);
    this.controls.update();
    const el = this.renderer.domElement;
    el.addEventListener(
      "pointerdown",
      (e) => {
        const hit = this.pickControl(e);
        if (!hit) return;
        this.down = null;
        this.targetView = null;
        this.onHover?.(null, 0, 0);
        this.hoverControl(null);
        const orbit = !hit.userData.adjust;
        this.controls.enabled = orbit;
        this.dragging = {
          orbit,
          startX: e.clientX,
          startY: e.clientY,
          control: hit,
          x: e.clientX,
          y: e.clientY,
          moved: false,
        };
        el.setPointerCapture(e.pointerId);
        if (!orbit) e.stopImmediatePropagation();
      },
      true,
    );
    el.addEventListener("pointermove", (e) => {
      if (this.dragging) {
        const d = this.dragging,
          dx = e.clientX - d.x,
          dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4)
          d.moved = true;
        if (d.control.userData.adjust && d.moved)
          this.onAdjust(
            d.control.userData.control,
            (dx - dy) * 0.008,
            e.shiftKey,
          );
        return;
      }
      const hit = this.pickControl(e);
      this.hoverControl(hit);
      this.onHover?.(hit?.userData.control ?? null, e.clientX, e.clientY);
    });
    el.addEventListener(
      "pointerup",
      (e) => {
        if (!this.dragging) return;
        const d = this.dragging;
        this.dragging = null;
        this.controls.enabled = true;
        this.down = null;
        if (!d.moved) this.onSelect(d.control.userData.control);
        if (!d.orbit) e.stopImmediatePropagation();
      },
      true,
    );
    el.addEventListener("pointerleave", () => {
      if (!this.dragging) {
        this.hoverControl(null);
        this.onHover?.(null, 0, 0);
      }
    });
    el.addEventListener("pointercancel", () => {
      this.dragging = null;
      this.controls.enabled = true;
      this.down = null;
    });
  }
  refreshEnvironment() {
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    const hidden = [this.prismGlass, this.slabGlass, this.mirrorGlass],
      visible = hidden.map((o) => o.visible);
    // A small static classroom reflection probe; no per-frame cubemap cost.
    const cubeTarget = new THREE.WebGLCubeRenderTarget(128, {
      type: THREE.HalfFloatType,
    });
    const probe = new THREE.CubeCamera(0.1, 40, cubeTarget);
    probe.position.set(-2.8, 1.3, 1.65);
    hidden.forEach((o) => (o.visible = false));
    this.scene.add(probe);
    probe.update(this.renderer, this.scene);
    this.scene.remove(probe);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromCubemap(cubeTarget.texture);
    this.scene.environment = this.environmentTarget.texture;
    pmrem.dispose();
    cubeTarget.dispose();
    hidden.forEach((o, i) => (o.visible = visible[i]));
  }
  pickControl(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      1 - ((e.clientY - r.top) / r.height) * 2,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.layers.enable(1);
    const hits = this.raycaster
      .intersectObjects(this.direct, true)
      .filter((h) => {
        let o = h.object;
        while (o) {
          if (!o.visible) return false;
          o = o.parent;
        }
        return true;
      });
    if (!hits.length && (e.pointerType === "touch" || innerWidth < 650)) {
      // Screen-space forgiving targets for touch; no invisible world geometry.
      let nearest = null,
        limit = 28;
      for (const control of this.direct) {
        let visible = true,
          o = control;
        while (o) {
          if (!o.visible) visible = false;
          o = o.parent;
        }
        if (!visible) continue;
        const point = control
          .getWorldPosition(new THREE.Vector3())
          .project(this.camera);
        if (point.z > 1) continue;
        const x = (point.x * 0.5 + 0.5) * r.width + r.left,
          y = (-point.y * 0.5 + 0.5) * r.height + r.top,
          d = Math.hypot(e.clientX - x, e.clientY - y);
        if (d < limit) {
          nearest = control;
          limit = d;
        }
      }
      return nearest;
    }
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.control) o = o.parent;
    return o;
  }
  hoverControl(o) {
    if (this.hovered === o) return;
    if (this.hovered?.userData.hoverOutline)
      this.hovered.userData.hoverOutline.visible = false;
    this.hovered?.traverse((m) => {
      if (m.material?.emissive && m.userData.restEmissive !== undefined) {
        m.material.emissiveIntensity = m.userData.restEmissive;
        if (m.userData.restEmissiveColor)
          m.material.emissive.copy(m.userData.restEmissiveColor);
      }
    });
    this.hovered = o;
    if (o?.userData.hoverOutline) o.userData.hoverOutline.visible = true;
    o?.traverse((m) => {
      if (m.material?.emissive && !m.material.transparent) {
        m.userData.restEmissiveColor ??= m.material.emissive.clone();
        m.userData.restEmissive ??= m.material.emissiveIntensity;
        m.material.emissive.set(0xd5a557);
        m.material.emissiveIntensity = ["screen", "lens", "body"].includes(
          o.userData.control,
        )
          ? 0.04
          : 0.16;
      }
    });
    this.renderer.domElement.style.cursor = o
      ? o.userData.adjust
        ? "ew-resize"
        : "pointer"
      : "grab";
  }
  control(o, id, adjust = false) {
    o.userData.control = id;
    o.userData.adjust = adjust;
    this.direct.push(o);
    if (o.isMesh && o.material.transparent) {
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(o.geometry),
        new THREE.LineBasicMaterial({
          color: 0xffdfa1,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      outline.visible = false;
      o.add(outline);
      o.userData.hoverOutline = outline;
    }
    return o;
  }
  plaque(label, pos, id, w = 1.45) {
    const g = new THREE.Group();
    g.position.set(...pos);
    this.scene.add(g);
    g.rotation.x = 0.28;
    this.box(w, 0.055, 0.34, 0x23474a, [0, 0, 0], g);
    const t = this.text(label, w - 0.08, 0.24, "#f7e9bf");
    t.rotation.x = -Math.PI / 2;
    t.position.y = 0.032;
    g.add(t);
    return this.control(g, id);
  }
  ring(x, color, id, r = 0.57) {
    const g = new THREE.Group();
    g.position.set(x, 1.62, 0);
    this.scene.add(g);
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.055, 10, 64),
      this.mat(color, { metalness: 0.5, roughness: 0.3 }),
    );
    m.rotation.y = Math.PI / 2;
    g.add(m);
    const ribs = [];
    for (let n = 0; n < 32; n++) {
      const a = (n * Math.PI) / 16;
      const rib = this.box(
        0.12,
        0.035,
        0.035,
        0xe0caa0,
        [0, Math.cos(a) * r, Math.sin(a) * r],
        g,
        0.008,
      );
      rib.rotation.x = a;
      rib.updateMatrix();
      const geometry = rib.geometry.clone().applyMatrix4(rib.matrix);
      ribs.push(geometry);
      g.remove(rib);
      rib.geometry.dispose();
      rib.material.dispose();
    }
    const grip = new THREE.Mesh(
      mergeGeometries(ribs, false),
      this.mat(0xe0caa0, { metalness: 0.3 }),
    );
    g.add(grip);
    ribs.forEach((r) => r.dispose());
    const hitFace = new THREE.Mesh(
      new THREE.CircleGeometry(r, 32),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    hitFace.rotation.y = Math.PI / 2;
    hitFace.userData.hitOnly = true;
    g.add(hitFace);
    this.control(g, id, true);
    return g;
  }
  makeTargetStages() {
    this.targetStages = { cat: this.subject };
    for (const id of ["flower", "chart"]) {
      const group = new THREE.Group();
      this.scene.add(group);
      group.add(this[id]);
      this.cyl(0.24, 0.27, 0.12, 0xdcc69d, [0, 0.02, 0], group, 24);
      this.targetStages[id] = group;
    }
    for (const [id, group] of Object.entries(this.targetStages))
      this.control(group, "object:" + id, true);
  }
  makeControls() {
    this.cutBody = new THREE.Group();
    this.cam.add(this.cutBody);
    this.box(1.15, 0.06, 1.75, 0xf1ecdc, [0.12, -0.53, 0], this.cutBody);
    this.box(1.15, 0.06, 1.75, 0xf1ecdc, [0.12, 0.53, 0], this.cutBody);
    this.box(0.07, 1.06, 1.75, 0xe6e0d0, [0.67, 0, 0], this.cutBody);
    this.box(1.15, 1.06, 0.07, 0xe6e0d0, [0.12, 0, -0.86], this.cutBody);
    this.mechanismSlides = [];
    for (const z of [-0.34, 0.34]) {
      const rail = this.cyl(
        0.018,
        0.018,
        2.5,
        0xc6c9bb,
        [1.3, 1.01, z],
        this.scene,
        12,
      );
      rail.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 3; i++) {
      const slide = new THREE.Group();
      slide.position.set(0.3 + i * 0.8, 1.04, 0);
      this.scene.add(slide);
      this.box(0.19, 0.09, 0.83, 0x719c94, [0, 0, 0], slide);
      this.box(0.075, 0.19, 0.075, 0x93a69b, [0, 0.12, -0.34], slide);
      this.box(0.075, 0.19, 0.075, 0x93a69b, [0, 0.12, 0.34], slide);
      this.mechanismSlides.push(slide);
    }
    this.zoomControl = this.ring(0.37, 0x6caaa2, "zoom");
    this.focusControl = this.ring(2.1, 0xd4aa71, "focus", 0.47);
    this.apertureControl = this.ring(1.15, 0x838fbc, "aperture", 0.51);
    this.plaque("01  ОБЪЕКТЫ", [-2.9, 1.0, 0.96], "objects");
    this.plaque("02  ОБЪЕКТИВ", [0.8, 1.0, 0.96], "lens", 1.8);
    this.plaque("03  МАТРИЦА", [3.08, 1.0, 0.96], "sensor");
    this.filterMount = new THREE.Group();
    this.filterMount.position.set(0.08, 1.62, 0);
    this.scene.add(this.filterMount);
    this.control(this.filterMount, "filter", true);
    this.filterRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.57, 0.035, 8, 64),
      this.mat(0x3b4552, { metalness: 0.75 }),
    );
    this.filterRim.rotation.y = Math.PI / 2;
    this.filterMount.add(this.filterRim);
    this.box(
      0.08,
      0.07,
      0.022,
      0xffe3ae,
      [0, 0.59, 0],
      this.filterMount,
      0.005,
    );
    for (let n = 0; n < 12; n++) {
      const a = (n * Math.PI) / 6;
      this.box(
        0.05,
        0.018,
        0.018,
        0xd1bc91,
        [0, Math.cos(a) * 0.58, Math.sin(a) * 0.58],
        this.filterMount,
        0.002,
      );
    }
    this.filterGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.535, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0x738791,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.1,
      }),
    );
    this.filterGlass.rotation.y = Math.PI / 2;
    this.filterMount.add(this.filterGlass);
    this.polarizerGrid = new THREE.Group();
    this.filterMount.add(this.polarizerGrid);
    const gridParts = [];
    for (let i = -7; i <= 7; i++) {
      const z = i * 0.06,
        half = Math.sqrt(0.5 * 0.5 - z * z);
      const geometry = new THREE.BoxGeometry(0.004, half * 2, 0.006);
      geometry.translate(-0.012, 0, z);
      gridParts.push(geometry);
    }
    const grid = new THREE.Mesh(
      mergeGeometries(gridParts, false),
      new THREE.MeshBasicMaterial({
        color: 0xb3d7e8,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    gridParts.forEach((g) => g.dispose());
    this.polarizerGrid.add(grid);
    this.filterSlots = [];
    this.filterTray = new THREE.Group();
    this.filterTray.position.set(-0.2, 0.72, 1.68);
    this.scene.add(this.filterTray);
    this.box(2.8, 0.08, 0.65, 0x375454, [0, 0, 0], this.filterTray);
    for (const [i, id, label, col] of [
      [0, "none", "СНЯТЬ", 0xaebcaa],
      [1, "nd", "ND", 0x627078],
      [2, "cpl", "CPL", 0x668c9c],
      [3, "soft", "MIST", 0xbac8bd],
    ]) {
      const g = new THREE.Group();
      g.position.set((i - 1.5) * 0.67, 0.08, 0);
      this.filterTray.add(g);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.026, 6, 32),
        this.mat(col),
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.195, 32),
        new THREE.MeshStandardMaterial({
          color: col,
          metalness: 0.15,
          roughness: 0.15,
          transparent: true,
          opacity: id === "none" ? 0.12 : 0.6,
          side: THREE.DoubleSide,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.002;
      g.add(disc);
      const t = this.text(label, 0.5, 0.15, "#f4e4b8");
      t.rotation.x = -0.55;
      t.position.set(0, 0.075, 0.29);
      g.add(t);
      this.control(g, "filter:" + id);
      this.filterSlots.push({ id, disc, ring });
    }
    this.plaque("СМЕНИТЬ СВЕТ", [-4.25, 1.0, 0.96], "weather", 1.5);
    this.plaque("РАЗРЕЗ", [2, 0.73, 1.73], "cutaway", 1.0);

    this.plaque("ОБЪЕКТ ↻", [-3.1, 0.92, -0.95], "change-object");
    this.plaque("БЛИКИ / CPL", [0.1, 0.78, 2.28], "pane", 1.6);
    this.glarePane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 1.1),
      new THREE.MeshPhysicalMaterial({
        color: 0xc4ebf1,
        transparent: true,
        opacity: 0.12,
        roughness: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.glarePane.position.set(-1.3, 1.65, 0);
    this.glarePane.rotation.y = Math.PI / 2;
    this.scene.add(this.glarePane);
    this.monitor = new THREE.Group();
    this.monitor.position.set(3.9, 1.38, 0.53);
    this.scene.add(this.monitor);
    this.box(1.12, 0.82, 0.065, 0x283d42, [0, 0, 0], this.monitor);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 0.655),
      new THREE.MeshBasicMaterial({ map: this.displayTexture }),
    );
    screen.position.z = 0.038;
    this.monitor.add(screen);
    this.box(0.07, 0.38, 0.08, 0x607b75, [0, -0.53, -0.02], this.monitor);
    this.box(0.7, 0.05, 0.35, 0x607b75, [0, -0.71, 0], this.monitor);
    this.control(this.monitor, "screen");
    const sensorLabel = this.text(
      "МАТРИЦА · ПЕРЕВЁРНУТО",
      0.7,
      0.08,
      "#f6e5bd",
    );
    sensorLabel.position.set(2.51, 1.25, 0);
    sensorLabel.rotation.y = -Math.PI / 2;
    this.scene.add(sensorLabel);
    const monitorLabel = this.text("ЭКРАН · РАЗВЁРНУТО", 1, 0.09, "#eadcbf");
    monitorLabel.position.set(0, -0.35, 0.043);
    this.monitor.add(monitorLabel);
    this.autoPlaque = this.plaque(
      "M · РУЧНОЙ",
      [4, 0.75, 1.7],
      "auto-exposure",
      0.9,
    );
    this.autoModeText = this.text("A · АВТО", 0.82, 0.24, "#bce6cf");
    this.autoModeText.rotation.copy(this.autoPlaque.children[1].rotation);
    this.autoModeText.position.copy(this.autoPlaque.children[1].position);
    this.autoPlaque.add(this.autoModeText);
    const isoKnob = this.cyl(
      0.12,
      0.12,
      0.11,
      0x6d9ca5,
      [3.6, 2.25, 0.12],
      this.scene,
    );
    this.control(isoKnob, "iso", true);
    const lightKnob = this.cyl(
      0.15,
      0.15,
      0.12,
      0xf0c985,
      [-4.3, 1.07, 0.95],
      this.scene,
    );
    this.control(lightKnob, "light", true);
    this.exposureKnob = this.cyl(
      0.14,
      0.14,
      0.13,
      0xd4a86f,
      [3.2, 2.28, 0.1],
      this.scene,
    );
    this.control(this.exposureKnob, "exposure", true);
  }
  visit(id) {
    const views = {
      desk: [
        [-1.7, 3.15, 8.8],
        [0, 1.3, 0],
      ],
      objects: [
        [-0.4, 2.8, 4.2],
        [-2.8, 1.5, 0],
      ],
      lens: [
        [0.7, 2.4, 3.25],
        [1.3, 1.62, 0],
      ],
      aperture: [
        [-0.45, 1.95, 1.7],
        [this.iris.position.x, 1.62, 0],
      ],
      screen: [
        [3.9, 1.75, 2.7],
        [3.9, 1.38, 0.53],
      ],
      sensor: [
        [0.8, 2.25, 2.4],
        [2.9, 1.55, 0.15],
      ],
      filters: [
        [2.8, 3, 6.8],
        [1.1, 1.3, 0.4],
      ],
      prism: [
        [-2.9, 2.9, 4.8],
        [-2.9, 0.98, 1.65],
      ],
    };
    const v = views[id] ?? views.desk;
    if (innerWidth < 650) {
      if (id === "desk") v[0] = [0.2, 4, 9.4];
      else if (id === "lens") v[0] = [1.4, 2.35, 6.6];
      else if (id === "objects") v[0] = [-1.3, 3.1, 5.3];
      else if (id === "filters") {
        v[0] = [1.5, 3, 8.5];
        v[1] = [1.5, 1.35, 0.3];
      } else if (id === "prism") v[0] = [-2.9, 3.5, 7];
    }

    this.targetView = {
      pos: V(...constrainVisitor(v[0], v[1])),
      target: V(...v[1]),
    };
    this.station = id;
    this.resize();
    this.mountRings[1].visible = !(this.state?.cutaway && id === "sensor");
    this.zoomControl.visible = id !== "aperture";
    this.mountRings[0].visible = id !== "aperture";
    this.lensElements.forEach((o, i) => {
      o.material.opacity = id === "aperture" && i < 6 ? 0.025 : 0.24;
      o.userData.edge.visible = !(id === "aperture" && i < 6);
    });
    this.barrels.forEach(
      (o) => (o.visible = !(this.state?.cutaway && id === "sensor")),
    );
  }
  update(s) {
    this.solution = solveLens(s.focal, s.focus);
    this.autoPlaque.children[1].visible = !s.exposureAuto;
    this.autoModeText.visible = s.exposureAuto;
    this.deferRayRebuild = true;
    super.update(s);
    this.deferRayRebuild = false;
    this.shell.forEach((o) => (o.visible = !s.cutaway));
    this.cutBody.visible = s.cutaway;
    this.mountRings[1].visible = !(s.cutaway && this.station === "sensor");
    this.barrels.forEach(
      (o) => (o.visible = !(s.cutaway && this.station === "sensor")),
    );
    for (const [id, group] of Object.entries(this.targetStages)) {
      const d =
        s[id + "Distance"] ?? (id === "cat" ? 1.5 : id === "flower" ? 2.2 : 3);
      group.position.set(
        -2.6 - (d - 1.5) * 0.62,
        0.98,
        s[id + "Offset"] ?? (id === "cat" ? 0 : id === "flower" ? -0.72 : 0.72),
      );
      this[id].visible = true;
    }
    this.scene.environmentIntensity =
      (s.weather === "night" ? 0.12 : 0.45) * Math.sqrt(s.light);
    this.hemi.intensity *= 0.48;
    this.fill.intensity *= 0.75;
    this.sun.intensity *= 1.16;
    this.bloom.strength = s.weather === "night" ? 0.58 : 0.38;
    this.lensElements.forEach((o, i) => {
      o.material.opacity = this.station === "aperture" && i < 6 ? 0.025 : 0.24;
      o.userData.edge.visible = !(this.station === "aperture" && i < 6);
      o.material.roughness = 0.06;
      o.material.forceSinglePass = true;
      o.scale.y = 0.22;
      o.userData.targetX = FRONT_X + this.solution.positions[i] * WORLD_SCALE;
      o.position.x = o.userData.targetX;
      o.userData.edge.position.x = o.position.x;
    });
    this.iris.position.x = FRONT_X + this.solution.stopX * WORLD_SCALE;
    this.irisRing.geometry.dispose();
    this.irisRing.geometry = new THREE.RingGeometry(
      Math.max(0.008, stopRadius(this.solution, s.aperture) * WORLD_SCALE),
      0.51,
      7,
    );
    this.mechanismSlides.forEach(
      (o, i) =>
        (o.position.x =
          FRONT_X + this.solution.positions[i * 3 + 1] * WORLD_SCALE),
    );
    this.updateIris(stopRadius(this.solution, s.aperture) * WORLD_SCALE);
    this.apertureControl.position.x = this.iris.position.x;
    this.apertureControl.rotation.x = s.aperture * 0.08;
    for (const slot of this.filterSlots) {
      slot.disc.visible = slot.id !== s.filter;
      slot.ring.material.color.set(slot.id === s.filter ? 0xf5cb83 : 0x768b89);
    }
    this.glarePane.visible = !!s.pane;
    this.filterMount.visible = s.filter !== "none";
    this.polarizerGrid.visible = s.filter === "cpl";
    this.filterGlass.material.opacity =
      s.filter === "nd"
        ? 1 - filterTransmission("nd", s.ndStops) * 0.82
        : s.filter === "cpl"
          ? 0.35
          : 0.14;
    this.filterMount.rotation.x =
      ((s.filter === "nd"
        ? s.ndStops * 22.5
        : s.filter === "soft"
          ? s.softStrength * 180
          : (s.filterAngle ?? 0)) *
        Math.PI) /
      180;
    this.zoomControl.rotation.x = s.focal * 0.1;
    this.focusControl.rotation.x = s.focus;
    this.focusControl.position.x =
      FRONT_X + this.solution.positions[7] * WORLD_SCALE;
    this.rebuildRays(s);
    this.updatePrism(s);
  }
  updateIris(radius) {
    this.irisRing.visible = false;
    if (!this.mechanicalIris) {
      this.mechanicalIris = new THREE.Group();
      this.iris.add(this.mechanicalIris);
    }
    if (this.lastIrisRadius === radius) return;
    this.lastIrisRadius = radius;
    for (const child of [...this.mechanicalIris.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.mechanicalIris.remove(child);
    }
    const r = Math.max(0.006, radius),
      outer = 0.51,
      twist = 0.35 + (1 - r / outer) * 0.4;
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7,
        b = ((i + 1) * Math.PI * 2) / 7;
      const points = [
        [r * Math.cos(a), r * Math.sin(a)],
        [r * Math.cos(b), r * Math.sin(b)],
      ];
      for (let n = 0; n <= 8; n++) {
        const t = b + twist + ((a - b) * n) / 8;
        points.push([outer * Math.cos(t), outer * Math.sin(t)]);
      }
      const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
      const blade = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        this.mat(i % 2 ? 0x84979a : 0x617d83, {
          metalness: 0.35,
          roughness: 0.32,
          side: THREE.DoubleSide,
        }),
      );
      blade.rotation.y = Math.PI / 2;
      blade.position.x = i * 0.0005;
      this.mechanicalIris.add(blade);
    }
  }
  makePrism() {
    this.prismBench = new THREE.Group();
    this.prismBench.position.set(-2.9, 0.74, 1.65);
    this.scene.add(this.prismBench);
    this.box(2.45, 0.08, 1.15, 0x35545a, [0, 0, 0], this.prismBench);
    this.prismGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.55, 3),
      new THREE.MeshPhysicalMaterial({
        color: 0xc0e9ee,
        metalness: 0.05,
        roughness: 0.03,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.prismGlass.position.set(0.1, 0.32, 0);
    this.prismBench.add(this.prismGlass);
    this.control(this.prismGlass, "prism", true);
    this.slabGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.55, 0.65),
      this.prismGlass.material.clone(),
    );
    this.slabGlass.position.copy(this.prismGlass.position);
    this.prismBench.add(this.slabGlass);
    this.control(this.slabGlass, "prism", true);
    this.mirrorGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.55, 0.65),
      this.mat(0xcad9df, { metalness: 1, roughness: 0.06 }),
    );
    this.mirrorGlass.position.copy(this.prismGlass.position);
    this.prismBench.add(this.mirrorGlass);
    this.control(this.mirrorGlass, "prism", true);
    this.plaque("ЭЛЕМЕНТ ↻", [-1.55, 0.78, 2.28], "prism-shape", 1.05);
    this.prismSource = this.box(
      0.28,
      0.24,
      0.24,
      0xdec18d,
      [-0.95, 0.3, 0],
      this.prismBench,
    );
    this.control(this.prismSource, "source", true);
    const light = new THREE.Mesh(
      new THREE.CircleGeometry(0.075, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffedce).multiplyScalar(3),
      }),
    );
    light.rotation.y = Math.PI / 2;
    light.position.set(0.151, 0, 0);
    this.prismSource.add(light);
    this.plaque("04  ПРИЗМА", [-2.9, 0.75, 2.28], "prism-station", 1.5);
    this.spectrum = new THREE.Group();
    this.prismBench.add(this.spectrum);
  }
  updatePrism(s) {
    const key = [s.prismAngle, s.sourceAngle, s.prismShape].join(":");
    if (this.prismKey === key) return;
    this.prismKey = key;
    if (!this.prismGlass) return;
    const angle = s.prismAngle ?? Math.PI / 2;
    this.prismGlass.rotation.y = -angle + Math.PI / 2;
    this.prismGlass.visible = !s.prismShape || s.prismShape === "prism";
    this.slabGlass.visible = s.prismShape === "slab";
    this.mirrorGlass.visible = s.prismShape === "mirror";
    this.slabGlass.rotation.y = -(angle - Math.PI / 2);
    this.mirrorGlass.rotation.y = -(angle - Math.PI / 2);
    for (const child of [...this.spectrum.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.spectrum.remove(child);
    }
    this.prismSource.rotation.y = -(s.sourceAngle ?? 0);
    const sourceDirection = [
      Math.cos(s.sourceAngle ?? 0),
      Math.sin(s.sourceAngle ?? 0),
    ];
    const sourceOrigin = [
      -0.95 + 0.16 * sourceDirection[0],
      0.16 * sourceDirection[1],
    ];
    const polygon =
        s.prismShape === "slab"
          ? glassSlabVertices(0.1, 0, 0.13, 0.65, angle - Math.PI / 2)
          : prismVertices(0.1, 0, 0.3, angle),
      wavelengths = [650, 610, 580, 550, 500, 470, 430],
      colors = [
        0xff6856, 0xffa756, 0xffe881, 0xaeea9c, 0x83eee0, 0x8bbcff, 0xb18afa,
      ];
    for (let n = 0; n < wavelengths.length; n++) {
      const result =
        s.prismShape === "mirror"
          ? traceMirror(
              sourceOrigin,
              sourceDirection,
              [0.1, 0],
              s.prismAngle ?? Math.PI / 2,
              0.65,
            )
          : tracePrism(sourceOrigin, sourceDirection, polygon, wavelengths[n]);
      if (n === 3)
        this.prismObservation = {
          intersects: result.path.length > 2,
          internalReflection: result.path.some((p) => p.tir),
        };
      for (let i = 0; i < result.path.length - 1; i++) {
        const a = result.path[i].point,
          b = result.path[i + 1].point,
          from = V(a[0], 0.3, a[1]),
          to = V(b[0], 0.3, b[1]);
        if (Math.abs(to.x) > 1.18 || Math.abs(to.z) > 0.51) {
          const delta = to.clone().sub(from);
          let t = 1;
          if (delta.x > 0) t = Math.min(t, (1.18 - from.x) / delta.x);
          if (delta.x < 0) t = Math.min(t, (-1.18 - from.x) / delta.x);
          if (delta.z > 0) t = Math.min(t, (0.51 - from.z) / delta.z);
          if (delta.z < 0) t = Math.min(t, (-0.51 - from.z) / delta.z);
          to.copy(from).addScaledVector(delta, Math.max(0, t));
        }
        const length = from.distanceTo(to);
        if (length < 0.001) continue;
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(
            i === 0 ? 0.007 : 0.0025,
            i === 0 ? 0.007 : 0.0025,
            length,
            8,
            1,
            true,
          ),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(colors[n]).multiplyScalar(2),
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        beam.position.copy(from).lerp(to, 0.5);
        beam.quaternion.setFromUnitVectors(
          V(0, 1, 0),
          to.clone().sub(from).normalize(),
        );
        this.spectrum.add(beam);
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 8, 8),
          new THREE.MeshBasicMaterial({
            color: colors[n],
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        glow.position.copy(to);
        if (i === result.path.length - 2) {
          glow.scale.setScalar(0.3);
          this.spectrum.add(glow);
        } else {
          glow.geometry.dispose();
          glow.material.dispose();
        }
      }
    }
  }
  rebuildRays(s) {
    if (!this.solution || this.deferRayRebuild) return;
    const key = [
      s.focal,
      s.focus,
      s.aperture,
      s.distance,
      s.object,
      s[s.object + "Offset"],
      s.rays,
      s.filter,
      s.filterBypass,
      s.ndStops,
      s.light,
    ].join(":");
    if (this.rayKey === key) return;
    this.rayKey = key;
    if (this.rayGroup) {
      this.scene.remove(this.rayGroup);
      this.rayGroup.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    this.rayGroup = new THREE.Group();
    this.rayGroup.visible = s.rays;
    this.scene.add(this.rayGroup);
    this.photonGroup = null;
    this.rayPaths = null;
    const stop = stopRadius(this.solution, s.aperture),
      colors = [0xffb569, 0x91e6d6, 0xa8b6ff];
    for (let b = 0; b < 3; b++) {
      const h = (b - 1) * 125,
        paths = [];
      for (let n = 0; n < 24; n++) {
        const a = (n / 24) * Math.PI * 2;
        const yr = rayThroughStop(
          this.solution,
          s.distance,
          h,
          stop * Math.cos(a),
        );
        const zr = rayThroughStop(
          this.solution,
          s.distance,
          this.targetStages[s.object].position.z * 300,
          stop * Math.sin(a),
        );
        paths.push([
          V(
            this.targetStages[s.object].position.x,
            1.62 + (b - 1) * 0.25,
            this.targetStages[s.object].position.z,
          ),
          ...yr.path.map((p, i) =>
            V(
              FRONT_X + p.x * WORLD_SCALE,
              1.62 + p.y * WORLD_SCALE,
              zr.path[i].y * WORLD_SCALE,
            ),
          ),
        ]);
      }
      const vertices = [],
        uv = [];
      for (let k = 0; k < paths[0].length - 1; k++)
        for (let n = 0; n < 24; n++) {
          const nn = (n + 1) % 24;
          for (const [pi, ki] of [
            [n, k],
            [nn, k],
            [n, k + 1],
            [nn, k],
            [nn, k + 1],
            [n, k + 1],
          ]) {
            vertices.push(...paths[pi][ki]);
            uv.push(pi / 24, ki / (paths[0].length - 1));
          }
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          color: { value: new THREE.Color(colors[b]) },
          time: { value: 0 },
          power: { value: 0.1 * Math.sqrt(s.light) },
          transmission: {
            value: Math.sqrt(filterTransmission(s.filterBypass ? "none" : s.filter, s.ndStops)),
          },
        },
        vertexShader:
          "varying vec2 vUv; varying float vX; varying vec3 vNormal; varying vec3 vEye; void main(){vUv=uv;vX=position.x;vec4 mv=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vEye=-mv.xyz;gl_Position=projectionMatrix*mv;}",
        fragmentShader:
          "uniform vec3 color;uniform float power;uniform float transmission;uniform float time;varying vec2 vUv;varying float vX;varying vec3 vNormal;varying vec3 vEye;void main(){float volume=pow(clamp(abs(dot(normalize(vNormal),normalize(vEye))),0.,1.),.72);float strands=volume*(.92+.08*pow(abs(sin(vUv.x*75.398)),5.));float attenuation=mix(1.,transmission,smoothstep(.075,.085,vX));gl_FragColor=vec4(color*3.6,power*strands*attenuation*(.9+.1*sin(vUv.y*25.-time*2.5)));}",
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.layers.set(1);
      this.rayGroup.add(mesh);
    }
  }
  resize() {
    super.resize();
    if (this.camera.aspect < 0.8) {
      this.camera.fov =
        !this.station || this.station === "desk"
          ? 96
          : this.station === "prism"
            ? 88
            : this.station === "filters"
              ? 82
              : this.station === "sensor"
                ? 70
                : 60;
      this.camera.updateProjectionMatrix();
    }
  }
  dispose() {
    this.environmentTarget?.dispose();
    super.dispose();
  }
}
