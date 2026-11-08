// Hand-placed meadows of 3D grass where the camera gets close: the school
// slopes, the shrine grounds, the lake shore by the pier, the main street
// verges and the grassy floor of the go-shintai caldera.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { toonMaterial } from '../core/materials.js';
import { terrainHeight, terrainNormal, shoreDistance, SITES, STAIRS, SHINTAI_MOAT, valleyCenterZ, lakeRadius } from './heightfield.js';
import { OCC } from './layout.js';

export const GRASS_LAYER = 1;

function clumpGeometry(blades = 5, rand = mulberry32(4)) {
  const pos = [], col = [], nor = [], tip = [];
  for (let b = 0; b < blades; b++) {
    const a = rand() * Math.PI * 2;
    const ox = Math.cos(a) * 0.18 * rand(), oz = Math.sin(a) * 0.18 * rand();
    const face = rand() * Math.PI;
    const fx = Math.cos(face), fz = Math.sin(face);
    const lean = 0.25 + rand() * 0.35;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    const h = 0.55 + rand() * 0.55;
    const w = 0.07 + rand() * 0.05;
    const P = (t, side) => {
      const ww = w * (1 - t) * side;
      const bend = t * t;
      return [ox + fx * ww + lx * bend * h, t * h, oz + fz * ww + lz * bend * h];
    };
    const seg = [0, 0.55, 1];
    for (let s = 0; s < 2; s++) {
      const t0 = seg[s], t1 = seg[s + 1];
      const a0 = P(t0, -1), b0 = P(t0, 1), a1 = P(t1, -1), b1 = P(t1, 1);
      const tri = (p, q, r, tp, tq, tr) => {
        pos.push(...p, ...q, ...r);
        tip.push(tp, tq, tr);
        for (const t of [tp, tq, tr]) { const c = 0.42 + 0.58 * t; col.push(c, c, c); nor.push(lx * 0.3, 1, lz * 0.3); }
      };
      if (s === 1) tri(a0, b0, a1, t0, t0, t1);
      else { tri(a0, b0, b1, t0, t0, t1); tri(a0, b1, a1, t0, t1, t1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.normalizeNormals();
  return g;
}

const GRASS_COLORS = ['#7fb43e', '#8cbf45', '#6fa83a', '#98c552', '#a6c75a', '#78ad40', '#b3c35e'];

export function buildGrass(layout, quality = 'high') {
  const group = new THREE.Group();
  group.name = 'grass';
  const rand = mulberry32(2718);
  const occ = layout.occ;
  const hi = quality !== 'low';
  const spacing = hi ? 1.9 : 2.8;

  const zones = [];
  const S = SITES.school;
  zones.push({ name: 'school', test: (x, z) => { const d = Math.hypot(x - S.x, z - S.z); return d < 215; }, bbox: [S.x - 215, S.z - 215, S.x + 215, S.z + 215] });
  const Sh = SITES.shrine;
  zones.push({ name: 'shrine', test: (x, z) => Math.hypot(x - Sh.x, z - Sh.z) < 75 || distToSeg(x, z, STAIRS.a, STAIRS.b) < 16, bbox: [Math.min(Sh.x, STAIRS.a.x) - 80, Math.min(Sh.z, STAIRS.a.z) - 80, Math.max(Sh.x, STAIRS.a.x) + 80, Math.max(Sh.z, STAIRS.a.z) + 80] });
  const pTh = 0.36, pR = lakeRadius(pTh);
  const pc = { x: Math.cos(pTh) * pR, z: Math.sin(pTh) * pR };
  zones.push({ name: 'shore', test: (x, z) => Math.hypot(x - pc.x, z - pc.z) < 160 && shoreDistance(x, z) < 40, bbox: [pc.x - 160, pc.z - 160, pc.x + 160, pc.z + 160] });
  zones.push({ name: 'street', test: (x, z) => x > 600 && x < 980 && Math.abs(z - (valleyCenterZ(x) + 72)) < 34, bbox: [600, valleyCenterZ(800) + 20, 980, valleyCenterZ(800) + 130] });
  const G = SITES.shintai;
  zones.push({
    name: 'caldera',
    test: (x, z) => {
      const d = Math.hypot(x - G.x, z - G.z);
      return d < 170 && (d < SHINTAI_MOAT.inner - 3 || d > SHINTAI_MOAT.outer + 3) && d > 14;
    },
    bbox: [G.x - 170, G.z - 170, G.x + 170, G.z + 170],
    big: true,
  });

  const geo = clumpGeometry(4);
  const mat = toonMaterial(
    { vertexColors: true },
    {
      key: 'grass',
      rim: 0.8,
      vertexPars: /* glsl */ `attribute float aTip;`,
      vertexMain: /* glsl */ `
        {
          vec3 ip = instanceMatrix[3].xyz;
          float dc = distance(ip, cameraPosition);
          float fade = smoothstep(190.0, 120.0, dc);
          float w = sin(uTime * 1.7 + ip.x * 0.21 + ip.z * 0.17) * 0.6 + sin(uTime * 3.1 + ip.x * 0.5) * 0.25;
          transformed.x += w * aTip * aTip * 0.22 * uWind;
          transformed.z += w * aTip * aTip * 0.12 * uWind;
          transformed *= fade;
        }
      `,
    }
  );

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  let total = 0;
  for (const zn of zones) {
    const items = [];
    const [x0, z0, x1, z1] = zn.bbox;
    for (let z = z0; z < z1; z += spacing) {
      for (let x = x0; x < x1; x += spacing) {
        const jx = x + (rand() - 0.5) * spacing, jz = z + (rand() - 0.5) * spacing;
        if (!zn.test(jx, jz)) continue;
        const o = occ.get(jx, jz);
        if (!zn.big && o !== OCC.FREE && o !== OCC.YARD) continue;
        if (shoreDistance(jx, jz) < 3) continue;
        const n = terrainNormal(jx, jz, 1.5);
        if (n.y < 0.55) continue;
        items.push({ x: jx, z: jz, y: terrainHeight(jx, jz) - 0.05, s: (zn.big ? 0.9 : 0.75) + rand() * 0.6, r: rand() * Math.PI * 2 });
      }
    }
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      _q.setFromAxisAngle(up, it.r);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.s, it.s * (0.8 + rand() * 0.6), it.s));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(GRASS_COLORS[Math.floor(rand() * GRASS_COLORS.length)]));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.layers.set(GRASS_LAYER);
    mesh.name = 'grass-' + zn.name;
    group.add(mesh);
    total += items.length;
  }
  return { group, count: total };
}

function distToSeg(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}
