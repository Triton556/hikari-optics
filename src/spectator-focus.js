import { DepthTexture, UnsignedIntType, Vector2 } from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Presentation-only background separation. It never touches the independent
// sensor camera, optical ray solver, exposure meter or filter comparison.
export function createSpectatorFocus(lab) {
  for (const target of [lab.composer.renderTarget1, lab.composer.renderTarget2])
    target.depthTexture = new DepthTexture(target.width, target.height, UnsignedIntType);
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null },
      texel: { value: new Vector2(1,1) },
      near: { value: lab.camera.near }, far: { value: lab.camera.far },
      focus: { value: 4 },
    },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `
      uniform sampler2D tDiffuse,tDepth;
      uniform vec2 texel;
      uniform float near,far,focus;
      varying vec2 vUv;
      float distanceAt(vec2 uv){
        float z=texture2D(tDepth,uv).r*2.-1.;
        return 2.*near*far/(far+near-z*(far-near));
      }
      void main(){
        vec4 base=texture2D(tDiffuse,vUv);
        float distance=distanceAt(vUv);
        float radius=smoothstep(focus+.9,focus+5.5,distance)*6.;
        if(radius<.15){gl_FragColor=base;return;}
        vec3 sum=base.rgb;float weight=1.;
        for(int i=0;i<48;i++){
          float angle=float(i)*2.39996323;
          vec2 offset=vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/48.);
          vec2 sampleUV=clamp(vUv+offset*texel*radius,vec2(0.),vec2(1.));
          float sampleDistance=distanceAt(sampleUV);
          float w=smoothstep(focus+.8,focus+1.6,sampleDistance)*exp(-dot(offset,offset)*1.5);
          sum+=texture2D(tDiffuse,sampleUV).rgb*w;weight+=w;
        }
        gl_FragColor=vec4(sum/weight,base.a);
      }`,
  });
  const render = pass.render.bind(pass);
  pass.render = (renderer, writeBuffer, readBuffer, dt, mask) => {
    pass.uniforms.tDepth.value = readBuffer.depthTexture;
    pass.uniforms.texel.value.set(1/readBuffer.width,1/readBuffer.height);
    pass.uniforms.focus.value = lab.camera.position.distanceTo(lab.controls.target);
    render(renderer,writeBuffer,readBuffer,dt,mask);
  };
  return pass;
}
