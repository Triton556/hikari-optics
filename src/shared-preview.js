import * as THREE from "three";
import { installInlineExperiment } from "./inline-experiment.js";
import { refineInstrument } from "./instrument-design.js";
import {
  installFilterExperiments,
  addMotionAndHighlightScenes,
} from "./filter-experiments.js";
import { fov } from "./optics.js";
import { filterTransmission } from "./lens-system.js";

// Experimental shared-world sensor. It photographs the actual classroom rather
// than rebuilding subjects and illumination in a second scene.
export class SharedSensorPreview {
  constructor(lab, canvas) {
    this.lab = lab;
    lab.displayCanvas.width = 480;
    lab.displayCanvas.height = 320;
    const previousDisplay = lab.displayTexture;
    lab.displayTexture = new THREE.CanvasTexture(lab.displayCanvas);
    lab.displayTexture.colorSpace = THREE.SRGBColorSpace;
    lab.scene.traverse((o) => {
      for (const material of Array.isArray(o.material)
        ? o.material
        : [o.material]) {
        if (material?.map === previousDisplay) {
          material.map = lab.displayTexture;
          material.needsUpdate = true;
        }
      }
    });
    previousDisplay.dispose();
    installFilterExperiments(lab);
    refineInstrument(lab);
    addMotionAndHighlightScenes(lab);
    installInlineExperiment(lab);
    this.canvas = canvas;
    this.width = canvas.width = 480;
    this.height = canvas.height = 320;
    this.ctx = canvas.getContext("2d");
    this.camera = new THREE.PerspectiveCamera(35, 1.5, 0.05, 40);
    this.camera.userData.sensor = true;
    this.camera.position.set(0.08, 1.62, 0);
    this.camera.lookAt(-4, 1.62, 0);
    this.target = new THREE.WebGLRenderTarget(480, 320, {
      type: THREE.HalfFloatType,
    });
    this.target.depthTexture = new THREE.DepthTexture(480, 320);
    this.output = new THREE.WebGLRenderTarget(480, 320);
    this.meter = new THREE.WebGLRenderTarget(16, 16);
    this.meterPixels = new Uint8Array(16 * 16 * 4);
    this.pixels = new Uint8Array(480 * 320 * 4);
    this.flipped = new Uint8ClampedArray(this.pixels.length);
    this.image = new ImageData(this.flipped, 480, 320);
    this.pass = new THREE.Scene();
    this.passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        image: { value: this.target.texture },
        glow: { value: null },
        depth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1 / 480, 1 / 320) },
        focal: { value: 28 },
        aperture: { value: 5.6 },
        focus: { value: 1.5 },
        gain: { value: 1 },
        softness: { value: 0 },
        metering: { value: false },
      },
      vertexShader: `varying vec2 uvScreen; void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `
        uniform sampler2D image,depth,glow; uniform vec2 texel;
        uniform float focal,aperture,focus,gain,softness; uniform bool metering;
        varying vec2 uvScreen;
        float distanceAt(vec2 uv){
          float z=texture2D(depth,uv).x*2.-1.;
          float world=(2.*.05*40.)/(40.+.05-z*(40.-.05));
          // Match the explicit compressed tabletop distance scale used by stages.
          return max(.12,1.5+(world-2.68)/.62);
        }
        float coc(vec2 uv){
          float u=distanceAt(uv)*1000.; float focusMm=focus*1000.;
          return min(18.,abs(focal*focal*(u-focusMm)/(aperture*u*(focusMm-focal)))*480./23.5);
        }
        void main(){
          vec3 color=texture2D(image,uvScreen).rgb;
          if(metering){gl_FragColor=vec4(clamp(color*.15,0.,1.),1.);return;}
          float radius=coc(uvScreen); vec3 sum=color; float weight=1.; 
          for(int i=0;i<24;i++){
            float a=float(i)*2.39996323; float r=sqrt((float(i)+.5)/24.);
            vec2 offset=vec2(cos(a),sin(a))*r;
            vec2 uv=clamp(uvScreen+offset*texel*radius,vec2(0.),vec2(1.));
            // Reject foreground bleed across large depth discontinuities.
            float w=abs(distanceAt(uv)-distanceAt(uvScreen))<1.5?1.:.15;
            sum+=texture2D(image,uv).rgb*w;weight+=w;

          }
          color=sum/weight;
          // Redistribute a fraction of highlight radiance into a normalized
          // broad lobe, rather than creating extra light with an additive halo.
          vec3 scattered=max(color-vec3(.8),vec3(0.))*softness*.8;
          color=color-scattered+texture2D(glow,uvScreen).rgb*softness*.8;
          // Render targets remain linear in Three; apply the display transform
          // explicitly before reading pixels into the sRGB canvas.
          color=max(vec3(0.),color*gain);
          color=clamp((color*(2.51*color+.03))/(color*(2.43*color+.59)+.14),0.,1.);
          color=mix(color*12.92,1.055*pow(color,vec3(1./2.4))-.055,step(vec3(.0031308),color));
          gl_FragColor=vec4(color,1.);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.pass.add(this.quad);
    this.accumulation = new THREE.WebGLRenderTarget(480, 320, {
      type: THREE.HalfFloatType,
    });
    this.accumulateMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      uniforms: {
        image: { value: this.target.texture },
        weight: { value: 1 / 6 },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:
        "uniform sampler2D image;uniform float weight;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(image,vUv).rgb*weight,1.);}",
    });
    const frame = lab.onFrame;
    let previousCapture = 0;
    lab.onFrame = (time, dt) => {
      frame?.(time, dt);
      if (lab.state?.experiment === "motion" && time - previousCapture > 0.35) {
        previousCapture = time;
        lab.renderer.shadowMap.needsUpdate = true;
        this.draw(lab.state);
      }
    };
    this.glowX = new THREE.WebGLRenderTarget(240, 160, {
      type: THREE.HalfFloatType,
    });
    this.glowY = new THREE.WebGLRenderTarget(240, 160, {
      type: THREE.HalfFloatType,
    });
    this.blurMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        image: { value: this.target.texture },
        direction: { value: new THREE.Vector2(1 / 240, 0) },
        threshold: { value: 1 },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: `uniform sampler2D image;uniform vec2 direction;uniform float threshold;varying vec2 vUv;
        vec3 sampleAt(vec2 p){return max(texture2D(image,clamp(p,vec2(0.),vec2(1.))).rgb-vec3(threshold*.8),vec3(0.));}
        void main(){vec3 c=vec3(0.);float total=0.;
          for(int i=-8;i<=8;i++){float w=exp(-float(i*i)/32.);c+=sampleAt(vUv+direction*float(i))*w;total+=w;}
          gl_FragColor=vec4(c/total,1.);}`,
    });
    this.material.uniforms.glow.value = this.glowY.texture;
    this.last = null;
  }
  draw(s) {
    if (s.experiment === "prism") {
      this.drawDetector(s);
      return;
    }
    const r = this.lab.renderer,
      u = this.material.uniforms;
    const prior = {
      target: r.getRenderTarget(),
      tone: r.toneMapping,
      exposure: r.toneMappingExposure,
    };
    this.camera.fov = fov(s.focal, 15.6);
    this.camera.updateProjectionMatrix();
    // Capture linear scene radiance, retaining exactly the same objects/lights.
    try {
      r.toneMapping = THREE.NoToneMapping;
      r.setRenderTarget(this.target);
      r.clear();
      r.render(this.lab.scene, this.camera);
      u.image.value = this.target.texture;
      u.metering.value = true;
      r.setRenderTarget(this.meter);
      r.render(this.pass, this.passCamera);
      r.readRenderTargetPixels(this.meter, 0, 0, 16, 16, this.meterPixels);
      let mean = 0;
      for (let i = 0; i < this.meterPixels.length; i += 4)
        mean +=
          (0.2126 * this.meterPixels[i] +
            0.7152 * this.meterPixels[i + 1] +
            0.0722 * this.meterPixels[i + 2]) /
          255 /
          0.15;
      mean /= 256;
      const transmission = filterTransmission(
        s.filterBypass ? "none" : s.filter,
        s.ndStops,
      );
      const setting = (s.iso / 400) * (5.6 / s.aperture) ** 2 * transmission;
      const ideal = ((1 / 125) * 0.32) / Math.max(0.0001, mean * setting);
      const shutter =
        s.filterBypass && s.compareShutter
          ? s.compareShutter
          : s.exposureAuto
            ? THREE.MathUtils.clamp(ideal, 1 / 2000, 1 / 4)
            : s.shutter;
      const gain = setting * shutter * 125;
      u.image.value = this.target.texture;
      if (s.experiment === "motion" && shutter > 1 / 100) {
        const rotor = this.lab.motionExperience.rotor,
          angle = rotor.rotation.x;
        const oldColor = r.getClearColor(new THREE.Color()),
          oldAlpha = r.getClearAlpha();
        const autoClear = r.autoClear;
        try {
          r.setClearColor(0, 0);
          r.setRenderTarget(this.accumulation);
          r.clear();
          for (let i = 0; i < 6; i++) {
            rotor.rotation.x = angle - (8 * shutter * (i + 0.5)) / 6;
            r.autoClear = true;
            r.setRenderTarget(this.target);
            r.render(this.lab.scene, this.camera);
            r.setRenderTarget(this.accumulation);
            r.autoClear = false;
            this.quad.material = this.accumulateMaterial;
            r.render(this.pass, this.passCamera);
          }
          u.image.value = this.accumulation.texture;
        } finally {
          rotor.rotation.x = angle;
          r.autoClear = autoClear;
          r.setClearColor(oldColor, oldAlpha);
          this.quad.material = this.material;
        }
      }
      const soft = s.filter === "soft" && !s.filterBypass ? s.softStrength : 0;
      if (soft > 0) {
        this.quad.material = this.blurMaterial;
        this.blurMaterial.uniforms.image.value = u.image.value;
        this.blurMaterial.uniforms.direction.value.set(1 / 240, 0);
        this.blurMaterial.uniforms.threshold.value = 1;
        r.setRenderTarget(this.glowX);
        r.render(this.pass, this.passCamera);
        this.blurMaterial.uniforms.image.value = this.glowX.texture;
        this.blurMaterial.uniforms.direction.value.set(0, 1 / 160);
        this.blurMaterial.uniforms.threshold.value = 0;
        r.setRenderTarget(this.glowY);
        r.render(this.pass, this.passCamera);
        this.quad.material = this.material;
      }
      u.metering.value = false;
      u.gain.value = gain;
      u.focal.value = s.focal;
      u.aperture.value = s.aperture;
      u.focus.value = s.focus;
      u.softness.value =
        s.filter === "soft" && !s.filterBypass ? s.softStrength : 0;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1;
      r.setRenderTarget(this.output);
      r.render(this.pass, this.passCamera);
      r.readRenderTargetPixels(this.output, 0, 0, 480, 320, this.pixels);
      for (let y = 0; y < 320; y++)
        this.flipped.set(
          this.pixels.subarray(y * 1920, (y + 1) * 1920),
          (319 - y) * 1920,
        );
      this.ctx.putImageData(this.image, 0, 0);
      this.lab.updateSensor(this.canvas);
      const display = this.lab.displayCanvas.getContext("2d");
      display.fillStyle = "rgba(5,18,22,.72)";
      display.fillRect(0, 299, 480, 21);
      display.fillStyle = "#e4f0e7";
      display.font = "11px monospace";
      display.fillText(
        `${s.filterBypass ? "BYPASS / FIX" : s.exposureAuto ? "A" : "M"}  f/${s.aperture.toFixed(1)}  1/${Math.round(1 / shutter)}s  ISO ${Math.round(s.iso)}  ${s.filterBypass ? "NO FILTER" : s.filter === "soft" ? "MIST" : s.filter.toUpperCase()}`,
        10,
        313,
      );
      this.last = {
        brightness: gain,
        shutter,
        limited: ideal < 1 / 2000 || ideal > 1 / 4,
        worldRadiance: mean,
        blur: 0,
        bgBlur: 0,
      };
    } finally {
      u.metering.value = false;
      this.quad.material = this.material;
      r.toneMapping = prior.tone;
      r.toneMappingExposure = prior.exposure;
      r.setRenderTarget(prior.target);
    }
  }
  drawDetector(s) {
    const ctx = this.ctx;
    ctx.fillStyle = "#071419";
    ctx.fillRect(0, 0, 480, 320);
    ctx.strokeStyle = "#23383d";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 480; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 320);
      ctx.stroke();
    }
    for (let y = 0; y <= 320; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(480, y);
      ctx.stroke();
    }
    let hits = 0;
    const transmission = filterTransmission(
      s.filterBypass ? "none" : s.filter,
      s.ndStops,
    );
    ctx.globalCompositeOperation = "screen";
    for (const ray of this.lab.inlineResults ?? []) {
      if (ray.status !== "sensor") continue;
      hits++;
      const x = 240 - (ray.sensorX / 23.5) * 480;
      const color = new THREE.Color(ray.color).getStyle();
      const glow = ctx.createRadialGradient(x, 160, 0, x, 160, 13);
      glow.addColorStop(0, color);
      glow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.15 * transmission;
      ctx.fillStyle = glow;
      ctx.fillRect(x - 13, 147, 26, 26);
      ctx.globalAlpha = 0.35 * transmission;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, 160, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#abc5c8";
    ctx.font = "12px sans-serif";
    ctx.fillText("ЛУЧЕВОЙ ОПЫТ · ИЗОЛИРОВАННЫЙ ИСТОЧНИК", 16, 24);
    ctx.fillText(
      hits
        ? "Свет дошёл до матрицы"
        : "Луч не дошёл: проверь направление и диафрагму",
      16,
      298,
    );
    this.lab.updateSensor(this.canvas);
    this.last = {
      hits,
      shutter: s.shutter,
      brightness: transmission,
      blur: 0,
      bgBlur: 0,
    };
  }
  dispose() {
    this.glowX.dispose();
    this.glowY.dispose();
    this.blurMaterial.dispose();
    this.accumulation.dispose();
    this.accumulateMaterial.dispose();
    this.target.dispose();
    this.output.dispose();
    this.meter.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
