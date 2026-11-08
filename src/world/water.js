// Lake Itomori: a planar mirror distorted by procedural ripples, with
// Fresnel, shallow-shore turquoise and the glittering sun path that Shinkai
// paints on every body of water.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { U, GLSL_FOG_PARS, GLSL_COMMON } from '../core/materials.js';
import { LAKE_R, SHINTAI_MOAT, SITES, lakeRadius } from './heightfield.js';

const WATER_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSunColor;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyTop;
uniform float uNight;
${GLSL_COMMON}

// layered scrolling noise ripples -> surface slope (no regular patterns)
vec2 nGrad(vec2 q) {
  const float e = 0.35;
  return vec2(sNoise(q + vec2(e, 0.0)) - sNoise(q - vec2(e, 0.0)), sNoise(q + vec2(0.0, e)) - sNoise(q - vec2(0.0, e))) / (2.0 * e);
}
vec2 waveSlope(vec2 p, float t, float fade) {
  vec2 s = vec2(0.0);
  s += nGrad(p * 0.028 + vec2(t * 0.020, t * 0.012)) * 0.05;
  s += nGrad(p * 0.09 + vec2(-t * 0.045, t * 0.03)) * 0.04;
  s += nGrad(p * 0.31 + vec2(t * 0.09, -t * 0.08)) * 0.03 * fade;
  s += nGrad(p * 1.1 + vec2(-t * 0.2, -t * 0.15)) * 0.018 * fade * fade;
  return s;
}
`;

const vertexShader = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUvR;
varying vec3 vWorld;
void main() {
  vUvR = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 color;
uniform float uLakeR;
${WATER_GLSL}
${GLSL_FOG_PARS}
varying vec4 vUvR;
varying vec3 vWorld;

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float fade = clamp(1.0 - dist / 5000.0, 0.15, 1.0);
  vec2 sl = waveSlope(vWorld.xz, uTime, fade);
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));

  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);

  vec4 uv = vUvR;
  uv.xy += N.xz * 0.28 * uv.w * (6.0 / (6.0 + dist * 0.01));
  vec3 refl = texture2DProj(tDiffuse, uv).rgb;

  float r = length(vWorld.xz);
  float shallow = smoothstep(uLakeR - 70.0, uLakeR + 4.0, r);
  vec3 body = mix(uWaterDeep, uWaterShallow, shallow * 0.85);
  // Shinkai lakes read as mirrors: lots of reflection even looking down
  float reflAmt = clamp(0.55 + fres * 0.6 - shallow * 0.25, 0.0, 1.0);
  vec3 col = mix(body, refl, reflAmt);

  // sun / moon path: broad sheen + tight glints + glitter
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);
  float sheen = pow(max(dot(N, H), 0.0), 260.0) * 0.6;
  float glint = pow(max(dot(N, H), 0.0), 1400.0) * 26.0;
  vec2 gp = vWorld.xz * 2.2 + N.xz * 3.0;
  vec2 gi = floor(gp);
  vec2 gf = fract(gp) - 0.5;
  float g = sHash12(gi + floor(uTime * 5.0) * 0.37);
  vec2 go = vec2(sHash12(gi + 3.1), sHash12(gi + 7.7)) - 0.5;
  float nearF = exp(-dist / 700.0);
  float spark = smoothstep(0.22, 0.0, length(gf - go * 0.5)) * step(0.9, g);
  float glitter = spark * pow(max(dot(reflect(-V, N), L), 0.0), 30.0) * 16.0 * nearF;
  float lightUp = smoothstep(-0.05, 0.08, L.y);
  col += uLightColor * (sheen + glint + glitter) * lightUp;

  // a thin bright lip along the shore
  col += uWaterShallow * smoothstep(uLakeR - 6.0, uLakeR + 2.0, r) * 0.25 * (1.0 - uNight * 0.8);

  col = shinkaiFog(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildLake(renderer, quality = 'high') {
  const scale = quality === 'low' ? 0.35 : 0.6;
  const w = Math.floor(window.innerWidth * Math.min(2, window.devicePixelRatio) * scale);
  const h = Math.floor(window.innerHeight * Math.min(2, window.devicePixelRatio) * scale);
  const geo = new THREE.CircleGeometry(LAKE_R + 60, 256);
  const shader = {
    name: 'ItomoriLake',
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
    },
    vertexShader,
    fragmentShader,
  };
  const lake = new Reflector(geo, {
    shader,
    textureWidth: w,
    textureHeight: h,
    clipBias: 0.002,
    multisample: quality === 'low' ? 0 : 4,
  });
  for (const k in U) lake.material.uniforms[k] = U[k];
  lake.material.uniforms.uLakeR = { value: LAKE_R };
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = 0;
  lake.name = 'lake';
  lake.userData.resize = (W, H) => {
    lake.getRenderTarget().setSize(Math.floor(W * scale), Math.floor(H * scale));
  };
  return lake;
}

/** Simple sky-reflecting water used for the go-shintai moat. */
export function buildMoat() {
  const geo = new THREE.RingGeometry(SHINTAI_MOAT.inner - 2, SHINTAI_MOAT.outer + 2, 128, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${WATER_GLSL}
      ${GLSL_FOG_PARS}
      varying vec3 vWorld;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec2 sl = waveSlope(vWorld.xz * 1.5, uTime, 0.5);
        vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
        vec3 R = reflect(-V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.4, 0.0, 1.0));
        vec3 col = mix(uWaterDeep * 0.8, sky, 0.35 + 0.6 * fres);
        col += uLightColor * pow(max(dot(R, normalize(uLightDir)), 0.0), 300.0) * 20.0;
        gl_FragColor = vec4(shinkaiFog(col, vWorld), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(SITES.shintai.x, SHINTAI_MOAT.level, SITES.shintai.z);
  mesh.name = 'moat';
  return mesh;
}

export { lakeRadius };
