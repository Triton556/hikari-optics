import * as THREE from "three";

// A sectional barrel gives the moving optical groups a mechanically legible
// enclosure. The original schematic carriers remain accessible inside it.
export function refineInstrument(lab) {
  // Keep one readable display, and seat both exposure controls on the body.
  const oldDisplay = lab.cam.children.find((o) => o.userData.part === "screen");
  if (oldDisplay) oldDisplay.visible = false;
  const isoDial = lab.direct.find((o) => o.userData.control === "iso");
  isoDial.position.set(2.98, 2.24, -0.43);
  lab.exposureKnob.position.set(2.98, 2.24, 0.25);
  for (const [dial, text] of [
    [isoDial, "ISO"],
    [lab.exposureKnob, "s"],
  ]) {
    const mark = lab.text(text, 0.15, 0.11, "#fff0cf");
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.072;
    dial.add(mark);
  }
  // Visitor stays on the working side of the bench. Free rear-side orbit made
  // controls unreadable and frequently placed room geometry in the foreground.
  lab.controls.minAzimuthAngle = -Math.PI / 3;
  lab.controls.maxAzimuthAngle = Math.PI / 3;
  lab.controls.minPolarAngle = Math.PI * 0.2;
  lab.controls.maxPolarAngle = Math.PI * 0.47;
  const body = new THREE.Group();
  body.name = "Sectioned optical instrument";
  lab.scene.add(body);
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.61, 0.61, 2.35, 64, 1, true, 0, Math.PI),
    lab.mat(0x728e85, {
      metalness: 0.15,
      roughness: 0.65,
      side: THREE.DoubleSide,
    }),
  );
  shell.rotation.z = -Math.PI / 2;
  shell.position.set(1.42, 1.62, 0);
  body.add(shell);
  for (const z of [-0.61, 0.61])
    lab.box(2.35, 0.018, 0.026, 0xb6a487, [1.42, 1.62, z], body, 0.005);
  for (const x of [0.24, 2.59]) {
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.607, 0.023, 8, 64, Math.PI),
      lab.mat(0x9f927c, { metalness: 0.75, roughness: 0.28 }),
    );
    lip.rotation.y = Math.PI / 2;
    lip.rotation.z = Math.PI;
    lip.position.set(x, 1.62, 0);
    body.add(lip);
  }
  // Restrained machined rings, with one colored index per control rather than
  // large candy-colored discs competing with the optical content.
  for (const [control, accent] of [
    [lab.zoomControl, 0x8bd8cf],
    [lab.focusControl, 0xe3b579],
    [lab.apertureControl, 0xc1b1e5],
  ]) {
    control.traverse((o) => {
      if (o.isMesh && o.material?.isMeshStandardMaterial) {
        o.material.color.set(0x39474a);
        o.material.metalness = 0.65;
        o.material.roughness = 0.33;
      }
    });
    lab.box(0.15, 0.028, 0.04, accent, [0, 0.59, 0], control, 0.007);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.57, 0.012, 6, 64),
      lab.mat(accent, { metalness: 0.25, roughness: 0.35 }),
    );
    band.rotation.y = Math.PI / 2;
    control.add(band);
  }
  // Curved profiles distinguish converging and diverging elements visually.
  // The educational solver still treats the surfaces as equivalent thin powers.
  lab.lensElements.forEach((lens, index) => {
    const converging = [0, 2, 4, 6, 8].includes(index),
      profile = [],
      radius = 0.46;
    for (let i = 0; i <= 20; i++) {
      const r = (radius * i) / 20,
        q = (r / radius) ** 2;
      profile.push(
        new THREE.Vector2(r, converging ? 0.11 - 0.08 * q : 0.028 + 0.07 * q),
      );
    }
    for (let i = 20; i >= 0; i--) {
      const r = (radius * i) / 20,
        q = (r / radius) ** 2;
      profile.push(
        new THREE.Vector2(
          r,
          -(converging ? 0.11 - 0.08 * q : 0.028 + 0.07 * q),
        ),
      );
    }
    lens.geometry.dispose();
    lens.geometry = new THREE.LatheGeometry(profile, 48);
    lens.material.color.set(0xc0e5e0);
    lens.material.metalness = 0.03;
    lens.material.roughness = 0.08;
    // Exhibition glass: retain a quiet clear face and readable curved edges.
    // This affects the spectator material only; the paraxial solver and sensor
    // throughput never sample this artistic opacity.
    lens.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `float exhibitionEdge = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
         diffuseColor.a = clamp(opacity * (0.24 + 2.4 * exhibitionEdge), 0.0, 0.72);
         #include <opaque_fragment>`,
      );
    };
    lens.material.customProgramCacheKey = () => "hikari-exhibition-glass-v1";
    lens.material.needsUpdate = true;
    lens.userData.edge.material.emissiveIntensity = 0.14;
  });
  // Two guide rods and indexed sliding carriers make group translation visible.
  for (const z of [-0.43, 0.43]) {
    const rod = lab.cyl(0.018, 0.018, 2.25, 0xa9b9ad, [1.42, 1.2, z], body, 12);
    rod.rotation.z = Math.PI / 2;
  }
  const carriers = [0, 3, 6].map((index, groupIndex) => {
    const carrier = new THREE.Group();
    body.add(carrier);
    lab.box(0.075, 0.07, 0.92, 0x536a62, [0, 1.2, 0], carrier, 0.008);
    for (const z of [-0.43, 0.43])
      lab.box(0.07, 0.15, 0.055, 0xb49f75, [0, 1.27, z], carrier, 0.008);
    const mark = lab.text(["I", "II", "III"][groupIndex], 0.1, 0.09, "#f4e1b2");
    mark.position.set(0, 1.3, 0.48);
    carrier.add(mark);
    return { carrier, index };
  });
  const animate = lab.onFrame;
  lab.onFrame = function (t, dt) {
    animate?.(t, dt);
    for (const { carrier, index } of carriers)
      carrier.position.x = lab.lensElements[index].position.x;
  };
  // A simplified sensor board, flex ribbon and shutter rails replace the empty
  // cutaway cabinet. These are illustrative, not a manufacturer's CAD model.
  const electronics = new THREE.Group();
  lab.cutBody.add(electronics);
  lab.box(0.025, 0.74, 1.32, 0x31574c, [0.48, 0, 0], electronics, 0.018);
  for (const [y, z, w, h] of [
    [0.18, -0.35, 0.24, 0.2],
    [-0.16, 0.4, 0.3, 0.18],
    [0.17, 0.36, 0.18, 0.16],
  ]) {
    lab.box(0.035, h, w, 0x233536, [0.455, y, z], electronics, 0.01);
    for (let k = -2; k <= 2; k++)
      lab.box(
        0.006,
        0.012,
        w + 0.05,
        0xc7b778,
        [0.432, y + k * 0.026, z],
        electronics,
        0.002,
      );
  }
  for (const z of [-0.62, 0.62])
    for (const y of [-0.31, 0.31]) {
      const screw = lab.cyl(
        0.021,
        0.021,
        0.018,
        0xb6bdb0,
        [0.451, y, z],
        electronics,
        12,
      );
      screw.rotation.z = Math.PI / 2;
    }
  lab.box(0.42, 0.018, 0.15, 0xb99049, [0.26, -0.35, 0.24], electronics, 0.008);
  lab.box(0.018, 0.12, 0.15, 0xb99049, [0.09, -0.32, 0.24], electronics, 0.008);
  electronics.traverse((o) => o.layers.set(1));
  body.traverse((o) => o.layers.set(1));
  lab.sectionedBarrel = body;
  lab.control(body, "lens");
  lab.control(lab.cam, "body");
  lab.control(lab.sensor, "sensor");
  function inspectionVisibility() {
    const sensor = lab.station === "sensor";
    // The new sectional housing owns the cutaway silhouette. Hide the older
    // translucent half-shells so they do not veil the glass and beam interior.
    lab.barrels.forEach((part) => (part.visible = !lab.state?.cutaway));
    const branding = lab.cam.getObjectByName("camera-branding");
    if (branding) branding.visible = !lab.state?.cutaway;
    body.visible =
      !!lab.state?.cutaway && !sensor && lab.station !== "aperture";
    lab.focusControl.visible = !sensor;
    lab.zoomControl.visible = !sensor && lab.station !== "aperture";
    lab.mountRings[0].visible = !sensor && lab.station !== "aperture";
    for (const [i, lens] of lab.lensElements.entries()) {
      lens.material.opacity = sensor
        ? 0.025
        : lab.station === "aperture" && i < 6
          ? 0.025
          : 0.24;
      lens.userData.edge.visible =
        !sensor && !(lab.station === "aperture" && i < 6);
    }
  }
  const visit = lab.visit.bind(lab);
  lab.visit = function (id) {
    visit(id);
    inspectionVisibility();
  };
  const previous = lab.update.bind(lab);
  lab.update = function (s) {
    previous(s);
    inspectionVisibility();
  };
}
