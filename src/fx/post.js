// Post-processing: crepuscular rays + lens flare (HDR) -> bloom ->
// tone-map, split-tone grade, chromatic fringe, vignette, grain -> sRGB.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const RaysFlareShader = {
  name: 'ShinkaiRaysFlare',
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uSunOn: { value: 0 },
    uAspect: { value: 1 },
    uRayColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uRayStrength: { value: 0.4 },
    uFlare: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uSunOn;
    uniform float uAspect;
    uniform vec3 uRayColor;
    uniform float uRayStrength;
    uniform float uFlare;
    uniform float uTime;
    varying vec2 vUv;
    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

    vec3 ghost(vec2 uv, vec2 c, float r, vec3 tint, float soft) {
      vec2 d = (uv - c) * vec2(uAspect, 1.0);
      float l = length(d);
      return tint * smoothstep(r, r * (1.0 - soft), l);
    }
    float hexDist(vec2 p) {
      p = abs(p);
      return max(dot(p, vec2(0.866, 0.5)), p.y);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uSunOn > 0.001) {
        // --- crepuscular rays: march towards the sun gathering bright sky
        const int N = 48;
        vec2 delta = (vUv - uSun) / float(N) * 0.92;
        vec2 p = vUv - delta * h12(vUv * 913.0 + uTime);
        float decay = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < N; i++) {
          p -= delta;
          vec3 s = texture2D(tDiffuse, p).rgb;
          float l = lum(s);
          acc += s * smoothstep(1.1, 4.0, l) * decay;
          decay *= 0.962;
        }
        acc /= float(N);
        float sunDist = length((vUv - uSun) * vec2(uAspect, 1.0));
        col += acc * uRayColor * uRayStrength * uSunOn * 2.2;

        // --- occlusion of the sun itself (for the flare)
        float occ = 0.0;
        for (int i = 0; i < 5; i++) {
          vec2 o = vec2(float(i - 2) * 0.004, float((i * 3) % 5 - 2) * 0.004);
          occ += smoothstep(2.0, 9.0, lum(texture2D(tDiffuse, uSun + o).rgb));
        }
        occ /= 5.0;
        float f = occ * uSunOn * uFlare;
        if (f > 0.001) {
          // soft halo + anamorphic streak around the sun
          col += uRayColor * exp(-sunDist * 9.0) * 0.35 * f;
          float dy = (vUv.y - uSun.y);
          col += vec3(0.65, 0.8, 1.0) * exp(-abs(dy) * 260.0) * exp(-abs(vUv.x - uSun.x) * 2.2) * 0.25 * f;
          // rainbow ring
          float ring = exp(-pow((sunDist - 0.34) / 0.018, 2.0));
          vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (sunDist * 3.0 + vec3(0.0, 0.33, 0.67)));
          col += rainbow * ring * 0.05 * f;
          // ghosts along the axis through the screen centre
          vec2 axis = vec2(0.5) - uSun;
          col += ghost(vUv, uSun + axis * 0.55, 0.035, vec3(0.45, 0.75, 1.0) * 0.12, 0.6) * f;
          col += ghost(vUv, uSun + axis * 0.85, 0.07, vec3(1.0, 0.65, 0.35) * 0.07, 0.4) * f;
          col += ghost(vUv, uSun + axis * 1.25, 0.11, vec3(0.6, 1.0, 0.7) * 0.05, 0.3) * f;
          col += ghost(vUv, uSun + axis * 1.6, 0.05, vec3(0.9, 0.5, 1.0) * 0.08, 0.7) * f;
          vec2 hp = (vUv - (uSun + axis * 1.05)) * vec2(uAspect, 1.0);
          col += vec3(0.5, 0.8, 1.0) * smoothstep(0.06, 0.052, hexDist(hp)) * 0.06 * f;
          vec2 hp2 = (vUv - (uSun + axis * 1.9)) * vec2(uAspect, 1.0);
          col += vec3(1.0, 0.75, 0.5) * smoothstep(0.09, 0.08, hexDist(hp2)) * 0.035 * f;
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const GradeShader = {
  name: 'ShinkaiGrade',
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.04 },
    uShadowTint: { value: new THREE.Color(0.86, 0.92, 1.12) },
    uHighTint: { value: new THREE.Color(1.05, 1.0, 0.93) },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.007 },
    uCA: { value: 1 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uLightLeak: { value: 0.0 },
    uLeakColor: { value: new THREE.Color(1, 0.6, 0.4) },
  },
  vertexShader: RaysFlareShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uTime;
    uniform float uAspect;
    uniform float uLightLeak;
    uniform vec3 uLeakColor;
    varying vec2 vUv;
    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    void main() {
      vec2 dc = vUv - 0.5;
      float r2 = dot(dc, dc);
      vec2 off = dc * r2 * 0.006 * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      col *= uExposure;
      // keep hue in the highlights: tone-map luminance, then re-saturate
      vec3 tm = aces(col);
      float l0 = lum(col), l1 = lum(tm);
      vec3 hueKeep = col * (l1 / max(l0, 1e-4));
      col = mix(tm, clamp(hueKeep, 0.0, 1.0), 0.45);
      // split toning: cool shadows, warm highlights
      float l = lum(col);
      col *= mix(uShadowTint, vec3(1.0), smoothstep(0.0, 0.45, l));
      col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l));
      // contrast & saturation
      col = (col - 0.5) * uContrast + 0.5;
      l = lum(col);
      col = mix(vec3(l), col, uSaturation);
      // light leak from the top corner (film-like warmth)
      col += uLeakColor * uLightLeak * pow(smoothstep(0.75, 0.0, length((vUv - vec2(1.04, 1.06)) * vec2(uAspect, 1.0))), 2.0) * 0.3;
      // vignette
      float v = smoothstep(0.85, 0.2, length(dc * vec2(uAspect * 0.8, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      // grain
      col += (h12(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function buildPost(renderer, scene, camera, quality = 'high') {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples: quality === 'low' ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const rays = new ShaderPass(RaysFlareShader);
  composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.7, 0.75, 1.35);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const v = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  return {
    composer,
    rays,
    bloom,
    grade,
    setSize(w, h) {
      composer.setSize(w, h);
      rays.uniforms.uAspect.value = w / h;
      grade.uniforms.uAspect.value = w / h;
    },
    update(time, sunDir, tod) {
      rays.uniforms.uTime.value = time;
      grade.uniforms.uTime.value = time;
      // sun position on screen
      v.copy(camera.position).addScaledVector(sunDir, 10000).project(camera);
      camera.getWorldDirection(fwd);
      const inFront = fwd.dot(sunDir) > 0 ? 1 : 0;
      const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5;
      const edge = THREE.MathUtils.smoothstep(Math.min(sx, 1 - sx, sy, 1 - sy), -0.35, 0.05);
      rays.uniforms.uSun.value.set(sx, sy);
      rays.uniforms.uSunOn.value = inFront * edge * tod.sunVisible;
      rays.uniforms.uRayStrength.value = tod.rays;
      rays.uniforms.uRayColor.value.copy(tod.rayColor);
      grade.uniforms.uExposure.value = tod.exp;
      bloom.strength = 0.55 * tod.bloom;
      grade.uniforms.uLightLeak.value = tod.leak;
      grade.uniforms.uLeakColor.value.copy(tod.rayColor);
    },
  };
}
