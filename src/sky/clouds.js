// Shinkai-style cumulus: each cloud is a billboard whose texture stores a
// 2.5D normal map built from overlapping sphere caps. The shader relights it
// with the current sun, so towers glow gold at dusk and blush violet beneath.

import * as THREE from 'three';
import { mulberry32, createNoise2D, fbm } from '../core/noise.js';
import { U } from '../core/materials.js';

function genCloud(W, H, kind, seed) {
  const rand = mulberry32(seed);
  const noise = createNoise2D(seed * 7 + 3);
  const puffs = [];
  const baseY = kind === 'tower' ? H * 0.9 : H * 0.8;
  const x0 = W * 0.1, x1 = W * 0.9;
  const env = (u) => {
    // envelope (top height in px above base) for normalised x u in [0,1]
    if (kind === 'tower') {
      const core = Math.exp(-Math.pow((u - 0.5) / 0.2, 2));
      const shoulders = Math.pow(Math.sin(Math.PI * u), 0.8);
      return H * (0.18 * shoulders + 0.68 * core);
    }
    if (kind === 'flat') return H * 0.25 * Math.pow(Math.sin(Math.PI * u), 0.6);
    const hump = Math.pow(Math.sin(Math.PI * u), 0.75);
    const second = 0.35 * Math.exp(-Math.pow((u - 0.3 - rand() * 0.0) / 0.12, 2));
    return H * (0.42 * hump + 0.18 * second);
  };
  const rScale = kind === 'tower' ? 0.11 : kind === 'flat' ? 0.09 : 0.14;
  // boundary puffs give the crisp cauliflower silhouette
  const nb = kind === 'tower' ? 70 : 42;
  for (let i = 0; i < nb; i++) {
    const u = (i + rand() * 0.8) / nb;
    const top = env(u);
    const r = H * rScale * (0.55 + rand() * 0.75) * (0.6 + 0.4 * Math.min(1, top / (H * 0.3)));
    puffs.push({ x: x0 + (x1 - x0) * u, y: baseY - Math.max(top - r * 0.75, r * 0.4), r });
  }
  // interior fill
  const nf = kind === 'tower' ? 110 : 60;
  for (let i = 0; i < nf; i++) {
    const u = 0.05 + rand() * 0.9;
    const top = env(u);
    const r = H * rScale * (0.7 + rand() * 0.6);
    const y = baseY - r * 0.4 - rand() * Math.max(0, top - r * 0.9);
    puffs.push({ x: x0 + (x1 - x0) * u, y, r });
  }

  const hf = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sc = W / 512;
      const wx = px + 8 * sc * noise(px * 0.02 / sc, py * 0.02 / sc) + 1.2 * sc * noise(px * 0.07 / sc + 5, py * 0.07 / sc);
      const wy = py + 8 * sc * noise(px * 0.02 / sc + 17, py * 0.02 / sc - 4) + 1.2 * sc * noise(px * 0.07 / sc - 9, py * 0.07 / sc + 2);
      let best = 0;
      for (let k = 0; k < puffs.length; k++) {
        const p = puffs[k];
        const dx = wx - p.x, dy = wy - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < p.r * p.r) {
          const v = Math.sqrt(p.r * p.r - d2) + (H - p.y) * 0.08;
          if (v > best) best = v;
        }
      }
      // flat, slightly ragged base
      const cut = baseY + 4 * noise(px * 0.03, 9.1) - wy;
      if (cut < 0) best = 0;
      else if (cut < 10) best *= cut / 10;
      hf[py * W + px] = best;
    }
  }
  // soften puff creases a little (separable box blur, 2 passes)
  const tmpH = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const a = hf[py * W + Math.max(0, px - 1)], b = hf[py * W + px], c = hf[py * W + Math.min(W - 1, px + 1)];
      tmpH[py * W + px] = b === 0 ? 0 : (a + b * 2 + c) / 4;
    }
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const a = tmpH[Math.max(0, py - 1) * W + px], b = tmpH[py * W + px], c = tmpH[Math.min(H - 1, py + 1) * W + px];
      hf[py * W + px] = b === 0 ? 0 : (a + b * 2 + c) / 4;
    }
  }
  let maxH = 0;
  for (let i = 0; i < hf.length; i++) maxH = Math.max(maxH, hf[i]);

  const data = new Uint8Array(W * H * 4);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const h = hf[i];
      const hl = hf[py * W + Math.max(0, px - 1)], hr = hf[py * W + Math.min(W - 1, px + 1)];
      const hu = hf[Math.max(0, py - 1) * W + px], hd = hf[Math.min(H - 1, py + 1) * W + px];
      let nx = (hl - hr) * 0.5, ny = (hd - hu) * 0.5, nz = 1.0;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const edgeN = fbm(noise, px * 0.05, py * 0.05, 2);
      const soft = 2.5 + 10 * Math.max(0, edgeN + 0.2);
      const a = Math.min(1, Math.max(0, h / soft));
      data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = Math.round(Math.min(1, h / (maxH * 0.6)) * 255);
      data[i * 4 + 3] = Math.round(a * a * (3 - 2 * a) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vFwd;
varying float vSeed;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  vec3 ctr = modelMatrix[3].xyz;
  vec2 aSize = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vec3 toCam = cameraPosition - ctr;
  toCam.y = 0.0;
  vec3 fwd = normalize(toCam);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(up, fwd));
  vec3 wp = ctr + right * position.x * aSize.x + up * (position.y + 0.5) * aSize.y;
  vWorld = wp;
  vRight = right; vUp = up; vFwd = fwd;
  vSeed = fract(ctr.x * 0.0137 + ctr.z * 0.0071);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec3 uSunDir;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uCloudRim;
uniform vec3 uSkyHorizon;
uniform vec3 uFogSunColor;
uniform float uNight;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vFwd;
varying float vSeed;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.01) discard;
  vec3 n = vec3(t.r * 2.0 - 1.0, t.g * 2.0 - 1.0, 0.0);
  n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy)));
  vec3 Nw = normalize(vRight * n.x + vUp * n.y + vFwd * n.z);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWorld);

  float ndl = dot(Nw, L);
  float lit = smoothstep(-0.35, 0.55, ndl);
  // thick cores self-shadow; thin edges let light through
  float thick = t.b;
  vec3 col = mix(uCloudShade, uCloudLit, lit);
  col *= mix(1.08, 0.88, thick * (1.0 - lit));
  // silver lining when the sun is behind the cloud
  float back = pow(max(dot(-V, L), 0.0), 4.0);
  float edge = pow(1.0 - thick, 4.0);
  // only the edges that face the sun (in the billboard plane) catch the lining
  vec2 Lp = vec2(dot(L, vRight), dot(L, vUp));
  float side = max(dot(normalize(n.xy + 1e-4), normalize(Lp + 1e-4)), 0.0);
  col += uCloudRim * edge * side * (0.1 + back * 1.6);
  // warm forward glow towards the sun
  float toward = pow(max(dot(-V, uSunDir), 0.0), 10.0);
  col += uFogSunColor * toward * 0.35 * (1.0 - thick * 0.5);

  // aerial haze: low, distant clouds dissolve into the horizon colour
  vec3 dv = vWorld - cameraPosition;
  float elev = dv.y / length(dv);
  float haze = smoothstep(0.22, 0.0, elev) * 0.55;
  col = mix(col, uSkyHorizon, haze);

  gl_FragColor = vec4(col, t.a * uOpacity);
}
`;

export function buildClouds(quality = 'high') {
  const group = new THREE.Group();
  group.name = 'clouds';
  const rand = mulberry32(8080);
  const hi = quality !== 'low';
  const kinds = [
    { kind: 'tower', W: hi ? 512 : 256, H: hi ? 512 : 256, n: 3 },
    { kind: 'cumulus', W: hi ? 512 : 256, H: hi ? 256 : 128, n: 4 },
    { kind: 'flat', W: hi ? 512 : 256, H: hi ? 128 : 64, n: 2 },
  ];
  const opacity = { value: 1 };
  const materials = [];
  let seed = 1;
  for (const k of kinds) {
    for (let v = 0; v < k.n; v++) {
      const tex = genCloud(k.W, k.H, k.kind, seed++ * 131);
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U, map: { value: tex }, uOpacity: opacity },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      });
      materials.push({ mat, kind: k.kind, aspect: k.W / k.H });
    }
  }

  // Placement: towering cumulonimbus on the horizon, a broken cumulus deck
  // in the middle distance, and smaller puffs overhead.
  const placements = [];
  const place = (kind, count, dMin, dMax, yMin, yMax, wMin, wMax, arcs) => {
    for (let i = 0; i < count; i++) {
      let ang;
      if (arcs) { const a = arcs[i % arcs.length]; ang = a[0] + rand() * (a[1] - a[0]); } else ang = rand() * Math.PI * 2;
      const d = dMin + rand() * (dMax - dMin);
      placements.push({ kind, x: Math.cos(ang) * d, z: Math.sin(ang) * d, y: yMin + rand() * (yMax - yMin), w: wMin + rand() * (wMax - wMin) });
    }
  };
  // big towers mostly south (behind the lake from the hero view) and east
  place('tower', 8, 12000, 17500, 200, 700, 3600, 6200, [[-0.3, 0.75], [2.55, 3.5], [-2.7, -1.9], [0.75, 1.0]]);
  place('cumulus', 26, 3500, 11000, 1100, 2000, 1400, 3200, [[-3.14, 1.15], [2.15, 3.14]]);
  place('cumulus', 10, 1800, 4500, 1700, 2300, 700, 1300);
  place('flat', 14, 2500, 11000, 1500, 2600, 1500, 3600);

  const geo = new THREE.PlaneGeometry(1, 1);
  const byKind = {};
  for (const m of materials) (byKind[m.kind] ||= []).push(m);
  const counters = {};
  for (const p of placements) {
    const list = byKind[p.kind];
    const idx = (counters[p.kind] = (counters[p.kind] || 0) + 1) % list.length;
    const m = list[idx];
    const mesh = new THREE.Mesh(geo, m.mat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.scale.set(p.w, p.w / m.aspect, 1);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    group.add(mesh);
  }

  return {
    group,
    update(dt) { group.rotation.y += dt * 0.0009; },
    setOpacity(v) { opacity.value = v; },
  };
}
