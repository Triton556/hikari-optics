import * as THREE from "three";
import { prismInspectionView } from "./camera-space.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { inlineBeam, INLINE_X, WAVELENGTHS } from "./inline-optics.js";
export const SPECTRUM_COLORS = [
  0xff6458, 0xffa451, 0xffe57e, 0xb4ed91, 0x82e9de, 0x8baeff, 0xb58afa,
];
export function installInlineExperiment(lab) {
  // Rework has one in-path experiment. Do not rebuild the old off-axis
  // spectrum (dozens of hidden meshes) on every camera setting change.
  for (const child of [...lab.spectrum.children]) {
    child.geometry?.dispose();
    child.material?.dispose();
    lab.spectrum.remove(child);
  }
  lab.spectrum.visible = false;
  lab.updatePrism = function (s) {
    const angle = s.prismAngle ?? Math.PI / 2;
    lab.prismGlass.rotation.y = -angle + Math.PI / 2;
    lab.slabGlass.rotation.y = lab.mirrorGlass.rotation.y = -(
      angle -
      Math.PI / 2
    );
    lab.prismGlass.visible = s.prismShape === "prism";
    lab.slabGlass.visible = s.prismShape === "slab";
    lab.mirrorGlass.visible = s.prismShape === "mirror";
  };
  const rays = new THREE.Group();
  lab.scene.add(rays);
  rays.layers.set(1);
  const supports = new THREE.Group();
  lab.prismBench.add(supports);
  for (const x of [-0.85, 0.85])
    for (const z of [-0.35, 0.35])
      lab.cyl(0.04, 0.045, 0.75, 0x617976, [x, -0.4, z], supports, 12);
  lab.cyl(0.035, 0.035, 0.14, 0x687e78, [0, -0.19, 0], lab.prismSource, 12);
  lab.cyl(0.095, 0.095, 0.025, 0x4a6862, [0, -0.27, 0], lab.prismSource, 16);
  lab.prismSource.geometry.dispose();
  lab.prismSource.geometry = new THREE.CylinderGeometry(
    0.14,
    0.16,
    0.28,
    20,
  ).rotateZ(-Math.PI / 2);
  lab.prismSource.material.color.set(0x4b6b61);
  lab.prismSource.material.metalness = 0.25;
  for (const x of [-0.12, -0.08, -0.04]) {
    const cooling = new THREE.Mesh(
      new THREE.TorusGeometry(0.158, 0.009, 5, 24),
      lab.mat(0x314e4a),
    );
    cooling.rotation.y = Math.PI / 2;
    cooling.position.x = x;
    lab.prismSource.add(cooling);
  }
  const hood = new THREE.Mesh(
    new THREE.TorusGeometry(0.115, 0.021, 8, 32),
    lab.mat(0xb1a181, { metalness: 0.55, roughness: 0.35 }),
  );
  hood.rotation.y = Math.PI / 2;
  hood.position.x = 0.151;
  lab.prismSource.add(hood);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(lab.prismGlass.geometry),
    new THREE.LineBasicMaterial({
      color: 0xb8e8df,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  lab.prismGlass.add(edges);
  lab.prismGlass.material.transmission = 0.9;
  lab.prismGlass.material.ior = 1.62;
  lab.prismGlass.material.thickness = 0.3;
  lab.prismGlass.material.opacity = 0.82;
  lab.prismGlass.material.color.set(0xe0fbff);
  lab.prismGlass.material.needsUpdate = true;
  const update = lab.update.bind(lab);
  lab.update = function (s) {
    update(s);
    const active = s.experiment === "prism";
    rays.visible = active;
    supports.visible = active;
    lab.spectrum.visible = false;
    lab.rayGroup.visible = active ? false : s.rays;
    lab.prismBench.position.set(
      active ? INLINE_X : -2.9,
      active ? 1.32 : 0.74,
      active ? 0 : 1.65,
    );
    if (!active) {
      lab.prismSource.position.set(-0.95, 0.3, 0);
      lab.prismSource.rotation.y = -(s.sourceAngle ?? 0);
      return;
    }
    for (const stage of Object.values(lab.targetStages)) stage.visible = false;
    const a = s.inlineSourceAngle ?? -0.85;
    lab.prismSource.position.set(
      0.1 - 1.05 * Math.cos(a),
      0.3,
      -1.05 * Math.sin(a),
    );
    lab.prismSource.rotation.y = -a;
    const key = [
      s.prismAngle,
      a,
      s.prismShape,
      s.focal,
      s.focus,
      s.aperture,
    ].join(":");
    if (lab.inlineKey === key) return;
    lab.inlineKey = key;
    for (const o of [...rays.children]) {
      o.geometry.dispose();
      o.material.dispose();
      rays.remove(o);
    }
    lab.inlineResults = [];
    for (let n = 0; n < WAVELENGTHS.length; n++) {
      const geometries = [];
      for (const offset of [-0.008, -0.004, 0, 0.004, 0.008]) {
        const beam = inlineBeam(s, lab.solution, WAVELENGTHS[n], offset);
        lab.inlineResults.push({ ...beam, color: SPECTRUM_COLORS[n] });
        // Retain all aperture samples for the detector, but show one narrow
        // spectral centreline per wavelength so additive overlap stays legible.
        if (offset !== 0) continue;
        for (let j = 1; j < beam.points.length; j++) {
          const from = new THREE.Vector3(...beam.points[j - 1]),
            to = new THREE.Vector3(...beam.points[j]);
          if (from.distanceTo(to) < 0.0001) continue;
          const geometry = new THREE.CylinderGeometry(
            0.012,
            0.012,
            from.distanceTo(to),
            6,
            1,
            true,
          );
          const matrix = new THREE.Matrix4().compose(
            from.clone().lerp(to, 0.5),
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              to.sub(from).normalize(),
            ),
            new THREE.Vector3(1, 1, 1),
          );
          geometry.applyMatrix4(matrix);
          geometries.push(geometry);
        }
      }
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(SPECTRUM_COLORS[n]) } },
        vertexShader: `varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalMatrix*normal;v=-p.xyz;gl_Position=projectionMatrix*p;}`,
        fragmentShader: `uniform vec3 color;varying vec3 n,v;void main(){float profile=pow(abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(color*3.5,.28*(.12+.88*profile));}`,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.layers.set(1);
      rays.add(mesh);
    }
  };
  const visit = lab.visit.bind(lab);
  lab.visit = function (id) {
    visit(id);
    if (id === "prism" && lab.state?.experiment === "prism") {
      const view = prismInspectionView(innerWidth);
      lab.targetView = {
        pos: new THREE.Vector3(...view.pos),
        target: new THREE.Vector3(...view.target),
      };
    }
  };
  // Restore subject stage visibility before the normal target update each time.
  const activeUpdate = lab.update.bind(lab);
  lab.update = function (s) {
    for (const stage of Object.values(lab.targetStages)) stage.visible = true;
    activeUpdate(s);
  };
  lab.inlineRays = rays;
}
