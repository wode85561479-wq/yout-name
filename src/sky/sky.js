// Painted sky dome: saturated zenith gradient, sun glow, cirrus streaks,
// stars + Milky Way, the moon and comet Tiamat with its split fragment.

import * as THREE from 'three';
import { U } from '../core/materials.js';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform vec3 uFogSunColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uNight;
uniform float uDusk;
uniform float uTime;
uniform float uStars;
uniform float uCirrus;
uniform float uComet;
uniform float uCometSplit;
uniform vec3 uCometHead;
uniform vec3 uCometTail;
varying vec3 vDir;

float h13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return s;
}
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(h13(i), h13(i + vec3(1,0,0)), u.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), u.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}

float starLayer(vec3 d, float scale, float density, float size) {
  vec3 p = d * scale;
  vec3 i = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = h13(i);
  if (h > density) return 0.0;
  vec3 off = (vec3(h13(i + 1.7), h13(i + 3.1), h13(i + 5.3)) - 0.5) * 0.6;
  float dist = length(f - off);
  float b = 1.0 - h / density;
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h * 6.0) + h * 40.0);
  return smoothstep(size, 0.0, dist) * (0.3 + b * b * 1.7) * tw;
}

vec3 comet(vec3 d) {
  vec3 H = normalize(uCometHead);
  vec3 T = normalize(uCometTail);
  vec3 B = normalize(cross(H, T));
  float ch = dot(d, H);
  if (ch < 0.3) return vec3(0.0);
  vec3 q = d / ch - H;
  float u = dot(q, T);
  float v = dot(q, B);
  vec3 c = vec3(0.0);

  float r2 = u * u + v * v;
  c += vec3(0.85, 0.95, 1.0) * (exp(-r2 / 0.0000025) * 9.0 + exp(-r2 / 0.00005) * 1.8 + exp(-r2 / 0.0009) * 0.35);

  if (u > 0.0) {
    // ion tail: long, straight, blue with fine streamers
    float w = 0.0022 + u * 0.05;
    float fall = exp(-u * 1.5) * smoothstep(0.0, 0.015, u);
    float tail = exp(-(v * v) / (w * w)) * fall;
    float streak = 0.65 + 0.35 * sin(v / w * 6.0 + u * 22.0 - uTime * 0.2);
    c += vec3(0.32, 0.68, 1.0) * tail * 1.25 * streak;
    float core = exp(-(v * v) / (w * w * 0.05)) * fall;
    c += vec3(0.75, 0.92, 1.0) * core * 0.8;
    // faint outer veil
    float veil = exp(-(v * v) / (w * w * 5.0)) * exp(-u * 2.2);
    c += vec3(0.3, 0.45, 0.9) * veil * 0.18;
    // dust tail: curved, broad, warm pink
    float v2 = v + u * u * 0.7;
    float w2 = 0.004 + u * 0.1;
    float dust = exp(-(v2 * v2) / (w2 * w2)) * exp(-u * 2.4) * smoothstep(0.0, 0.03, u);
    c += vec3(1.0, 0.55, 0.75) * dust * 0.5;
    // glitter along the trail
    float g = h12(floor(vec2(u, v) * 900.0));
    c += vec3(0.8, 0.9, 1.0) * step(0.985, g) * tail * 3.0;
  }

  if (uCometSplit > 0.001) {
    // The fragment separating from the nucleus, trailing its own glowing wake.
    vec2 off = vec2(0.035, 0.022) * uCometSplit;
    float u2 = u + off.x, v2 = v + off.y;
    float rr = u2 * u2 + v2 * v2;
    c += vec3(1.0, 0.85, 0.9) * (exp(-rr / 0.0000018) * 7.0 + exp(-rr / 0.00003) * 1.0) * uCometSplit;
    // wake pointing back towards the main nucleus
    vec2 dirw = normalize(off);
    float a = dot(vec2(u2, v2), dirw);
    float pp = dot(vec2(u2, v2), vec2(-dirw.y, dirw.x));
    if (a > 0.0) {
      float ww = 0.0012 + a * 0.06;
      float wake = exp(-(pp * pp) / (ww * ww)) * exp(-a * 25.0) * smoothstep(0.0, 0.004, a);
      c += mix(vec3(1.0, 0.6, 0.8), vec3(0.6, 0.85, 1.0), clamp(a * 30.0, 0.0, 1.0)) * wake * 1.4 * uCometSplit;
    }
  }
  return c;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hy = max(y, 0.0);

  // Base gradient: horizon -> mid band -> deep zenith.
  float tMid = smoothstep(0.0, 0.28, hy);
  float tTop = smoothstep(0.06, 0.8, hy);
  vec3 col = mix(uSkyHorizon, uSkyMid, tMid);
  col = mix(col, uSkyTop, tTop * tTop * (3.0 - 2.0 * tTop));
  col = mix(col, uSkyHorizon * 0.92, smoothstep(0.0, -0.12, y));

  // Warm forward scattering around the sun.
  float sd = dot(d, uSunDir);
  float sdp = max(sd, 0.0);
  float mie = pow(sdp, 7.0);
  float sunUp = smoothstep(-0.25, 0.02, uSunDir.y);
  float lobe = pow(sdp, 3.0) * (1.0 - tMid * 0.75);
  col = mix(col, uFogSunColor, clamp(lobe * 0.8 + mie * (1.0 - tTop * 0.55) * 0.6, 0.0, 1.0) * sunUp);
  col += uSunColor * (pow(sdp, 48.0) * 0.6 + pow(sdp, 700.0) * 3.0) * sunUp;
  float disk = smoothstep(0.99955, 0.99972, sd);
  col += uSunColor * disk * 24.0 * smoothstep(-0.03, 0.0, y);

  // Cirrus / altocumulus streaks painted across the dome.
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12);
    vec2 w = uv * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);
    mat2 rot = mat2(0.86, 0.5, -0.5, 0.86);
    vec2 s = rot * w;
    float base = fbm2(s * vec2(0.6, 2.4));
    float detail = fbm2(s * vec2(2.5, 9.0) + base * 1.5);
    float ci = smoothstep(0.52, 0.8, base * 0.65 + detail * 0.45) * smoothstep(0.0, 0.18, y) * uCirrus;
    // dappled altocumulus band
    float ac = smoothstep(0.62, 0.74, fbm2(uv * 2.2 + vec2(uTime * 0.006, 0.0) + base)) * smoothstep(0.1, 0.35, y) * smoothstep(0.9, 0.5, y) * uCirrus * 0.55;
    vec3 cc = mix(uCloudShade, uCloudLit, 0.75) + uFogSunColor * mie * 0.8 + uSunColor * pow(sdp, 12.0) * 0.6;
    col = mix(col, cc, clamp(ci * 0.75 + ac * 0.6, 0.0, 1.0));
  }

  // Night sky.
  float starVis = uStars * smoothstep(-0.02, 0.15, y);
  if (starVis > 0.001) {
    vec3 M = normalize(vec3(0.42, 0.55, -0.72));
    float band = exp(-pow(dot(d, M) / 0.2, 2.0));
    float mw = band * (0.45 + 0.55 * fbm2(vec2(atan(d.z, d.x) * 3.0, d.y * 6.0)));
    float dust = smoothstep(0.45, 0.75, fbm2(vec2(atan(d.z, d.x) * 9.0, d.y * 18.0)));
    col += vec3(0.32, 0.34, 0.62) * mw * 0.22 * starVis * (1.0 - dust * 0.6 * band);
    float st = starLayer(d, 260.0, 0.06 + band * 0.08, 0.22) + starLayer(d, 520.0, 0.08 + band * 0.12, 0.28) * 0.6 + starLayer(d, 120.0, 0.025, 0.12) * 1.8;
    col += vec3(0.9, 0.93, 1.0) * st * starVis;
  }

  // Moon.
  float md = dot(d, normalize(uMoonDir));
  float moonUp = smoothstep(-0.05, 0.05, uMoonDir.y) * uNight;
  col += vec3(0.95, 0.95, 1.0) * smoothstep(0.99975, 0.99985, md) * 5.0 * moonUp;
  col += vec3(0.45, 0.55, 0.85) * pow(max(md, 0.0), 300.0) * 0.6 * moonUp;
  col += vec3(0.25, 0.32, 0.6) * pow(max(md, 0.0), 12.0) * 0.12 * moonUp;

  // Comet Tiamat.
  if (uComet > 0.001) {
    vec3 cm = comet(d) * smoothstep(-0.02, 0.06, y);
    col += cm * uComet;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildSky() {
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  mat.depthFunc = THREE.LessEqualDepth;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}
