// Forests of Japanese cedar (杉) on the slopes, rounded broadleaf trees in the
// town, a sacred grove around the shrine and the great tree of the go-shintai.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { toonMaterial } from '../core/materials.js';
import { terrainHeight, terrainNormal, shoreDistance, SITES, SITE_HEIGHTS, SHINTAI_FLOOR, LAKE_R, STAIRS } from './heightfield.js';
import { forestDensity } from './terrain.js';
import { OCC } from './layout.js';
import { getFoliageAtlas, broadleafCards, cedarCards } from './foliage.js';
import { makeShots } from '../core/shots.js';

// ---------------------------------------------------------------------------
// Geometry

const BARK0 = [0.16, 0.085, 0.05];
const BARK1 = [0.24, 0.13, 0.075];

function cedarGeometry(tiers = 4, seg = 9, rand = mulberry32(3), { trunk = 4.5, crownStart = 2.4, crownLen = 11.5, radius = 3.2 } = {}) {
  const pos = [], nor = [], col = [], idx = [];
  let base = 0;
  const push = (x, y, z, nx, ny, nz, c) => { pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c, c, c); return base++; };
  const pushC = (x, y, z, nx, ny, nz, c) => { pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); return base++; };
  // trunk
  {
    const r0 = trunk > 6 ? 0.55 : 0.32, r1 = trunk > 6 ? 0.32 : 0.2, h = trunk;
    const ring0 = [], ring1 = [];
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ring0.push(pushC(Math.cos(a) * r0, -1.0, Math.sin(a) * r0, Math.cos(a), 0, Math.sin(a), BARK0));
      ring1.push(pushC(Math.cos(a) * r1, h, Math.sin(a) * r1, Math.cos(a), 0, Math.sin(a), BARK1));
    }
    for (let i = 0; i < 5; i++) idx.push(ring0[i], ring1[i], ring0[i + 1], ring0[i + 1], ring1[i], ring1[i + 1]);
  }
  // stacked, drooping skirts of foliage
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y0 = crownStart + t * (crownLen / tiers);
    const h = ((6.4 - f * 2.6) * (4 / tiers) + 1.2) * (crownLen / 11.5);
    const r = (radius - f * radius * 0.6) * (1 - 0.08 * Math.sin(t * 2.3));
    const tip = push(0, y0 + h, 0, 0, 1, 0, 1.0);
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2 + t * 0.7;
      const rr = r * (i % 2 ? 0.62 + 0.15 * rand() : 0.9 + 0.3 * rand());
      const droop = (rand() - 0.5) * 0.7 - (i % 2 ? -0.25 : 0.45);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      // soft normals: blend the cone normal with a spherical one around the crown
      const nx = Math.cos(a) * 0.85, ny = 0.55, nz = Math.sin(a) * 0.85;
      const l = Math.hypot(nx, ny, nz);
      ring.push(push(x, y0 + droop, z, nx / l, ny / l, nz / l, 0.55 + 0.15 * f));
    }
    // underside centre to close the cone
    const under = push(0, y0 + 0.8, 0, 0, -1, 0, 0.3);
    for (let i = 0; i < seg; i++) {
      idx.push(ring[i], tip, ring[i + 1]);
      idx.push(ring[i], ring[i + 1], under);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function cedarLowGeometry() {
  // two stacked open cones: a cheap but recognisably tiered cedar for distant ridges
  const parts = [[3.4, 8.5, 1.2], [2.3, 7.0, 6.6]].map(([r, h, y]) => {
    const g = new THREE.ConeGeometry(r, h, 6, 1, true);
    g.translate(0, y + h / 2, 0);
    return g.toNonIndexed();
  });
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++, o++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      P.set([x, y, z], o * 3);
      const l = Math.hypot(x, 1.8, z) || 1;
      N.set([x / l, 1.8 / l, z / l], o * 3);
      const c = 0.45 + 0.55 * Math.min(1, Math.max(0, (y - 1) / 13));
      Cc.set([c, c, c], o * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  return g;
}

// ---------------------------------------------------------------------------

const CEDAR_COLORS = ['#244f31', '#21482d', '#2c5835', '#275238', '#335e33', '#1f432e', '#386338', '#2a4f3c'];
const LEAF_COLORS = ['#4f8f32', '#5d9c38', '#6aa83d', '#468734', '#7aae42', '#3f7c35', '#5a9a3c', '#86b445'];
const AUTUMN = ['#a8862e', '#b48f3a', '#9a5a30', '#b89a42'];

// keep a little clearing around every preset camera position
let CLEAR = [];
const clearOf = (x, z) => { for (const c of CLEAR) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r2) return false; return true; };

class Scatter {
  constructor(chunk = 600) { this.chunk = chunk; this.cells = new Map(); }
  add(x, y, z, s, rotY, color, tiltX = 0, tiltZ = 0) {
    if (!clearOf(x, z)) return;
    const key = `${Math.floor(x / this.chunk)},${Math.floor(z / this.chunk)}`;
    let c = this.cells.get(key);
    if (!c) { c = []; this.cells.set(key, c); }
    c.push({ x, y, z, s, rotY, color, tiltX, tiltZ });
  }
  get count() { let n = 0; for (const c of this.cells.values()) n += c.length; return n; }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function toMeshes(scatter, geometry, material, { castShadow = false, shadowRadius = 1600, receive = true } = {}) {
  const meshes = [];
  for (const [key, list] of scatter.cells) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((t, i) => {
      _e.set(t.tiltX, t.rotY, t.tiltZ);
      _q.setFromEuler(_e);
      _s.set(t.s, t.s * (0.9 + ((i * 7919) % 100) / 500), t.s);
      _m.compose(_v.set(t.x, t.y, t.z), _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(t.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    const [cx, cz] = key.split(',').map(Number);
    const mx = (cx + 0.5) * scatter.chunk, mz = (cz + 0.5) * scatter.chunk;
    mesh.castShadow = castShadow && Math.hypot(mx, mz) < shadowRadius;
    mesh.receiveShadow = receive;
    meshes.push(mesh);
  }
  return meshes;
}

export function buildVegetation(layout, quality = 'high', renderer = null) {
  const rand = mulberry32(31415);
  const group = new THREE.Group();
  group.name = 'vegetation';
  CLEAR = makeShots().filter((s) => s.pos.y < 200).map((s) => ({ x: s.pos.x, z: s.pos.z, r2: 11 * 11 }));
  const hi = quality !== 'low';
  const occ = layout.occ;

  const cedarsNear = new Scatter(500);
  const cedarsMid = new Scatter(600);
  const cedarsFar = new Scatter(900);
  const broad = new Scatter(500);

  const pickCol = (arr) => arr[Math.floor(rand() * arr.length)];

  // --- forest scatter: jittered grid, spacing grows with distance
  const bands = hi
    ? [[560, 1250, 14, cedarsNear, 1.1], [1250, 1900, 19, cedarsMid, 1.3], [1900, 2900, 27, cedarsFar, 1.65], [2900, 4000, 38, cedarsFar, 2.1], [4000, 5200, 52, cedarsFar, 2.7]]
    : [[560, 1200, 19, cedarsNear, 1.25], [1200, 2600, 30, cedarsFar, 1.6], [2600, 4000, 48, cedarsFar, 2.3]];
  for (const [r0, r1, sp, target, sc] of bands) {
    for (let z = -r1; z < r1; z += sp) {
      for (let x = -r1; x < r1; x += sp) {
        const jx = x + (rand() - 0.5) * sp * 0.9, jz = z + (rand() - 0.5) * sp * 0.9;
        const r = Math.hypot(jx, jz);
        if (r < r0 || r >= r1) continue;
        if (occ.get(jx, jz) !== OCC.FREE) continue;
        const n = terrainNormal(jx, jz, 3);
        const slope = 1 - n.y;
        const f = forestDensity(jx, jz, slope, layout.townDensity);
        if (f < 0.05 || rand() > f) continue;
        if (slope > 0.75) continue;
        const y = terrainHeight(jx, jz);
        const mixed = target === cedarsNear && rand() < 0.22 * (1 - f * 0.5);
        if (mixed) {
          const autumn = rand() < 0.03;
          broad.add(jx, y - 0.3, jz, (0.95 + rand() * 0.7) * sc, rand() * 6.28, autumn ? pickCol(AUTUMN) : pickCol(LEAF_COLORS));
        } else {
          target.add(jx, y - 0.5, jz, (0.75 + rand() * 0.65) * sc * (0.9 + f * 0.25), rand() * 6.28, pickCol(CEDAR_COLORS), (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.06);
        }
      }
    }
  }

  // --- town trees: yards, roadsides, lake shore
  for (const t of layout.yardTrees) {
    const y = terrainHeight(t.x, t.z);
    broad.add(t.x, y - 0.2, t.z, t.s * 1.1, rand() * 6.28, rand() < 0.06 ? pickCol(AUTUMN) : pickCol(LEAF_COLORS));
  }
  for (let k = 0; k < (hi ? 2600 : 1200); k++) {
    const th = rand() * Math.PI * 2 - Math.PI;
    const r = LAKE_R + 8 + rand() * 520;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (occ.get(x, z) !== OCC.FREE && occ.get(x, z) !== OCC.YARD) continue;
    const s = shoreDistance(x, z);
    if (s < 4) continue;
    const dens = layout.townDensity(x, z);
    const pShore = s < 16 ? 0.35 : 0;
    if (rand() > dens * 0.45 + pShore) continue;
    broad.add(x, terrainHeight(x, z) - 0.2, z, 0.6 + rand() * 0.7, rand() * 6.28, rand() < 0.07 ? pickCol(AUTUMN) : pickCol(LEAF_COLORS));
  }
  // trees around the school plateau rim
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const r = SITES.school.r + 6 + rand() * 6;
    const x = SITES.school.x + Math.cos(a) * r, z = SITES.school.z + Math.sin(a) * r;
    if (occ.get(x, z) === OCC.ROAD) continue;
    broad.add(x, terrainHeight(x, z) - 0.2, z, 0.75 + rand() * 0.35, rand() * 6.28, pickCol(LEAF_COLORS));
  }

  // --- sacred cedar grove on the shrine hill (big, old trees)
  const grove = new Scatter(500);
  for (let k = 0; k < 260; k++) {
    const a = rand() * Math.PI * 2;
    const r = SITES.shrine.r + 6 + rand() * 90;
    const x = SITES.shrine.x + Math.cos(a) * r, z = SITES.shrine.z + Math.sin(a) * r;
    if (occ.get(x, z) !== OCC.FREE) continue;
    grove.add(x, terrainHeight(x, z) - 0.6, z, 1.45 + rand() * 0.6, rand() * 6.28, pickCol(CEDAR_COLORS));
  }
  // and along both sides of the stairway
  for (let k = 0; k < 70; k++) {
    const t = rand();
    const side = rand() < 0.5 ? -1 : 1;
    const off = side * (6 + rand() * 18);
    const { a, dir, len } = STAIRS;
    const x = a.x + dir.x * len * t - dir.z * off, z = a.z + dir.z * len * t + dir.x * off;
    if (occ.get(x, z) !== OCC.FREE) continue;
    grove.add(x, terrainHeight(x, z) - 0.6, z, 1.3 + rand() * 0.6, rand() * 6.28, pickCol(CEDAR_COLORS));
  }

  // --- materials
  // break up flat facets with world-space "leaf clump" noise
  const clump = /* glsl */ `
    float lc = sNoise(vSWPos.xz * 0.9 + vSWPos.y * 0.7) * 0.6 + sNoise(vSWPos.xz * 2.3 - vSWPos.y * 1.9) * 0.4;
    diffuseColor.rgb *= 0.78 + 0.42 * lc;
  `;
  const cedarMat = toonMaterial({ vertexColors: true }, { key: 'cedar', wind: 0.6, rim: 0.9, trunk: true, fragColor: clump });

  // near trees are painted cards (alpha-tested leaf / needle sprays)
  const atlas = getFoliageAtlas(renderer);
  const softClump = /* glsl */ `
    float lc = sNoise(vSWPos.xz * 0.6 + vSWPos.y * 0.5);
    diffuseColor.rgb *= 0.88 + 0.24 * lc;
  `;
  const cardParams = { vertexColors: true, map: atlas, alphaTest: 0.42, alphaToCoverage: hi };
  const cedarCardMat = toonMaterial(cardParams, { key: 'cedar-card', wind: 0.6, rim: 0.9, trunk: true, fragColor: softClump });
  const leafMat = toonMaterial(cardParams, { key: 'leaf-card', wind: 1.0, rim: 1.1, trunk: true, fragColor: softClump });

  const cedarGeo = cedarCards(3, { tiers: hi ? 5 : 4, perTier: hi ? 7 : 6 });
  const cedarMid = cedarGeometry(3, 7, mulberry32(5));
  // old sacred cedars: tall bare trunks, crown high above the stairs
  const cedarTall = cedarCards(9, { tiers: hi ? 6 : 4, perTier: hi ? 8 : 6, trunk: 15, crownStart: 9.5, crownLen: 9.5, radius: 2.8 });
  const cedarLow = cedarLowGeometry();
  const leafGeo = broadleafCards(7, { cards: hi ? 40 : 26 });

  for (const m of toMeshes(cedarsNear, cedarGeo, cedarCardMat, { castShadow: true, shadowRadius: 1500 })) group.add(m);
  for (const m of toMeshes(cedarsMid, cedarMid, cedarMat, { castShadow: true, shadowRadius: 1700 })) group.add(m);
  for (const m of toMeshes(grove, cedarTall, cedarCardMat, { castShadow: true })) group.add(m);
  for (const m of toMeshes(cedarsFar, cedarLow, cedarMat, { castShadow: false, receive: false })) group.add(m);
  for (const m of toMeshes(broad, leafGeo, leafMat, { castShadow: true, shadowRadius: 1500 })) group.add(m);

  // --- the great tree in the go-shintai caldera
  {
    const G = SITES.shintai;
    const big = new THREE.Mesh(broadleafCards(99, { cards: 70, radius: 3.4, height: 5.2 }), leafMat);
    big.position.set(G.x, SHINTAI_FLOOR + 9.5, G.z);
    big.scale.set(4.4, 3.8, 4.4);
    big.castShadow = true;
    big.receiveShadow = true;
    const c = new THREE.Color('#5f9a3a');
    const cols = big.geometry.attributes.color;
    for (let i = 0; i < cols.count; i++) cols.setXYZ(i, cols.getX(i) * c.r * 1.0, cols.getY(i) * c.g, cols.getZ(i) * c.b);
    group.add(big);
    // a few smaller trees on the caldera rim
    const rim = new Scatter(1000);
    const viewA = Math.atan2(G.z, G.x); // the shot looks from the far rim towards town
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, r = 150 + rand() * 25;
      if (Math.abs(Math.atan2(Math.sin(a - viewA), Math.cos(a - viewA))) < 0.5) continue;
      const x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r;
      rim.add(x, terrainHeight(x, z) - 0.4, z, 0.8 + rand() * 0.5, rand() * 6.28, pickCol(CEDAR_COLORS));
    }
    for (const m of toMeshes(rim, cedarGeo, cedarCardMat, { castShadow: true })) group.add(m);
  }

  return {
    group,
    stats: { near: cedarsNear.count, mid: cedarsMid.count, far: cedarsFar.count, grove: grove.count, broadleaf: broad.count },
  };
}

export { SITE_HEIGHTS };
