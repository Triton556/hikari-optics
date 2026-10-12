import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

// Fresnel reflectance for an air/glass interface. Angle-dependent polarization,
// not a global "erase glare" overlay. The final lens throughput is applied by
// the sensor pass; this ratio changes only the reflected component.
export function glassReflection(cosIncident, angleDegrees, polarized = false) {
  const ci = THREE.MathUtils.clamp(Math.abs(cosIncident), 0.001, 1),
    n = 1.5;
  const ct = Math.sqrt(1 - (1 - ci * ci) / (n * n));
  const rs = ((ci - n * ct) / (ci + n * ct)) ** 2;
  const rp = ((n * ci - ct) / (n * ci + ct)) ** 2;
  if (!polarized) return (rs + rp) / 2;
  const a = (angleDegrees * Math.PI) / 180;
  return rs * Math.cos(a) ** 2 + rp * Math.sin(a) ** 2;
}

export function installFilterExperiments(lab) {
  // Upright, readable labels: the tray itself is the experiment selector.
  for (const [index, title, subtitle] of [
    [0, "СНЯТЬ", "без фильтра"],
    [1, "ND", "движение"],
    [2, "CPL", "блики стекла"],
    [3, "MIST", "свечение ламп"],
  ]) {
    const slot = lab.filterTray.children[index + 1];
    const oldLabel = slot.children.find((o) => o.isMesh && o.material?.map);
    if (oldLabel) {
      oldLabel.visible = false;
    }
    const card = new THREE.Group();
    card.position.set(0, 0.19, -0.24);
    card.rotation.x = -0.18;
    slot.add(card);
    lab.box(0.59, 0.34, 0.018, 0x294743, [0, 0, 0], card, 0.016);
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f7e6bd";
    ctx.font = "600 78px sans-serif";
    ctx.fillText(title, 200, 86);
    ctx.fillStyle = "#bfd5c8";
    ctx.font = "38px sans-serif";
    ctx.fillText(subtitle, 200, 174);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.32),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    );
    face.position.z = 0.011;
    card.add(face);
  }
  const old = lab.glarePane;
  old.parent.remove(old);
  old.geometry.dispose();
  old.material.dispose();
  const shader = {
    ...Reflector.ReflectorShader,
    uniforms: {
      ...Reflector.ReflectorShader.uniforms,
      reflectionWeight: { value: 0.05 },
    },
    fragmentShader: `uniform sampler2D tDiffuse; uniform float reflectionWeight; varying vec4 vUv;
      void main(){ vec3 reflected=texture2DProj(tDiffuse,vUv).rgb;
        gl_FragColor=vec4(reflected,reflectionWeight);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const pane = new Reflector(new THREE.PlaneGeometry(1.35, 1.4), {
    textureWidth: 256,
    textureHeight: 256,
    multisample: 0,
    clipBias: 0.002,
    shader,
  });
  pane.position.set(-1.65, 1.66, 0);
  pane.rotation.y = (3 * Math.PI) / 4;
  pane.material.transparent = true;
  pane.material.depthWrite = false;
  const reflect = pane.onBeforeRender;
  const normal = new THREE.Vector3(),
    view = new THREE.Vector3(),
    world = new THREE.Vector3();
  pane.onBeforeRender = function (renderer, scene, camera) {
    this.getWorldPosition(world);
    normal.set(0, 0, 1).transformDirection(this.matrixWorld);
    view.copy(camera.position).sub(world).normalize();
    const state = lab.state ?? {};
    this.material.uniforms.reflectionWeight.value = glassReflection(
      normal.dot(view),
      state.filterAngle ?? 0,
      camera.userData.sensor && state.filter === "cpl" && !state.filterBypass,
    );
    reflect.call(this, renderer, scene, camera);
  };
  lab.glarePane = pane;
  lab.scene.add(pane);
  lab.control(pane, "glass-angle", true);
  // Reflector is one-sided, but the framed glass can be grabbed from either side.
  const glassHit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.4),
    new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      colorWrite: false,
      depthWrite: false,
    }),
  );
  glassHit.layers.set(1);
  pane.add(glassHit);
  const frame = new THREE.Group();
  pane.add(frame);
  for (const x of [-0.69, 0.69])
    lab.box(0.025, 1.46, 0.035, 0x526b68, [x, 0, 0], frame, 0.005);
  for (const y of [-0.72, 0.72])
    lab.box(1.4, 0.025, 0.035, 0x526b68, [0, y, 0], frame, 0.005);
  const source = new THREE.Group();
  source.position.set(-1.65, 1.9, -3.0);
  lab.scene.add(source);
  lab.box(1.6, 1.7, 0.1, 0x405653, [0, 0, 0], source, 0.035);
  const emissive = new THREE.Mesh(
    new THREE.PlaneGeometry(1.48, 1.58),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.89, 0.68).multiplyScalar(1.6),
      side: THREE.DoubleSide,
    }),
  );
  emissive.position.z = 0.055;
  source.add(emissive);
  for (const x of [-0.25, 0.25])
    lab.box(0.035, 1.58, 0.018, 0x41544d, [x, 0, 0.07], source, 0.003);
  lab.box(1.48, 0.035, 0.018, 0x41544d, [0, 0, 0.07], source, 0.003);
  const label = lab.text(
    "CPL · УВИДЕТЬ СКВОЗЬ БЛИК",
    1.75,
    0.22,
    "#fff1d5",
    "#304c49",
  );
  label.position.set(-1.65, 0.91, 1);
  lab.scene.add(label);
  // The lightbox is an actual scene object and appears in the pane reflection.
  // Its grid makes angular suppression easier to distinguish from exposure.
  lab.plaque("СРАВНИТЬ", [2.95, 0.75, 1.7], "bypass", 0.9);
  const locked = lab.text("ВЫДЕРЖКА FIX", 0.82, 0.24, "#f5d59c");
  locked.position.copy(lab.autoModeText.position);
  locked.rotation.copy(lab.autoModeText.rotation);
  lab.autoPlaque.add(locked);
  locked.visible = false;
  const ab = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 24),
    lab.mat(0xd8be8b),
  );
  ab.position.set(-0.43, -0.35, 0.08);
  lab.monitor.add(ab);
  lab.control(ab, "bypass");
  const abText = lab.text("A/B", 0.085, 0.045, "#1e3336");
  abText.position.set(0, 0, 0.003);
  ab.add(abText);
  const monitorKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.035, 24),
    lab.mat(0x8daaa0, { metalness: 0.4 }),
  );
  monitorKnob.rotation.x = Math.PI / 2;
  monitorKnob.position.set(0.43, -0.35, 0.08);
  lab.monitor.add(monitorKnob);
  lab.control(monitorKnob, "filter", true);
  const prior = lab.update.bind(lab);
  lab.update = function (state) {
    prior(state);
    lab.bloom.threshold = state.weather === "night" ? 1.08 : 1.8;
    pane.rotation.y = state.paneAngle ?? (3 * Math.PI) / 4;
    lab.filterMount.position.z = state.filterBypass ? 1.2 : 0;
    if (state.filter === "soft") lab.filterMount.rotation.x = 0;
    locked.visible = !!state.filterBypass;
    if (state.filterBypass) {
      lab.autoModeText.visible = false;
      lab.autoPlaque.children[1].visible = false;
    }
    source.visible = !!state.pane;
    label.visible = !!state.pane;
  };
  source.visible = false;
  label.visible = false;
  lab.filterExperience = { pane, source, label };
}

export function addMotionAndHighlightScenes(lab) {
  const motion = new THREE.Group();
  motion.position.set(-2.55, 1.6, 0);
  lab.scene.add(motion);
  const rotor = new THREE.Group();
  motion.add(rotor);
  const colors = [0xf19d7f, 0xf4ddb1, 0x86bdb4, 0xdfb590];
  for (let i = 0; i < 8; i++) {
    const blade = new THREE.Group();
    blade.rotation.x = (i * Math.PI) / 4;
    rotor.add(blade);
    lab.box(0.045, 0.38, 0.15, colors[i % 4], [0, 0.31, 0], blade, 0.035);
  }
  const hub = lab.cyl(0.1, 0.1, 0.1, 0xb3a17f, [0.04, 0, 0], motion, 24);
  hub.rotation.z = Math.PI / 2;
  lab.box(0.065, 0.62, 0.065, 0x6c8077, [-0.06, -0.35, 0], motion, 0.012);
  lab.box(0.35, 0.07, 0.4, 0x526b61, [-0.06, -0.67, 0], motion, 0.025);
  const highlights = new THREE.Group();
  highlights.position.set(-3.65, 2.35, 0);
  lab.scene.add(highlights);
  for (let i = 0; i < 7; i++) {
    const z = (i - 3) * 0.23,
      y = 0.12 + Math.cos(i * 0.8) * 0.17;
    lab.box(0.025, 0.4, 0.015, 0x718d79, [0, y + 0.2, z], highlights, 0.004);
    const bulb = lab.sphere(0.045, 0xffdba3, [0, y, z], highlights, 12);
    bulb.material.dispose();
    bulb.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.53, 0.16).multiplyScalar(7),
    });
  }
  const before = lab.onFrame;
  lab.onFrame = function (t, dt) {
    before?.(t, dt);
    rotor.rotation.x = t * 8;
  };
  const update = lab.update.bind(lab);
  lab.update = function (s) {
    update(s);
    motion.visible = s.experiment === "motion";
    highlights.visible = s.experiment === "diffusion";
    if (motion.visible) lab.cat.visible = false;
  };
  lab.motionExperience = { motion, rotor };
  lab.highlightExperience = highlights;
  motion.visible = highlights.visible = false;
}
