import * as THREE from "three";
import { createSpectatorFocus } from "./spectator-focus.js";
import { constrainVisitor } from "./camera-space.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, lerp, optics } from "./optics.js";
const C = {
  cream: 0xf2eddf,
  teal: 0x70a99e,
  dark: 0x263e42,
  wood: 0xba8760,
  gold: 0xf1b669,
  coral: 0xe99480,
  glass: 0x8bddd3,
};
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
export class OpticsScene {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcddbd7);
    this.scene.fog = new THREE.Fog(0xd8dcd1, 18, 45);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.fpsFrames = 0;
    this.fpsStart = performance.now();
    this.fps = 0;
    this.hit = [];
    this.labels = [];
    this.layers = [];
    this.targetView = null;
    this.lastUpdate = 0;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.append(this.renderer.domElement);
    this.contextLost = false;
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.contextLost = true;
      container.dispatchEvent(
        new CustomEvent("graphics-status", { detail: "lost" }),
      );
    });
    this.renderer.domElement.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      this.renderer.shadowMap.needsUpdate = true;
      container.dispatchEvent(
        new CustomEvent("graphics-status", { detail: "restored" }),
      );
    });
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Интерактивный 3D-стенд камеры: перетаскивайте для вращения, используйте кнопки видов для навигации",
    );
    this.renderer.domElement.tabIndex = 0;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.camera.position.set(7.2, 4.7, 10.6);
    this.camera.layers.enable(1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.05, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.8;
    this.controls.maxDistance = 19;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minPolarAngle = 0.15;
    this.controls.addEventListener("start", () => (this.targetView = null));
    this.hemi = new THREE.HemisphereLight(0xe0f0ef, 0x7f5a43, 2.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd49b, 3.8);
    this.sun.position.set(-7, 10, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    Object.assign(this.sun.shadow.camera, {
      left: -10,
      right: 10,
      top: 9,
      bottom: -9,
      near: 0.1,
      far: 30,
    });
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0x95bcff, 1.0);
    this.fill.position.set(3, 5, -7);
    this.scene.add(this.fill);
    this.deskLight = new THREE.PointLight(0xffc778, 12, 7, 2);
    this.deskLight.position.set(-3, 3.4, 1.9);
    this.scene.add(this.deskLight);
    const existing = new Set(this.scene.children);
    this.makeRoom();
    this.mergeStaticRoom(this.scene.children.filter((o) => !existing.has(o)));
    this.makeStand();
    this.makeCamera();
    this.makeTargets();
    this.makeAtmosphere();
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.36, 0.7, 1.08);
    this.composer.addPass(this.bloom);
    this.spectatorFocus = createSpectatorFocus(this);
    this.composer.addPass(this.spectatorFocus);
    this.composer.addPass(new OutputPass());
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.down = null;
    this.renderer.domElement.addEventListener(
      "pointerdown",
      (e) => (this.down = [e.clientX, e.clientY]),
    );
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (
        !this.down ||
        Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5
      )
        return;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.raycaster.layers.enable(1);
      const hits = this.raycaster
        .intersectObjects(this.hit, true)
        .filter((hit) => {
          let object = hit.object;
          while (object) {
            if (!object.visible) return false;
            object = object.parent;
          }
          return true;
        });
      if (hits[0]) {
        let o = hits[0].object;
        while (o && !o.userData.part) o = o.parent;
        if (o) this.onSelect(o.userData.part);
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }
  mat(color, extra = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.05,
      ...extra,
    });
  }
  mesh(geo, mat, pos, parent = this.scene) {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(...pos);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  box(w, h, d, col, pos, parent = this.scene, round = 0.03) {
    return this.mesh(
      round
        ? new RoundedBoxGeometry(w, h, d, 2, round)
        : new THREE.BoxGeometry(w, h, d),
      this.mat(col),
      pos,
      parent,
    );
  }
  cyl(rt, rb, h, col, pos, parent = this.scene, n = 32) {
    return this.mesh(
      new THREE.CylinderGeometry(rt, rb, h, n),
      this.mat(col),
      pos,
      parent,
    );
  }
  sphere(r, col, pos, parent = this.scene, seg = 12) {
    return this.mesh(
      new THREE.SphereGeometry(r, seg, 8),
      this.mat(col),
      pos,
      parent,
    );
  }
  text(text, w, h, color = "#eae2c8", bg = null) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext("2d");
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.fillStyle = color;
    let fontSize = 100;
    ctx.font = `500 ${fontSize}px sans-serif`;
    while (ctx.measureText(text).width > c.width - 50 && fontSize > 30) {
      fontSize -= 2;
      ctx.font = `500 ${fontSize}px sans-serif`;
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 130);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tx,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
  }
  part(group, id, label, pos) {
    group.userData.part = id;
    this.hit.push(group);
    this.labels.push({ id, label, anchor: vec(...pos) });
    return group;
  }
  mergeStaticRoom(objects) {
    // Static classroom furniture shares a small material palette. Batch it once,
    // keeping all interactive optics as independent meshes for picking/motion.
    const batches = new Map();
    this.scene.updateMatrixWorld(true);
    for (const o of objects) {
      if (
        !o.isMesh ||
        !o.material?.isMeshStandardMaterial ||
        o.material.transparent ||
        o.material.map ||
        o.children.length
      )
        continue;
      const m = o.material;
      const key = [
        m.color.getHex(),
        m.emissive.getHex(),
        m.emissiveIntensity,
        m.roughness,
        m.metalness,
        m.side,
        o.castShadow,
        o.receiveShadow,
      ].join(":");
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(o);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const copies = meshes.map((o) => {
        const g = o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        return g;
      });
      const combined = mergeGeometries(copies, false);
      copies.forEach((g) => g.dispose());
      if (!combined) continue;
      combined.computeBoundingSphere();
      const batch = new THREE.Mesh(combined, meshes[0].material);
      batch.name = "Classroom static batch";
      batch.castShadow = meshes[0].castShadow;
      batch.receiveShadow = meshes[0].receiveShadow;
      this.scene.add(batch);
      meshes.forEach((o, i) => {
        o.parent.remove(o);
        o.geometry.dispose();
        if (i) o.material.dispose();
      });
    }
  }
  makeRoom() {
    this.box(23, 0.2, 20, 0xb58b68, [0, -0.8, 0], this.scene, 0);
    for (let x = -11; x < 12; x += 1.5) {
      this.box(0.018, 0.012, 19, 0x8c6b50, [x, -0.688, 0], this.scene, 0);
      for (let z = -9; z < 10; z += 3)
        this.box(
          1.48,
          0.013,
          0.012,
          0xa67f5d,
          [x + 0.74, -0.686, z + (x % 3 ? 1.5 : 0)],
          this.scene,
          0,
        );
    }
    // A real corner-window opening keeps the classroom visible behind the bench.
    this.box(3.7, 7, 0.25, 0xe6dfcc, [-9.65, 2.7, -7.5], this.scene, 0);
    this.box(16, 7, 0.25, 0xe6dfcc, [3.5, 2.7, -7.5], this.scene, 0);
    this.box(3.3, 2, 0.25, 0xe6dfcc, [-6.15, 0.2, -7.5], this.scene, 0);
    this.box(3.3, 1, 0.25, 0xe6dfcc, [-6.15, 5.7, -7.5], this.scene, 0);
    for (const x of [-7.8, -6.15, -4.5])
      this.box(0.1, 4.15, 0.22, 0x71968c, [x, 3.2, -7.35]);
    for (const y of [1.2, 3.2, 5.2])
      this.box(3.4, 0.1, 0.22, 0x71968c, [-6.15, y, -7.35]);
    this.box(3.6, 0.14, 0.48, 0xc8b995, [-6.15, 1.16, -7.2]);
    const backGlass = this.mesh(
      new THREE.PlaneGeometry(3.2, 3.95),
      new THREE.MeshBasicMaterial({
        color: 0xd5e5df,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      [-6.15, 3.2, -7.37],
    );
    for (let i = 0; i < 4; i++) {
      const x = -7.4 + i * 0.8;
      this.cyl(0.05, 0.09, 3.1, 0x8b7964, [x, 1.25, -9.8], this.scene, 7);
      for (let j = 0; j < 3; j++) {
        const crown = this.sphere(
          0.8,
          [0xc4d6a4, 0xe7c2b1, 0xa8c5a6][j],
          [x + (j - 1) * 0.45, 2.6 + j * 0.38, -9.8],
          this.scene,
          7,
        );
        crown.scale.y = 0.7;
      }
    }

    this.box(23, 1.6, 0.3, 0x91ada4, [0, 0.05, -7.32], this.scene, 0);
    this.box(23, 0.09, 0.34, 0x65847c, [0, 0.88, -7.28]);
    this.box(0.2, 1.3, 15, 0xe6dfcc, [-9, 0, -0.2], this.scene, 0);
    this.box(0.2, 1.3, 15, 0xe6dfcc, [-9, 5.8, -0.2], this.scene, 0);
    for (let z = -6; z < 7; z += 3) {
      this.box(0.24, 5, 0.14, 0x809589, [-9, 3.05, z]);
      this.box(0.24, 0.14, 3, 0x809589, [-9, 2.6, z + 1.5]);
      const glass = this.mesh(
        new THREE.PlaneGeometry(2.85, 3.5),
        new THREE.MeshBasicMaterial({
          color: 0xd7eada,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        [-8.98, 3.1, z + 1.5],
      );
      glass.rotation.y = Math.PI / 2;
    }
    this.box(0.7, 0.18, 15, 0xb5a18a, [-8.9, 1.05, 0]);
    this.box(7.5, 2.65, 0.13, 0xa17f5b, [0.2, 3, -7.25]);
    this.box(7.25, 2.4, 0.14, 0x365c55, [0.2, 3, -7.15]);
    const board = this.text(
      "光の研究室   /   OPTICS CLUB",
      5.8,
      0.9,
      "#d8dbc2",
    );
    board.position.set(0.2, 3.45, -7.06);
    this.scene.add(board);
    const formula = this.text("1 / f = 1 / u + 1 / v", 4.3, 0.7, "#b6c9b7");
    formula.position.set(0.2, 2.5, -7.05);
    this.scene.add(formula);
    this.box(7.4, 0.12, 0.35, 0xd0bb91, [0.2, 1.68, -7.05]);
    for (let k = 0; k < 3; k++) {
      this.box(
        0.8,
        1.2,
        0.025,
        [0xd2be9e, 0xe9c5b3, 0xbdcfbc][k],
        [5 + k * 1.05, 3.5, -7.05],
        this.scene,
        0,
      );
      const txt = this.text(["光", "色", "影"][k], 0.5, 0.55, "#56695f");
      txt.position.set(5 + k * 1.05, 3.5, -7.0);
      this.scene.add(txt);
    }
    const ceiling = this.box(
      23,
      0.12,
      20,
      0xe8e5d6,
      [0, 6.25, 0],
      this.scene,
      0,
    );
    ceiling.castShadow = false;
    ceiling.receiveShadow = false;
    for (const z of [-4, 0, 4])
      for (const x of [-4, 2]) {
        this.box(0.04, 0.4, 0.04, 0x9ca99e, [x, 5.95, z]);
        const fixture = this.box(2, 0.075, 0.36, 0xe0e4d6, [x, 5.72, z]);
        fixture.material.emissive.set(0xffe9bd);
        fixture.material.emissiveIntensity = 0.25;
      }
    // secondary desks establish a classroom without distracting from the experiment
    for (let x of [-5.6, -1.8, 2, 5.8])
      for (let z of [-4.5, -2.5]) {
        this.box(2, 0.12, 1.1, 0xbf9d71, [x, 0.42, z]);
        for (let dx of [-0.75, 0.75])
          for (let dz of [-0.36, 0.36])
            this.box(0.08, 1.02, 0.08, 0x57736d, [x + dx, -0.15, z + dz]);
        this.box(1.05, 0.1, 0.7, 0xb29873, [x, -0.1, z + 1]);
        this.box(1.05, 0.65, 0.08, 0xb29873, [x, 0.25, z + 1.3]);
      }
    // window landscape: stylized foliage and soft hills
    for (let k = 0; k < 12; k++) {
      const z = -7 + k * 1.4;
      this.cyl(0.09, 0.13, 3, 0x80644d, [-11, 1, z], this.scene, 7);
      for (let j = 0; j < 3; j++)
        this.sphere(
          1.1,
          [0xe3adad, 0xe9c7bc, 0xc0cbb0][j],
          [-11 + (j - 1) * 0.7, 2.6 + j * 0.3, z],
          this.scene,
          6,
        );
    }
    // Main oak workbench
    this.box(10.5, 0.28, 4.8, 0xc69a6d, [0, 0.47, 0.4], this.scene, 0.07);
    this.box(10.1, 0.06, 4.5, 0xd3ac7c, [0, 0.635, 0.4], this.scene, 0.02);
    for (let x of [-4.3, 4.3])
      for (let z of [-1.45, 2.2])
        this.box(0.18, 1.2, 0.18, 0x385152, [x, -0.22, z]);
    // tabletop details
    for (let n = 0; n < 3; n++) {
      const book = this.box(
        0.85,
        0.08,
        1.1,
        [0x809e96, 0xc58d77, 0xe9d8b9][n],
        [3.9, 0.74 + n * 0.1, -1.3],
      );
      book.rotation.y = 0.15 + n * 0.07;
    }
    const pot = this.cyl(
      0.24,
      0.19,
      0.4,
      0xc2896e,
      [-4.45, 0.9, -1.15],
      this.scene,
      10,
    );
    for (let n = 0; n < 7; n++) {
      const leaf = this.sphere(
        0.26,
        0x668e70,
        [
          -4.45 + Math.sin(n) * 0.22,
          1.2 + n * 0.08,
          -1.15 + Math.cos(n) * 0.17,
        ],
        this.scene,
        6,
      );
      leaf.scale.set(0.65, 1.5, 0.35);
      leaf.rotation.z = n;
    }
    this.box(0.15, 2.2, 0.15, 0x304d4c, [-4.2, 1.65, -1.4]);
    this.cyl(0.35, 0.45, 0.08, 0x304d4c, [-4.2, 0.73, -1.4]);
    const arm = this.box(1.3, 0.1, 0.1, 0x304d4c, [-3.7, 2.7, -1.4]);
    arm.rotation.z = -0.28;
    const shade = this.cyl(0.12, 0.43, 0.35, 0x557e75, [-3.1, 2.5, -1.4]);
    const bulb = this.sphere(0.16, 0xffd999, [-3.1, 2.34, -1.4]);
    bulb.material.emissive.set(0xffbd64);
    bulb.material.emissiveIntensity = 2;
  }
  makeStand() {
    this.box(8.15, 0.17, 2.22, C.dark, [0, 0.82, 0], this.scene, 0.08);
    this.box(8, 0.026, 2.08, 0x52716d, [0, 0.918, 0], this.scene, 0.02);
    for (let z of [-0.8, 0.8]) {
      this.box(7.7, 0.06, 0.05, C.gold, [0, 0.97, z]);
      for (let x = -3.7; x < 3.8; x += 0.25)
        this.box(0.013, 0.008, 0.1, 0x9fb3a5, [x, 0.955, z - 0.1]);
    }
    const name = this.text("HIKARI   /   LIGHT LAB", 2, 0.32, "#f0d9ae");
    name.rotation.x = -Math.PI / 2;
    name.position.set(0, 0.96, 0.68);
    this.scene.add(name);
    this.rayGroup = new THREE.Group();
    this.scene.add(this.rayGroup);
    this.rayGroup.layers.set(1);
  }
  makeCamera() {
    this.cam = new THREE.Group();
    this.scene.add(this.cam);
    this.cam.position.set(2.5, 1.65, 0);
    this.shell = [];
    this.shell.push(
      this.box(1.15, 1.1, 1.75, C.cream, [0.12, 0, 0], this.cam, 0.1),
    );
    this.shell.push(
      this.box(0.68, 1.15, 0.5, 0xded7c9, [-0.05, -0.04, 0.75], this.cam, 0.08),
    );
    this.shell.push(
      this.box(0.09, 0.73, 1.28, C.dark, [0.73, 0, -0.13], this.cam, 0.035),
    );
    this.box(0.32, 0.22, 0.65, 0xc8c5ba, [0.15, 0.63, -0.13], this.cam, 0.04);
    this.cyl(0.13, 0.13, 0.07, C.dark, [0.22, 0.66, 0.58], this.cam);
    const shutter = this.cyl(
      0.09,
      0.09,
      0.025,
      0xcb846f,
      [0.22, 0.707, 0.58],
      this.cam,
    );
    shutter.material.emissive.set(0x803b20);
    this.box(0.06, 0.92, 1.6, 0x87958d, [0.56, 0, 0], this.cam, 0.02);
    const branding = this.text("HIKARI", 0.58, 0.18, "#475d59");
    branding.name = "camera-branding";
    branding.rotation.y = -Math.PI / 2;
    branding.position.set(-0.47, 0.33, -0.38);
    this.cam.add(branding);
    const sensorTex = document.createElement("canvas");
    sensorTex.width = 300;
    sensorTex.height = 200;
    this.sensorCanvas = sensorTex;
    this.sensorTexture = new THREE.CanvasTexture(sensorTex);
    this.sensorTexture.colorSpace = THREE.SRGBColorSpace;
    this.sensor = this.mesh(
      new THREE.PlaneGeometry(0.82, 0.55),
      new THREE.MeshBasicMaterial({
        map: this.sensorTexture,
        side: THREE.DoubleSide,
      }),
      [2.55, 1.62, 0],
    );
    this.sensor.rotation.y = -Math.PI / 2;
    // Canvas texture is already inverted once; keep the sensor plane upright.
    this.part(this.sensor, "sensor", "Матрица", [2.6, 1.03, 0.6]);
    this.sensorFrame = this.box(0.06, 0.66, 0.93, 0x2b3942, [2.6, 1.62, 0]);
    // Articulated display shows the corrected, upright camera image beside the sensor.
    this.displayCanvas = document.createElement("canvas");
    this.displayCanvas.width = 300;
    this.displayCanvas.height = 200;
    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    const hinge = new THREE.Group();
    hinge.position.set(0.58, 0, -0.86);
    hinge.rotation.y = -0.35;
    this.cam.add(hinge);
    this.box(0.08, 0.72, 1.08, 0x35494c, [0, 0, -0.55], hinge, 0.025);
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.625),
      new THREE.MeshBasicMaterial({
        map: this.displayTexture,
        side: THREE.DoubleSide,
      }),
    );
    display.rotation.y = Math.PI / 2;
    display.position.set(0.046, 0, -0.55);
    hinge.add(display);
    hinge.userData.part = "screen";
    this.hit.push(hinge);
    this.lens = new THREE.Group();
    this.scene.add(this.lens);
    this.lens.position.set(0, 1.62, 0);
    this.lensElements = [];
    this.barrels = [];
    this.closedBarrels = [];
    const specs = [
      [0.3, 0.54, 0.08],
      [0.49, 0.49, 0.1],
      [0.77, 0.46, 0.08],
      [0.93, 0.45, 0.08],
      [1.17, 0.43, 0.08],
      [1.48, 0.41, 0.1],
      [1.75, 0.42, 0.07],
      [1.96, 0.4, 0.06],
      [2.13, 0.39, 0.08],
    ];
    for (let n = 0; n < specs.length; n++) {
      const [x, r, t] = specs[n];
      const points = [];
      const concave = [1, 4, 7].includes(n);
      for (let side of [-1, 1]) {
        for (let j = 0; j <= 12; j++) {
          const rr = ((side === -1 ? j : 12 - j) / 12) * r;
          const thick = concave
            ? t * (0.24 + 0.76 * (rr / r) ** 2)
            : t * (1 - 0.76 * (rr / r) ** 2);
          points.push(new THREE.Vector2(rr, side * thick));
        }
      }
      const glass = new THREE.Mesh(
        new THREE.LatheGeometry(points, 32),
        new THREE.MeshPhysicalMaterial({
          color: n < 3 ? 0x9cd6d4 : 0xb7c7e4,
          transparent: true,
          opacity: 0.42,
          roughness: 0.12,
          metalness: 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      glass.rotation.z = Math.PI / 2;
      glass.position.x = x;
      glass.userData.base = x;
      glass.userData.index = n;
      this.lens.add(glass);
      this.lensElements.push(glass);
      const edge = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.012, 6, 48),
        new THREE.MeshStandardMaterial({
          color: 0x79b9b3,
          emissive: 0x337f80,
          emissiveIntensity: 0.35,
        }),
      );
      edge.rotation.y = Math.PI / 2;
      edge.position.x = x;
      glass.userData.edge = edge;
      this.lens.add(edge);
    }
    for (let n = 0; n < 3; n++) {
      const b = this.mesh(
        new THREE.CylinderGeometry(
          0.6 - n * 0.045,
          0.6 - n * 0.045,
          0.62,
          48,
          1,
          true,
          Math.PI / 2,
          Math.PI,
        ),
        this.mat(n === 1 ? 0x8fa49c : 0xd4d5c8, {
          side: THREE.DoubleSide,
          metalness: 0.5,
          roughness: 0.4,
        }),
        [0.51 + n * 0.65, 0, 0],
        this.lens,
      );
      b.rotation.z = Math.PI / 2;
      this.barrels.push(b);
      const cover = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.6 - n * 0.045,
          0.6 - n * 0.045,
          0.62,
          48,
          1,
          true,
          -Math.PI / 2,
          Math.PI,
        ),
        b.material.clone(),
      );
      cover.position.copy(b.position);
      cover.rotation.copy(b.rotation);
      cover.castShadow = true;
      this.lens.add(cover);
      this.closedBarrels.push(cover);
    }
    this.mountRings = [];
    for (let x of [0.17, 2.3]) {
      const mount = this.mesh(
        new THREE.TorusGeometry(0.57, 0.035, 8, 48),
        this.mat(C.dark, { metalness: 0.5 }),
        [x, 0, 0],
        this.lens,
      );
      mount.rotation.y = Math.PI / 2;
      this.mountRings.push(mount);
    }
    this.iris = new THREE.Group();
    this.iris.position.set(1.31, 0, 0);
    this.lens.add(this.iris);
    this.irisBlades = [];
    for (let n = 0; n < 7; n++) {
      const blade = this.mesh(
        new THREE.CircleGeometry(0.3, 3),
        this.mat(0x2e424b, {
          metalness: 0.75,
          roughness: 0.3,
          side: THREE.DoubleSide,
        }),
        [0, 0, 0],
        this.iris,
      );
      blade.rotation.y = Math.PI / 2;
      this.irisBlades.push(blade);
    }
    this.part(this.lens, "zoom", "Зум-группа", [0.45, 2.54, 0]);
    this.part(this.iris, "aperture", "Диафрагма", [1.3, 1.08, 0.75]);
    this.part(this.lensElements[7], "focus", "Фокус-группа", [1.96, 2.63, 0]);
    this.part(this.cam, "body", "Камера", [3.6, 2.24, 0.1]);
    // schematic support arms
    for (let x of [0.18, 2.4]) {
      this.cyl(0.06, 0.06, 0.36, 0xbca777, [x, 1.14, 0]);
      this.box(0.45, 0.07, 0.55, 0x738780, [x, 0.99, 0]);
    }
    for (let yy of [-0.49, 0.49])
      for (let zz of [-0.77, 0.77])
        this.box(1.02, 0.035, 0.035, 0xe9e0c9, [0.12, yy, zz], this.cam, 0.01);
    this.cam.traverse((o) => o.layers.set(1));
    this.lens.traverse((o) => o.layers.set(1));
    this.sensor.layers.set(1);
    this.sensorFrame.layers.set(1);
  }
  makeTargets() {
    this.subject = new THREE.Group();
    this.scene.add(this.subject);
    this.subject.position.set(-2.6, 0.98, 0);
    this.cyl(0.5, 0.56, 0.12, 0xdcc69d, [0, 0.02, 0], this.subject, 32);
    this.cat = new THREE.Group();
    this.subject.add(this.cat);
    const body = this.sphere(0.29, 0xf4ead7, [0, 0.42, 0], this.cat);
    body.scale.set(0.9, 1.25, 0.85);
    this.sphere(0.28, 0xf3e9d4, [0, 0.83, 0], this.cat);
    for (let z of [-0.17, 0.17]) {
      const ear = this.mesh(
        new THREE.ConeGeometry(0.14, 0.28, 4),
        this.mat(C.cream),
        [0, 1.08, z],
        this.cat,
      );
      ear.rotation.x = z > 0 ? 0.2 : -0.2;
      this.sphere(0.055, 0x354c4a, [0.262, 0.85, z * 0.73], this.cat, 8);
    }
    this.sphere(0.035, C.coral, [0.282, 0.76, 0], this.cat, 8);
    for (let z of [-0.2, 0.2])
      this.sphere(0.11, C.cream, [0.12, 0.17, z], this.cat);
    const paw = this.sphere(0.095, C.cream, [0.05, 0.65, 0.31], this.cat);
    paw.scale.set(1, 1.8, 1);
    this.paw = paw;
    const collar = this.cyl(0.25, 0.25, 0.06, C.coral, [0, 0.66, 0], this.cat);
    this.sphere(0.055, C.gold, [0.25, 0.63, 0], this.cat);
    this.part(this.subject, "subject", "Объект", [-2.6, 2.36, 0]);
    this.flower = new THREE.Group();
    this.subject.add(this.flower);
    this.flower.visible = false;
    this.flower.rotation.y = Math.PI / 2;
    this.cyl(0.17, 0.13, 0.28, C.coral, [0, 0.23, 0], this.flower, 8);
    this.cyl(0.018, 0.018, 0.65, 0x6f9472, [0, 0.62, 0], this.flower, 6);
    for (let n = 0; n < 8; n++) {
      const petal = this.sphere(
        0.17,
        0xeabb91,
        [
          Math.sin((n * Math.PI) / 4) * 0.19,
          1 + Math.cos((n * Math.PI) / 4) * 0.19,
          0,
        ],
        this.flower,
        6,
      );
      petal.scale.z = 0.25;
    }
    this.sphere(0.12, C.gold, [0, 1, 0.05], this.flower);
    this.chart = new THREE.Group();
    this.subject.add(this.chart);
    this.chart.visible = false;
    const chartCanvas = document.createElement("canvas");
    chartCanvas.width = 512;
    chartCanvas.height = 512;
    const cx = chartCanvas.getContext("2d");
    cx.fillStyle = "#faf5e5";
    cx.fillRect(0, 0, 512, 512);
    cx.fillStyle = "#324f4d";
    cx.font = "bold 60px sans-serif";
    cx.textAlign = "center";
    cx.fillText("HIKARI ↑", 256, 75);
    cx.fillStyle = "#d3976b";
    cx.fillRect(30, 95, 220, 25);
    cx.fillStyle = "#71a99e";
    cx.fillRect(262, 95, 220, 25);
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 6; col++) {
        cx.fillStyle = (row + col) % 2 ? "#eef0d9" : "#365953";
        cx.fillRect(38 + col * 34, 153 + row * 34, 34, 34);
      }
    for (let n = 0; n < 28; n++) {
      cx.fillStyle = n % 2 ? "#fbf4e3" : "#273e3b";
      cx.fillRect(280 + n * 6, 150, 6, 210);
    }
    cx.fillStyle = "#33514b";
    cx.font = "26px sans-serif";
    cx.fillText("A  B  C  1  2  3", 256, 420);
    cx.font = "15px sans-serif";
    cx.fillText("FOCUS · COLOR · ORIENTATION", 256, 463);
    const chartTexture = new THREE.CanvasTexture(chartCanvas);
    chartTexture.colorSpace = THREE.SRGBColorSpace;
    const chartPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshStandardMaterial({
        map: chartTexture,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    chartPlane.position.set(0.008, 0.65, 0);
    chartPlane.rotation.y = Math.PI / 2;
    this.chart.add(chartPlane);
    this.box(0.04, 0.92, 0.92, 0xd2b590, [-0.018, 0.65, 0], this.chart, 0.01);
    this.cyl(0.025, 0.025, 0.3, 0x647f72, [0, 0.2, 0], this.chart, 8);
    this.orb = this.sphere(0.28, 0xb2cdba, [-4, 0.0, 0]);
    this.orb.visible = false;
    // depth markers behind the subject, visible in the camera preview
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      g.position.set(-4 - k * 0.75, 0.7, -0.75 + k * 0.6);
      this.scene.add(g);
      this.cyl(
        0.12,
        0.14,
        0.2,
        [0xc78b73, 0x799d97, 0xc5b19b][k],
        [0, 0.1, 0],
        g,
        8,
      );
      this.sphere(0.27, [0xe7af8e, 0xa5be90, 0xdcbe8e][k], [0, 0.45, 0], g, 7);
    }
  }
  makeAtmosphere() {
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -8.8, 4.8, -1, -8.8, 2, -1, 3, 0.68, 3, 3, 0.68, 3, -8.8, 2, -1, 1,
          0.68, -1,
        ],
        3,
      ),
    );
    beamGeo.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0], 2),
    );
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          opacity: { value: 0.12 },
          color: { value: new THREE.Color(0xffdfac) },
        },
        vertexShader:
          "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "uniform float opacity;uniform vec3 color; varying vec2 vUv;void main(){float edge=pow(max(0.,sin(vUv.x*3.14159265)),2.)*smoothstep(0.,.3,vUv.y)*smoothstep(1.,.75,vUv.y);gl_FragColor=vec4(color,opacity*edge);}",
      }),
    );
    this.beam.material.blending = THREE.AdditiveBlending;
    this.scene.add(this.beam);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gx = glowCanvas.getContext("2d"),
      gg = gx.createRadialGradient(64, 64, 0, 64, 64, 62);
    gg.addColorStop(0, "rgba(255,211,139,.55)");
    gg.addColorStop(0.4, "rgba(255,208,128,.25)");
    gg.addColorStop(1, "rgba(255,193,107,0)");
    gx.fillStyle = gg;
    gx.fillRect(0, 0, 128, 128);
    this.tableGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 3.3),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(glowCanvas),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.25,
      }),
    );
    this.tableGlow.rotation.x = -Math.PI / 2;
    this.tableGlow.position.set(-3.5, 0.673, 1.25);
    this.scene.add(this.tableGlow);

    const pos = [];
    for (let n = 0; n < 100; n++)
      pos.push(
        (Math.sin(n * 127.1) * 0.5 + 0.5) * 15 - 8,
        (Math.sin(n * 37.3) * 0.5 + 0.5) * 4 + 1,
        (Math.cos(n * 73.8) * 0.5 + 0.5) * 8 - 4,
      );
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe5b6,
        size: 0.025,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.scene.add(this.dust);
  }
  rebuildRays(s) {
    while (this.rayGroup.children.length) {
      const o = this.rayGroup.children[0];
      this.rayGroup.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    const fT = (s.focal - 16) / 34,
      subjectX = -2.6 - (s.distance - 1.5) * 0.62,
      apertureR = clamp((s.focal / s.aperture) * 0.05, 0.05, 0.48);
    const planeX = 1.34,
      sensorX = 2.55;
    const focalOffset = (s.focus - s.distance) * 0.22;
    const points = [
      { y: 2.04, col: 0xff936d },
      { y: 1.63, col: 0x57cfc6 },
      { y: 1.23, col: 0xb59cff },
    ];
    this.rayPaths = [];
    const incident = [vec(-3.1, 2.32, -1.4), vec(subjectX, 1.85, 0.05)];
    const iline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(incident),
      new THREE.LineDashedMaterial({
        color: 0xffd68b,
        dashSize: 0.07,
        gapSize: 0.04,
        transparent: true,
        opacity: 0.65,
      }),
    );
    iline.computeLineDistances();
    iline.layers.set(1);
    this.rayGroup.add(iline);
    for (const pt of points) {
      for (let n = -1; n <= 1; n++) {
        const ay = 1.62 + n * apertureR;
        const hitY = 1.62 - (pt.y - 1.62) * (0.48 + fT * 0.32);
        const focusX = sensorX + focalOffset;
        const ySensor =
          ay + ((hitY - ay) * (sensorX - planeX)) / (focusX - planeX);
        const route = [
          vec(subjectX, pt.y, 0),
          vec(0.25, lerp(pt.y, ay, 0.64), 0),
          vec(0.85, lerp(pt.y, ay, 0.85), 0),
          vec(planeX, ay, 0),
          vec(2.0, lerp(ay, ySensor, 0.54), 0),
          vec(sensorX, ySensor, 0),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(route);
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({
            color: pt.col,
            transparent: true,
            opacity: n === 0 ? 0.75 : 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        line.layers.set(1);
        this.rayGroup.add(line);
        if (n === 0) {
          for (let j = 0; j < route.length - 1; j++) {
            const a = route[j],
              b = route[j + 1],
              delta = b.clone().sub(a);
            const tube = new THREE.Mesh(
              new THREE.CylinderGeometry(0.006, 0.006, delta.length(), 5),
              new THREE.MeshBasicMaterial({
                color: pt.col,
                transparent: true,
                opacity: 0.68,
                depthWrite: false,
              }),
            );
            tube.position.copy(a).add(b).multiplyScalar(0.5);
            tube.quaternion.setFromUnitVectors(vec(0, 1, 0), delta.normalize());
            tube.layers.set(1);
            this.rayGroup.add(tube);
          }
        }
        const curve = new THREE.CurvePath();
        for (let segment = 0; segment < route.length - 1; segment++)
          curve.add(new THREE.LineCurve3(route[segment], route[segment + 1]));
        this.rayPaths.push(curve);
      }
    }
    if (!this.photonGroup) {
      this.photonGroup = new THREE.Group();
      this.scene.add(this.photonGroup);
      for (let n = 0; n < 18; n++) {
        const o = this.sphere(
          0.021,
          [0xffce88, 0xa9ffdd, 0xdfc3ff][Math.floor((n % 9) / 3)],
          [0, 0, 0],
          this.photonGroup,
          6,
        );
        o.material.emissive.copy(o.material.color);
        o.material.emissiveIntensity = 2;
        o.layers.set(1);
      }
    }
    this.rayGroup.visible = s.rays;
    this.photonGroup.visible = s.rays;
  }
  update(s) {
    const previous = this.state;
    this.state = s;
    const t = (s.focal - 16) / 34;
    this.shell.forEach((o, n) => {
      o.visible = true;
      o.material.transparent = s.cutaway;
      o.material.opacity = s.cutaway ? (n === 2 ? 0.12 : 0.2) : 1;
      o.material.depthWrite = !s.cutaway;
      o.castShadow = !s.cutaway;
    });
    this.sensorFrame.visible = s.cutaway;
    this.sensor.visible = s.cutaway;
    this.closedBarrels.forEach((o) => (o.visible = !s.cutaway));
    this.barrels.forEach((o) => {
      o.material.transparent = s.cutaway;
      o.material.opacity = s.cutaway ? 0.64 : 1;
    });
    this.lensElements.forEach((o, n) => {
      const zoom = n < 5 ? (n % 2 ? -0.1 : 0.17) * t : 0,
        focus = n > 5 ? (s.focus - 1.5) * 0.045 : 0,
        explode = (n - 4) * s.explode * 0.1;
      o.userData.targetX = o.userData.base + zoom + focus + explode;
      if (!this.initialized) {
        o.position.x = o.userData.targetX;
        o.userData.edge.position.x = o.position.x;
      }
    });
    const hole = clamp((s.focal / s.aperture) * 0.05, 0.05, 0.48);
    this.irisBlades.forEach((o) => (o.visible = false));
    if (!this.irisRing) {
      this.irisRing = new THREE.Mesh(
        new THREE.RingGeometry(hole, 0.52, 7),
        this.mat(0x31444a, {
          metalness: 0.7,
          roughness: 0.38,
          side: THREE.DoubleSide,
        }),
      );
      this.irisRing.rotation.y = Math.PI / 2;
      this.iris.add(this.irisRing);
      this.irisRing.layers.set(1);
    } else if (
      !previous ||
      previous.aperture !== s.aperture ||
      previous.focal !== s.focal
    ) {
      this.irisRing.geometry.dispose();
      this.irisRing.geometry = new THREE.RingGeometry(hole, 0.52, 7);
    }
    this.subject.position.x = -2.6 - (s.distance - 1.5) * 0.62;
    this.labels.find((l) => l.id === "subject").anchor.x =
      this.subject.position.x;
    this.cat.visible = s.object === "cat";
    this.flower.visible = s.object === "flower";
    this.chart.visible = s.object === "chart";
    const setups = {
      sun: [0xfff0cc, 3.4, 2.5, 0xcde3e5, 0.08, 0x9ac1ed],
      golden: [0xffc180, 2.9, 2.0, 0xe7c9b4, 0.16, 0xb3a6e0],
      cloud: [0xd2e4f3, 1.15, 2.25, 0xd4e0e0, 0.025, 0xb7c9dc],
      night: [0x8aa9e6, 0.7, 0.5, 0x263a59, 0.025, 0x8299df],
    };
    const [col, int, amb, bg, beam, fill] = setups[s.weather];
    this.sun.color.set(col);
    this.sun.intensity = int * s.light;
    this.hemi.intensity = amb * s.light;
    this.fill.color.set(fill);
    this.fill.intensity = s.weather === "night" ? 0.65 : 0.8;
    this.scene.background.set(bg);
    this.scene.fog.color.set(bg);
    this.beam.material.uniforms.opacity.value = beam;
    this.beam.material.uniforms.color.value.set(col);
    this.deskLight.intensity = s.weather === "night" ? 22 : 8;
    this.tableGlow.material.opacity = s.weather === "night" ? 0.38 : 0.13;
    this.bloom.strength = s.weather === "night" ? 0.5 : 0.31;
    if (!previous || previous.quality !== s.quality) {
      const ratio =
        s.quality === "low"
          ? Math.min(devicePixelRatio, 0.85)
          : Math.min(devicePixelRatio, 1.5);
      this.renderer.setPixelRatio(ratio);
      this.composer.setPixelRatio(ratio);
      const size = s.quality === "low" ? 768 : 1536;
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.composer.renderTarget1.samples = s.quality === "low" ? 0 : 4;
      this.composer.renderTarget2.samples = s.quality === "low" ? 0 : 4;
      this.resize();
    }
    if (
      !previous ||
      ["focal", "aperture", "focus", "distance", "rays"].some(
        (k) => previous[k] !== s[k],
      )
    )
      this.rebuildRays(s);
    this.renderer.shadowMap.needsUpdate = true;
    this.initialized = true;
  }
  highlightPart(id) {
    this.selectedPart = id;
    if (!this.selectionRing) {
      this.selectionRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.009, 5, 64),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(0xe8bd70).multiplyScalar(1.5),
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      this.selectionRing.rotation.y = Math.PI / 2;
      this.selectionRing.layers.set(1);
      this.scene.add(this.selectionRing);
    }
    this.selectionRing.visible = ["zoom", "focus", "aperture"].includes(id);
    this.lensElements.forEach((o, n) => {
      o.userData.edge.material.emissiveIntensity =
        (id === "zoom" && n < 5) || (id === "focus" && n > 5) ? 1.0 : 0.35;
    });
  }
  setView(view) {
    const views = {
      desk: [
        [7.2, 4.7, 10.6],
        [0, 1.05, 0],
      ],
      cutaway: [
        [1.2, 3, 7],
        [0.9, 1.62, 0],
      ],
      lens: [
        [-2.8, 2.9, 4.5],
        [1.15, 1.62, 0],
      ],
      aperture: [
        [-1.8, 2.3, 2.5],
        [1.31, 1.62, 0],
      ],
      focus: [
        [2.1, 2.2, 3.4],
        [1.9, 1.62, 0],
      ],
      sensor: [
        [1.15, 2.3, 2.35],
        [2.5, 1.62, 0],
      ],
      room: [
        [12, 9, 15],
        [-0.3, 1, 0],
      ],
      top: [
        [0, 10, 0.5],
        [0, 1.1, 0],
      ],
    };
    const v = views[view] || views.desk;
    this.targetView = { pos: vec(...v[0]), target: vec(...v[1]) };
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio =
      this.state?.quality === "low"
        ? Math.min(devicePixelRatio, 0.85)
        : Math.min(devicePixelRatio, 1.5);
    if (this.renderer.getPixelRatio() !== ratio) {
      this.renderer.setPixelRatio(ratio);
      this.composer?.setPixelRatio(ratio);
    }

    this.camera.aspect = w / h;
    this.camera.fov = Math.min(
      72,
      (2 *
        Math.atan(
          Math.tan(THREE.MathUtils.degToRad(40) / 2) *
            Math.max(1, 1.2 / this.camera.aspect),
        ) *
        180) /
        Math.PI,
    );
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }
  updateSensor(canvas) {
    const ctx = this.sensorCanvas.getContext("2d");
    ctx.save();
    ctx.translate(300, 200);
    ctx.rotate(Math.PI);
    ctx.drawImage(canvas, 0, 0, 300, 200);
    ctx.restore();
    this.sensorTexture.needsUpdate = true;
    this.displayCanvas
      .getContext("2d")
      .drawImage(
        canvas,
        0,
        0,
        this.displayCanvas.width,
        this.displayCanvas.height,
      );
    this.displayTexture.needsUpdate = true;
  }
  frame() {
    if (document.hidden || this.contextLost) {
      this.clock.getDelta();
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.fpsFrames++;
    if (performance.now() - this.fpsStart > 1500) {
      this.fps = (this.fpsFrames * 1000) / (performance.now() - this.fpsStart);
      this.fpsFrames = 0;
      this.fpsStart = performance.now();
    }
    const rawDt = Math.min(this.clock.getDelta(), 0.25);
    const dt = Math.min(rawDt, 0.05);
    if (this.state?.animate) this.time += dt;
    if (this.targetView) {
      this.camera.position.lerp(this.targetView.pos, 1 - Math.exp(-rawDt * 8));
      this.controls.target.lerp(
        this.targetView.target,
        1 - Math.exp(-rawDt * 8),
      );
      if (this.camera.position.distanceTo(this.targetView.pos) < 0.015)
        this.targetView = null;
    }
    this.controls.update();
    this.camera.position.fromArray(
      constrainVisitor(
        this.camera.position.toArray(),
        this.controls.target.toArray(),
      ),
    );
    for (const o of this.lensElements) {
      o.position.x = lerp(
        o.position.x,
        o.userData.targetX ?? o.position.x,
        0.18,
      );
      o.userData.edge.position.x = o.position.x;
    }
    if (this.selectionRing?.visible) {
      const x =
        this.selectedPart === "aperture"
          ? 1.31
          : this.lensElements[this.selectedPart === "zoom" ? 2 : 7].position.x;
      this.selectionRing.position.set(x, 1.62, 0);
      this.selectionRing.material.opacity =
        0.65 + Math.sin(this.time * 2) * 0.12;
    }
    if (this.photonGroup && this.rayPaths) {
      this.photonGroup.children.forEach((o, n) => {
        const path = this.rayPaths[n % 9];
        if (path)
          o.position.copy(path.getPoint((this.time * 0.24 + n * 0.17) % 1));
      });
    }
    if (this.state?.animate) {
      this.dust.rotation.y = Math.sin(this.time * 0.07) * 0.02;
      this.paw.rotation.x = Math.sin(this.time * 1.5) * 0.16;
    }
    this.spectatorFocus.enabled = this.state?.quality !== "low";
    this.renderer.info.reset();
    this.composer.render();
    this.onFrame?.(this.time, dt);
    this.raf = requestAnimationFrame(this.frame);
  }
  screenLabels() {
    const r = this.container.getBoundingClientRect();
    return this.labels.map((l) => {
      const p = l.anchor.clone().project(this.camera);
      return {
        ...l,
        x: (p.x * 0.5 + 0.5) * r.width,
        y: (-0.5 * p.y + 0.5) * r.height,
        visible: p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
      };
    });
  }
  screenshot() {
    this.composer.render();
    return this.renderer.domElement.toDataURL("image/png");
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of o.material
        ? Array.isArray(o.material)
          ? o.material
          : [o.material]
        : []) {
        materials.add(m);
        for (const value of Object.values(m))
          if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach((x) => x.dispose());
    materials.forEach((x) => x.dispose());
    textures.forEach((x) => x.dispose());
    this.composer.passes.forEach((p) => p.dispose?.());
    this.composer.dispose();
    this.renderer.dispose();
  }
}
