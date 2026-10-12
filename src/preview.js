import * as THREE from "three";
import { exposure } from "./exposure.js";
import {
  sensorBlur,
  filterTransmission,
  polarizedReflection,
} from "./lens-system.js";
import { optics, circleOfConfusion, fov, clamp } from "./optics.js";
export class SensorPreview {
  constructor(lab, canvas) {
    this.lab = lab;
    this.canvas = canvas;
    canvas.width = 480;
    canvas.height = 320;
    this.ctx = canvas.getContext("2d");
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1.5, 0.01, 30);
    this.scene.add(new THREE.HemisphereLight(0xe5f6ff, 0x886c4f, 2.5));
    this.sun = new THREE.DirectionalLight(0xffd19e, 3);
    this.sun.position.set(-3, 5, 3);
    this.scene.add(this.sun);
    this.target = new THREE.WebGLRenderTarget(480, 320, {
      format: THREE.RGBAFormat,
    });
    this.buffer = new Uint8Array(480 * 320 * 4);
    this.flipped = new Uint8ClampedArray(480 * 320 * 4);
    this.imageData = new ImageData(this.flipped, 480, 320);
    this.temp = document.createElement("canvas");
    this.temp.width = 480;
    this.temp.height = 320;
    this.tctx = this.temp.getContext("2d");
    this.groups = [];
    this.cat = lab.cat.clone(true);
    this.flower = lab.flower.clone(true);
    this.chart = lab.chart.clone(true);
    for (const o of [this.cat, this.flower, this.chart]) {
      o.traverse((m) => {
        if (m.material)
          m.material = Array.isArray(m.material)
            ? m.material.map((x) => x.clone())
            : m.material.clone();
      });
      o.scale.setScalar(0.3);
      o.rotation.y = -Math.PI / 2;
      o.position.y = -0.2;
      this.scene.add(o);
      this.groups.push(o);
    }
    this.flower.rotation.y = 0;
    this.bg = new THREE.Group();
    this.scene.add(this.bg);
    for (let n = 0; n < 8; n++) {
      const x = ((n % 4) - 1.5) * 0.45,
        y = Math.floor(n / 4) * 0.28 - 0.1;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 8, 8),
        new THREE.MeshBasicMaterial({
          color: [0xffd48d, 0xe9baaa, 0xaecbb1][n % 3],
        }),
      );
      m.position.set(x, y, -3);
      this.bg.add(m);
    }
    // A real pedestal and contact shadow anchor the subject in the preview.
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.035, 32),
      new THREE.MeshStandardMaterial({ color: 0xd5b88d, roughness: 0.85 }),
    );
    pedestal.position.y = -0.197;
    this.pedestal = pedestal;
    this.scene.add(pedestal);
    const contactCanvas = document.createElement("canvas");
    contactCanvas.width = 128;
    contactCanvas.height = 128;
    const cc = contactCanvas.getContext("2d"),
      cg = cc.createRadialGradient(64, 64, 3, 64, 64, 60);
    cg.addColorStop(0, "rgba(37,41,31,.36)");
    cg.addColorStop(1, "rgba(37,41,31,0)");
    cc.fillStyle = cg;
    cc.fillRect(0, 0, 128, 128);
    this.contactTexture = new THREE.CanvasTexture(contactCanvas);
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(0.37, 0.37),
      new THREE.MeshBasicMaterial({
        map: this.contactTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.178;
    this.contact = contact;
    this.scene.add(contact);
    this.last = null;
    this.layerCache = {};
  }
  draw(s, time = 0) {
    const o = optics(s),
      ctx = this.ctx;
    const W = 480,
      H = 320;
    const palettes = {
      sun: ["#a9d1d8", "#ede1ba", "#958d6d"],
      golden: ["#d9b6b0", "#f2d5a5", "#ad7b62"],
      cloud: ["#b0c4c8", "#d2d7ca", "#89938a"],
      night: ["#152338", "#324258", "#504a4c"],
    };
    const p = palettes[s.weather];
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, p[0]);
    gradient.addColorStop(0.7, p[1]);
    gradient.addColorStop(1, p[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    // stylized classroom background; defocus responds to the same optical model
    const bgBlur = clamp(
      (circleOfConfusion(s.focal, s.aperture, s.focus, 4) / 23.5) * W,
      0,
      28,
    );
    ctx.filter = `blur(${bgBlur}px)`;
    ctx.fillStyle = s.weather === "night" ? "#567491" : "#f8e9c1";
    for (let k = 0; k < 4; k++) ctx.fillRect(k * 150 - 55, 10, 100, 155);
    ctx.fillStyle = s.weather === "night" ? "#29384b" : "#839a91";
    for (let k = 0; k < 5; k++) ctx.fillRect(k * 150 - 75, 0, 14, 220);
    ctx.fillStyle = p[2];
    ctx.fillRect(0, 220, W, 100);
    ctx.filter = "none";
    this.camera.fov = fov(s.focal, 15.6);
    this.camera.updateProjectionMatrix();
    this.sun.color.set(
      s.weather === "night"
        ? 0xa9c3ff
        : s.weather === "golden"
          ? 0xffcc95
          : 0xffedcf,
    );
    this.sun.intensity = s.weather === "night" ? 1 : 3;
    this.bg.visible = false;
    let blur = 0;
    const subjects = ["cat", "flower", "chart"]
      .map((id) => ({ id, distance: s[id + "Distance"] ?? s.distance }))
      .sort((a, b) => b.distance - a.distance);
    for (const { id, distance } of subjects) {
      const lateral =
        -(
          s[id + "Offset"] ??
          (id === "cat" ? 0 : id === "flower" ? -0.72 : 0.72)
        ) * 0.3;
      const key = [s.focal, distance, s.weather, lateral].join(":");
      let layer = this.layerCache[id];
      if (!layer || layer.key !== key) {
        this.groups.forEach((o) => (o.visible = false));
        this[id].visible = true;
        this[id].position.set(lateral, -0.2, -distance);
        this.pedestal.position.set(this[id].position.x, -0.197, -distance);
        this.contact.position.set(this[id].position.x, -0.178, -distance);
        const renderer = this.lab.renderer,
          oldTarget = renderer.getRenderTarget(),
          oldAlpha = renderer.getClearAlpha(),
          oldColor = renderer.getClearColor(new THREE.Color());
        renderer.setRenderTarget(this.target);
        renderer.setClearColor(0, 0);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        renderer.readRenderTargetPixels(this.target, 0, 0, W, H, this.buffer);
        renderer.setRenderTarget(oldTarget);
        renderer.setClearColor(oldColor, oldAlpha);
        for (let y = 0; y < H; y++)
          this.flipped.set(
            this.buffer.subarray(y * W * 4, (y + 1) * W * 4),
            (H - y - 1) * W * 4,
          );
        if (!layer) {
          const canvas = document.createElement("canvas");
          canvas.width = W;
          canvas.height = H;
          layer = { canvas };
          this.layerCache[id] = layer;
        }
        layer.canvas.getContext("2d").putImageData(this.imageData, 0, 0);
        layer.key = key;
      }
      const coc = this.lab.solution
        ? sensorBlur(this.lab.solution, distance, s.aperture)
        : circleOfConfusion(s.focal, s.aperture, s.focus, distance);
      const objectBlur = clamp((coc / 23.5) * W, 0, 30);
      if (id === s.object) blur = objectBlur;
      ctx.filter = `blur(${objectBlur.toFixed(2)}px)`;
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.filter = "none";
    }
    // Light disks demonstrate background bokeh rather than fake sharp points.
    const zoom = s.focal / 28;
    for (let n = 0; n < 10; n++) {
      const x = W / 2 + Math.sin(n * 12.78) * 0.5 * W * zoom,
        y = 45 + (Math.sin(n * 7.23) * 0.5 + 0.5) * 95;
      const r = clamp(bgBlur * 0.6 + 1.5, 1.5, 22);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = s.weather === "night" ? "#ffcb8577" : "#fff8d453";
      ctx.fill();
    }
    // A glossy foreground pane carries a polarized reflection separately from
    // diffuse/unpolarized scene radiance. A CPL cannot remove all reflections.
    if (s.pane) {
      const reflection =
        s.filter === "cpl" ? polarizedReflection(s.filterAngle ?? 0) : 1;
      ctx.save();
      ctx.globalAlpha = 0.42 * reflection;
      ctx.fillStyle = "#e5f4ff";
      ctx.beginPath();
      ctx.moveTo(45, 35);
      ctx.lineTo(120, 30);
      ctx.lineTo(350, 270);
      ctx.lineTo(255, 280);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.22 * reflection;
      ctx.fillRect(25, 35, 8, H - 65);
      ctx.restore();
    }
    if (s.filter === "soft") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = stateSoft(s) * 0.4;
      ctx.filter = `blur(${6 + stateSoft(s) * 18}px)`;
      ctx.drawImage(this.canvas, 0, 0);
      ctx.restore();
    }
    const lightModel = exposure(s),
      brightness = lightModel.brightness;
    // Display-referred approximation: convert the composite to linear light,
    // scale radiance, then encode back. Avoid white overlays that hide detail.
    const frame = ctx.getImageData(0, 0, W, H),
      pixels = frame.data;
    const curve = new Uint8ClampedArray(256);
    for (let n = 0; n < 256; n++)
      curve[n] = Math.min(
        255,
        255 * ((n / 255) ** 2.2 * brightness) ** (1 / 2.2),
      );
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = curve[pixels[i]];
      pixels[i + 1] = curve[pixels[i + 1]];
      pixels[i + 2] = curve[pixels[i + 2]];
    }
    ctx.putImageData(frame, 0, 0);
    if (s.iso > 800) {
      const strength = clamp(Math.log2(s.iso / 800) / 7, 0, 0.6);
      ctx.globalAlpha = strength;
      for (let n = 0; n < 1200; n++) {
        const x = (Math.sin(n * 77.31) * 0.5 + 0.5) * W,
          y = (Math.cos(n * 41.91) * 0.5 + 0.5) * H;
        ctx.fillStyle = n % 2 ? "#eee7df" : "#1b292d";
        ctx.fillRect(x, y, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.lab.updateSensor(this.canvas);
    this.last = {
      blur,
      bgBlur,
      brightness,
      shutter: lightModel.shutter,
      limited: lightModel.limited,
    };
  }
  dispose() {
    this.target.dispose();
    this.contactTexture.dispose();
    for (const o of [this.pedestal, this.contact]) {
      o.geometry.dispose();
      o.material.dispose();
    }
  }
}

function stateSoft(s) {
  return s.softStrength ?? 0.35;
}
