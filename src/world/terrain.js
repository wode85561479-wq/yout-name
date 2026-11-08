// Terrain mesh: a polar grid centred on the crater lake (dense where the town
// is, coarse towards the far ranges), split into sectors for frustum culling,
// shaded with vertex colours + the painted ground map.

import * as THREE from 'three';
import {
  terrainHeight, lakeRadius, flatWidth, valleyCenterZ, SITES, SHINTAI_MOAT,
} from './heightfield.js';
import { createNoise2D, fbm, smooth, clamp } from '../core/noise.js';
import { toonMaterial, U } from '../core/materials.js';
import { GROUND } from './layout.js';
import { ERA, craterDist } from '../core/era.js';

const nCol = createNoise2D(77);
const nCol2 = createNoise2D(91);

/** 0..1 – how densely forested the ground is (shared with the tree scatter). */
export function forestDensity(x, z, slope, townDensity) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const s = r - lakeRadius(th);
  if (s < 5) return 0;
  if (ERA.after && craterDist(x, z) < 90) return 0;
  const fw = flatWidth(th);
  let f = smooth(fw * 0.55, fw * 1.02, s);
  f = Math.max(f, smooth(0.2, 0.42, slope) * smooth(8, 50, s));
  if (x > 560) {
    const vz = valleyCenterZ(x);
    f *= 1 - 0.97 * smooth(270, 160, Math.abs(z - vz)) * smooth(2100, 1650, x);
  }
  const dg = Math.hypot(x - SITES.shintai.x, z - SITES.shintai.z);
  f *= smooth(150, 178, dg);
  const ds = Math.hypot(x - SITES.school.x, z - SITES.school.z);
  f *= smooth(SITES.school.r + 5, SITES.school.r + 40, ds);
  if (townDensity) f *= 1 - 0.92 * townDensity(x, z);
  // patchy clearings on the slopes
  const n = fbm(nCol2, x * 0.004, z * 0.004, 2);
  f *= smooth(-0.72, -0.48, n);
  return clamp(f, 0, 1);
}

const C = (hex) => new THREE.Color(hex);
const PAL = {
  meadow: C('#86b845'),
  meadow2: C('#a3c656'),
  meadowDark: C('#6a9a3a'),
  forest: C('#24452a'),
  forest2: C('#2f5a2e'),
  rock: C('#7c786a'),
  cliff: C('#5f5d52'),
  sand: C('#c9bb92'),
  bed: C('#4c5a44'),
  deep: C('#2b3b36'),
  far: C('#3b5c43'),
  calderaGrass: C('#9dc25a'),
  scar: C('#8d7d63'),
};
const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

function groundColor(out, x, z, h, slope, townDensity) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const s = r - lakeRadius(th);
  const n = fbm(nCol, x * 0.006, z * 0.006, 3);
  const n2 = nCol2(x * 0.03, z * 0.03);

  if (s < 0 && r < 2000) {
    out.copy(PAL.sand).lerp(PAL.bed, smooth(-1, -14, s));
    out.lerp(PAL.deep, smooth(-14, -120, s));
    return out;
  }
  if (ERA.after) {
    const s2 = craterDist(x, z);
    if (s2 < 0) {
      out.copy(PAL.sand).lerp(PAL.bed, smooth(-1, -14, s2));
      out.lerp(PAL.deep, smooth(-14, -120, s2));
      return out;
    }
  }

  // meadow with variation
  out.copy(PAL.meadow).lerp(PAL.meadow2, smooth(-0.3, 0.6, n));
  out.lerp(PAL.meadowDark, smooth(0.1, 0.8, n2) * 0.5);

  const f = forestDensity(x, z, slope, townDensity);
  tmp.copy(PAL.forest).lerp(PAL.forest2, smooth(-0.5, 0.5, n));
  out.lerp(tmp, f);

  // rock on steep slopes
  out.lerp(PAL.cliff, smooth(0.6, 0.85, slope) * 0.85);

  // shore pebbles
  out.lerp(tmp2.copy(PAL.sand), smooth(9, 2, s));

  // caldera floor grass
  const dg = Math.hypot(x - SITES.shintai.x, z - SITES.shintai.z);
  if (dg < 200) {
    out.lerp(PAL.calderaGrass, smooth(160, 120, dg));
    out.lerp(PAL.rock, smooth(130, 150, dg) * smooth(180, 155, dg) * 0.6);
    const md = Math.abs(dg - (SHINTAI_MOAT.inner + SHINTAI_MOAT.outer) / 2);
    out.lerp(PAL.sand, smooth(18, 12, md) * 0.6);
  }

  // scorched crater walls, eight years into their regrowth
  if (ERA.after) {
    const s2 = craterDist(x, z);
    if (s2 < 170) {
      const bare = smooth(170, 25, s2) * (0.55 + 0.45 * smooth(-0.4, 0.5, n2));
      out.lerp(PAL.scar, bare * 0.85);
      out.lerp(PAL.rock, smooth(0.45, 0.8, slope) * smooth(140, 40, s2) * 0.6);
    }
  }
  // distant ranges lean blue-green
  out.lerp(PAL.far, smooth(3500, 7000, r) * 0.7);
  // a hint of height tint
  out.multiplyScalar(0.92 + 0.12 * smooth(0, 600, h));
  return out;
}

function radialSamples(quality) {
  const rs = [0];
  let r = 0;
  const k = quality === 'low' ? 1.8 : 1;
  while (r < 12000) {
    let step;
    if (r < 360) step = 24;
    else if (r < 1450) step = 4.0;
    else if (r < 3200) step = 4 + ((r - 1450) / 1750) * 16;
    else step = 20 + ((r - 3200) / 8800) * 130;
    r = Math.min(12000, r + step * k);
    rs.push(r);
  }
  return rs;
}

function buildGrid({ rs, A, cx = 0, cz = 0, heightFn, lowerFn, townDensity }) {
  const R = rs.length;
  const cols = A + 1;
  const pos = new Float32Array(R * cols * 3);
  const nor = new Float32Array(R * cols * 3);
  const col = new Float32Array(R * cols * 3);
  for (let i = 0; i < R; i++) {
    const r = rs[i];
    for (let j = 0; j < cols; j++) {
      const th = (j / A) * Math.PI * 2 - Math.PI;
      const x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
      const k = (i * cols + j) * 3;
      pos[k] = x; pos[k + 1] = heightFn(x, z); pos[k + 2] = z;
    }
  }
  const P = (i, j) => (i * cols + j) * 3;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < cols; j++) {
      const k = P(i, j);
      if (i === 0) { nor[k] = 0; nor[k + 1] = 1; nor[k + 2] = 0; continue; }
      const i0 = Math.max(0, i - 1), i1 = Math.min(R - 1, i + 1);
      const jm = j === 0 ? A - 1 : j - 1, jp = j === A ? 1 : j + 1;
      const a0 = P(i0, j), a1 = P(i1, j), b0 = P(i, jm), b1 = P(i, jp);
      const ax = pos[a1] - pos[a0], ay = pos[a1 + 1] - pos[a0 + 1], az = pos[a1 + 2] - pos[a0 + 2];
      const bx = pos[b1] - pos[b0], by = pos[b1 + 1] - pos[b0 + 1], bz = pos[b1 + 2] - pos[b0 + 2];
      // n = b x a  (points up)
      let nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
    }
  }
  const c = new THREE.Color();
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < cols; j++) {
      const k = P(i, j);
      groundColor(c, pos[k], pos[k + 2], pos[k + 1], 1 - nor[k + 1], townDensity);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  if (lowerFn) for (let k = 0; k < pos.length; k += 3) pos[k + 1] -= lowerFn(pos[k], pos[k + 2]);
  return { pos, nor, col, R, cols };
}

function chunkGeometry(grid, i0, i1, j0, j1) {
  const { pos, nor, col, cols } = grid;
  const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
  const P = new Float32Array(ni * nj * 3), N = new Float32Array(ni * nj * 3), Cc = new Float32Array(ni * nj * 3);
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      const src = ((i0 + i) * cols + (j0 + j)) * 3, dst = (i * nj + j) * 3;
      P[dst] = pos[src]; P[dst + 1] = pos[src + 1]; P[dst + 2] = pos[src + 2];
      N[dst] = nor[src]; N[dst + 1] = nor[src + 1]; N[dst + 2] = nor[src + 2];
      Cc[dst] = col[src]; Cc[dst + 1] = col[src + 1]; Cc[dst + 2] = col[src + 2];
    }
  }
  const idx = new Uint32Array((ni - 1) * (nj - 1) * 6);
  let t = 0;
  for (let i = 0; i < ni - 1; i++) {
    for (let j = 0; j < nj - 1; j++) {
      const a = i * nj + j, b = i * nj + j + 1, c = (i + 1) * nj + j, d = (i + 1) * nj + j + 1;
      idx[t++] = a; idx[t++] = b; idx[t++] = c;
      idx[t++] = b; idx[t++] = d; idx[t++] = c;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function makeGroundTextures(layout, renderer) {
  const ground = new THREE.CanvasTexture(layout.groundCanvas);
  ground.colorSpace = THREE.SRGBColorSpace;
  ground.flipY = false;
  ground.anisotropy = renderer.capabilities.getMaxAnisotropy();
  ground.minFilter = THREE.LinearMipmapLinearFilter;
  ground.magFilter = THREE.LinearFilter;
  const mask = new THREE.CanvasTexture(layout.maskCanvas);
  mask.colorSpace = THREE.NoColorSpace;
  mask.flipY = false;
  mask.anisotropy = 4;
  return { ground, mask };
}

export function terrainMaterial(textures, key = 'terrain') {
  return toonMaterial(
    { vertexColors: true },
    {
      key,
      uniforms: {
        uGround: { value: textures.ground },
        uMask: { value: textures.mask },
        uGroundMin: { value: GROUND.min },
        uGroundSize: { value: GROUND.size },
      },
      fragPars: /* glsl */ `
        uniform sampler2D uGround;
        uniform sampler2D uMask;
        uniform float uGroundMin;
        uniform float uGroundSize;
      `,
      fragColor: /* glsl */ `
        vec2 guv = (vSWPos.xz - uGroundMin) / uGroundSize;
        float gIn = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
        vec2 gc = clamp(guv, 0.0, 1.0);
        vec4 gTex = texture2D(uGround, gc);
        vec4 gMask = texture2D(uMask, gc) * gIn;
        float bn = sFbm(vSWPos.xz * 0.035);
        float bn2 = sNoise(vSWPos.xz * 0.55);
        float bn3 = sNoise(vSWPos.xz * 2.7);
        vec3 baseC = diffuseColor.rgb * (0.8 + 0.4 * bn) * (0.93 + 0.14 * bn2);
        // brush-stroke grass texture, fading out with distance
        float camD = length(vSWPos - cameraPosition);
        float nearF = smoothstep(260.0, 20.0, camD);
        if (nearF > 0.0) {
          vec2 sp = vSWPos.xz;
          float st = sNoise(vec2(sp.x * 0.9 + sp.y * 0.35, sp.y * 3.2 - sp.x * 0.9));
          float st2 = sNoise(vec2(sp.x * 2.6 - sp.y * 0.8, sp.y * 7.5 + sp.x * 1.7));
          float tuft = smoothstep(0.45, 0.9, st) * 0.18 - smoothstep(0.55, 0.1, st2) * 0.14;
          baseC *= 1.0 + tuft * nearF;
        }
        vec3 paintC = gTex.rgb * (0.94 + 0.08 * bn2 + 0.05 * bn3);
        // rice leaves catch light in tufts
        paintC *= 1.0 + gMask.r * (bn3 - 0.5) * 0.18;
        diffuseColor.rgb = mix(baseC, paintC, gTex.a * gIn);
      `,
      fragOutput: /* glsl */ `
        {
          float wet = gMask.g;
          if (wet > 0.02) {
            vec3 V = normalize(cameraPosition - vSWPos);
            vec2 rp = vSWPos.xz * 0.35 + vec2(uTime * 0.25, uTime * 0.1);
            vec2 rip = vec2(sNoise(rp) - 0.5, sNoise(rp + 13.7) - 0.5) * 0.18;
            vec3 Nw = normalize(vec3(rip.x, 1.0, rip.y));
            float fres = pow(1.0 - clamp(dot(Nw, V), 0.0, 1.0), 4.0);
            vec3 R = reflect(-V, Nw);
            vec3 skyC = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
            vec3 wc = mix(uWaterDeep * 0.8 + vec3(0.02, 0.04, 0.01), skyC * 0.8, 0.25 + 0.55 * fres);
            float sp = pow(max(dot(R, uLightDir), 0.0), 220.0) * 18.0;
            outgoingLight = mix(outgoingLight, wc + uLightColor * sp, wet);
          }
        }
      `,
    }
  );
}

export function buildTerrain(layout, renderer, quality = 'high') {
  const group = new THREE.Group();
  group.name = 'terrain';
  const textures = makeGroundTextures(layout, renderer);
  const material = terrainMaterial(textures);

  const rs = radialSamples(quality);
  const A = quality === 'low' ? 512 : 1024;
  const G = SITES.shintai;
  const grid = buildGrid({
    rs, A, heightFn: terrainHeight, townDensity: layout.townDensity,
    lowerFn: (x, z) => 6 * smooth(232, 216, Math.hypot(x - G.x, z - G.z)),
  });

  const bandIdx = (r) => rs.findIndex((v) => v >= r);
  const bands = [[0, bandIdx(1450), true], [bandIdx(1450), bandIdx(3300), true], [bandIdx(3300), rs.length - 1, false]];
  const sectors = quality === 'low' ? 16 : 32;
  const per = A / sectors;
  for (const [i0, i1, cast] of bands) {
    for (let s = 0; s < sectors; s++) {
      const geo = chunkGeometry(grid, i0, i1, s * per, (s + 1) * per);
      const m = new THREE.Mesh(geo, material);
      m.castShadow = cast;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
    }
  }

  // High-resolution patch for the go-shintai caldera.
  const prs = [];
  for (let r = 0; r <= 240; r += quality === 'low' ? 3 : 1.6) prs.push(r);
  const patchGrid = buildGrid({ rs: prs, A: quality === 'low' ? 128 : 256, cx: G.x, cz: G.z, heightFn: terrainHeight, townDensity: layout.townDensity });
  const patchGeo = chunkGeometry(patchGrid, 0, prs.length - 1, 0, patchGrid.cols - 1);
  const patchMat = terrainMaterial(textures, 'terrain-patch');
  patchMat.polygonOffset = true;
  patchMat.polygonOffsetFactor = -2;
  patchMat.polygonOffsetUnits = -4;
  const patch = new THREE.Mesh(patchGeo, patchMat);
  patch.receiveShadow = true;
  patch.castShadow = true;
  group.add(patch);

  return { group, material, textures };
}

export { U };
