// Painterly foliage: a procedurally painted atlas (leaf clumps + cedar
// sprays) and card-based tree geometry that uses it. Cards carry soft,
// crown-shaped normals so a whole tree shades like one painted mass while the
// alpha-tested edges give the ragged, leafy silhouette of anime backgrounds.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

// Atlas layout (512 x 256, v = 0 at the top row):
//   A  [0,256) x [0,256)     leaf clump
//   B  [256,512) x [0,224)   cedar spray (fan, narrow at the top)
//   C  [480,512) x [224,256) solid white (trunks, cores)
export const ATLAS = {
  W: 512,
  H: 256,
  leaf: [0, 0, 0.5, 1],
  spray: [0.5, 0, 1, 224 / 256],
  solid: [(480 + 8) / 512, (224 + 8) / 256, (512 - 8) / 512, (256 - 8) / 256],
};

let atlasTex = null;

export function getFoliageAtlas(renderer) {
  if (atlasTex) return atlasTex;
  const cv = document.createElement('canvas');
  cv.width = ATLAS.W;
  cv.height = ATLAS.H;
  const ctx = cv.getContext('2d');
  const rand = mulberry32(1234);
  const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

  // --- A: leaf clump -------------------------------------------------------
  {
    const cx = 128, cy = 132;
    // dark under-layer gives body and depth between the leaves
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 70;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, 16 + rand() * 12, 13 + rand() * 9, rand() * 3, 0, Math.PI * 2);
      ctx.fillStyle = grey(118 + rand() * 30);
      ctx.fill();
    }
    // leaves, lighter towards the top so the clump reads as lit from above
    for (let i = 0; i < 420; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.pow(rand(), 0.6) * 104;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.92;
      if (Math.hypot(x - cx, y - cy) > 118) continue;
      const top = 1 - (y - 20) / 220;
      const v = 150 + rand() * 70 + top * 40;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (rand() - 0.5) * 1.2);
      ctx.beginPath();
      const lw = 7 + rand() * 6, lh = 3.2 + rand() * 2.6;
      ctx.moveTo(-lw, 0);
      ctx.quadraticCurveTo(0, -lh * 1.6, lw, 0);
      ctx.quadraticCurveTo(0, lh * 1.6, -lw, 0);
      ctx.fillStyle = grey(Math.min(255, v));
      ctx.fill();
      ctx.restore();
    }
  }

  // --- B: cedar spray --------------------------------------------------------
  {
    const ox = 256 + 128, oy = 4, H = 216;
    // body: a jagged fan
    ctx.beginPath();
    ctx.moveTo(ox - 6, oy);
    const teeth = 9;
    for (let i = 0; i <= teeth * 2; i++) {
      const t = i / (teeth * 2);
      const x = ox - 118 + t * 236;
      const y = oy + H * (i % 2 ? 0.8 : 0.98) - Math.abs(t - 0.5) * 50 + (rand() - 0.5) * 10;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(ox + 6, oy);
    ctx.closePath();
    ctx.fillStyle = grey(176);
    ctx.fill();
    // branchlets with needle tufts
    const branches = 11;
    for (let b = 0; b < branches; b++) {
      const ang = (-0.72 + (1.44 * b) / (branches - 1)) + (rand() - 0.5) * 0.08;
      const len = H * (0.82 + rand() * 0.18) / Math.cos(ang * 0.7);
      const ex = ox + Math.sin(ang) * len, ey = oy + Math.cos(ang) * len * 0.98;
      const steps = 22;
      for (let s = 2; s < steps; s++) {
        const t = s / steps;
        const px = ox + (ex - ox) * t, py = oy + (ey - oy) * t;
        const tl = 6 + t * 14;
        for (const side of [-1, 1]) {
          if (rand() < 0.25) continue;
          const na = ang + side * (0.7 + rand() * 0.9);
          ctx.beginPath();
          ctx.moveTo(px + (rand() - 0.5) * 4, py + (rand() - 0.5) * 4);
          ctx.lineTo(px + Math.sin(na) * tl, py + Math.cos(na) * tl * 0.9 + 3 + rand() * 4);
          ctx.lineWidth = 3 + rand() * 2.5;
          ctx.strokeStyle = grey(196 + rand() * 50 + (1 - t) * 10);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.lineWidth = 3;
      ctx.strokeStyle = grey(160);
      ctx.stroke();
    }
  }

  // --- C: solid ---------------------------------------------------------------
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(480, 224, 32, 32);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  atlasTex = tex;
  return tex;
}

// ---------------------------------------------------------------------------

class CardBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  vert(p, n, c, uv) {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0], n[1], n[2]);
    if (typeof c === 'number') this.c.push(c, c, c); else this.c.push(c[0], c[1], c[2]);
    this.uv.push(uv[0], uv[1]);
  }
  /** Double-sided quad with explicit shading normals (one per corner). */
  card(P, N, C, UV) {
    const order = [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]];
    for (const tri of order) for (const k of tri) this.vert(P[k], N[k], C[k], UV[k]);
  }
  tri(P, N, C, UV) { for (let k = 0; k < 3; k++) this.vert(P[k], N[k], C[k], UV[k]); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const BARK0 = [0.16, 0.085, 0.05];
const BARK1 = [0.24, 0.13, 0.075];

function addTrunk(cb, r0, r1, h, seg = 6) {
  const [u0, v0, u1, v1] = ATLAS.solid;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p00 = [Math.cos(a0) * r0, -1, Math.sin(a0) * r0], p01 = [Math.cos(a1) * r0, -1, Math.sin(a1) * r0];
    const p10 = [Math.cos(a0) * r1, h, Math.sin(a0) * r1], p11 = [Math.cos(a1) * r1, h, Math.sin(a1) * r1];
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    const uv = [u0, v0];
    cb.tri([p00, p10, p01], [n0, n0, n1], [BARK0, BARK1, BARK0], [uv, uv, uv]);
    cb.tri([p01, p10, p11], [n1, n0, n1], [BARK0, BARK1, BARK1], [uv, uv, uv]);
  }
}

/** Broadleaf crown made of ~40 leaf-clump cards around a soft ellipsoid. */
export function broadleafCards(seed = 1, { cards = 40, radius = 3.0, height = 5.6 } = {}) {
  const rand = mulberry32(seed);
  const cb = new CardBuilder();
  addTrunk(cb, 0.32, 0.2, height - 1.0, 6);
  // a few branches into the crown
  const [su, sv] = ATLAS.solid;
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const p0 = [0, height - 2.6, 0], p1 = [Math.cos(a) * 1.8, height + 0.2, Math.sin(a) * 1.8];
    const side = norm(cross([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [0, 1, 0]));
    const w = 0.12;
    const P = [[p0[0] - side[0] * w, p0[1], p0[2] - side[2] * w], [p0[0] + side[0] * w, p0[1], p0[2] + side[2] * w], [p1[0] + side[0] * w * 0.4, p1[1], p1[2] + side[2] * w * 0.4], [p1[0] - side[0] * w * 0.4, p1[1], p1[2] - side[2] * w * 0.4]];
    const nn = [Math.cos(a), 0.3, Math.sin(a)];
    cb.card(P, [nn, nn, nn, nn], [BARK0, BARK0, BARK1, BARK1], [[su, sv], [su, sv], [su, sv], [su, sv]]);
  }
  const C = [0, height, 0];
  const [lu0, lv0, lu1, lv1] = ATLAS.leaf;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < cards; i++) {
    const inner = i < 7;
    let d;
    if (inner) {
      d = norm([rand() - 0.5, rand() - 0.3, rand() - 0.5]);
    } else {
      const k = i - 7, n = cards - 7;
      const y = 1 - ((k + 0.5) / n) * 1.75; // keep the underside sparse
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = k * golden;
      d = norm([Math.cos(th) * r + (rand() - 0.5) * 0.2, y, Math.sin(th) * r + (rand() - 0.5) * 0.2]);
    }
    const dist = inner ? radius * 0.35 : radius * (0.62 + 0.3 * rand());
    const center = [C[0] + d[0] * dist, C[1] + d[1] * dist * 0.85, C[2] + d[2] * dist];
    // card plane faces roughly outwards, with a random tilt so edge-on cards are rare
    const face = norm([d[0] + (rand() - 0.5) * 0.9, d[1] * 0.6 + (rand() - 0.3) * 0.6, d[2] + (rand() - 0.5) * 0.9]);
    let t1 = norm(cross(face, Math.abs(face[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    let t2 = norm(cross(face, t1));
    const rot = rand() * Math.PI * 2;
    const c = Math.cos(rot), s = Math.sin(rot);
    const a1 = [t1[0] * c + t2[0] * s, t1[1] * c + t2[1] * s, t1[2] * c + t2[2] * s];
    const a2 = [t2[0] * c - t1[0] * s, t2[1] * c - t1[1] * s, t2[2] * c - t1[2] * s];
    const half = (inner ? 1.6 : 1.25 + rand() * 0.7) * (radius / 3.0);
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [
      center[0] + (a1[0] * x + a2[0] * y) * half,
      center[1] + (a1[1] * x + a2[1] * y) * half,
      center[2] + (a1[2] * x + a2[2] * y) * half,
    ]);
    // crown-shaped normals per corner (blend of crown direction + corner offset)
    const N = P.map((p) => norm([(p[0] - C[0]) * 0.8 + d[0] * 0.6, (p[1] - C[1]) * 0.8 + d[1] * 0.6 + 0.35, (p[2] - C[2]) * 0.8 + d[2] * 0.6]));
    const Cc = P.map((p) => 0.5 + 0.5 * Math.min(1, Math.max(0, (p[1] - (C[1] - radius)) / (radius * 1.8))) * (inner ? 0.7 : 1));
    const UV = [[lu0, lv1], [lu1, lv1], [lu1, lv0], [lu0, lv0]];
    cb.card(P, N, Cc, UV);
  }
  return cb.build();
}

/** Japanese cedar: drooping tiers of needle-spray cards around a dark core. */
export function cedarCards(seed = 3, { tiers = 5, perTier = 7, trunk = 4.5, crownStart = 2.4, crownLen = 11.5, radius = 3.2 } = {}) {
  const rand = mulberry32(seed);
  const cb = new CardBuilder();
  addTrunk(cb, trunk > 6 ? 0.55 : 0.32, trunk > 6 ? 0.32 : 0.2, trunk, 6);
  const [su0, sv0] = ATLAS.solid;
  const [bu0, bv0, bu1, bv1] = ATLAS.spray;
  for (let t = 0; t < tiers; t++) {
    const f = t / Math.max(1, tiers - 1);
    const y0 = crownStart + t * (crownLen / tiers);
    const h = ((6.4 - f * 2.6) * (4 / tiers) + 1.2) * (crownLen / 11.5);
    const r = radius - f * radius * 0.62;
    // dark core cone so the crown never looks hollow
    const seg = 6;
    const tip = [0, y0 + h * 0.95, 0];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2 + t, a1 = ((i + 1) / seg) * Math.PI * 2 + t;
      const rc = r * 0.55;
      const p0 = [Math.cos(a0) * rc, y0 + 0.2, Math.sin(a0) * rc], p1 = [Math.cos(a1) * rc, y0 + 0.2, Math.sin(a1) * rc];
      const n0 = norm([Math.cos(a0), 0.6, Math.sin(a0)]), n1 = norm([Math.cos(a1), 0.6, Math.sin(a1)]);
      cb.tri([p0, tip, p1], [n0, [0, 1, 0], n1], [0.55, 0.8, 0.55], [[su0, sv0], [su0, sv0], [su0, sv0]]);
    }
    // needle-spray skirt
    for (let j = 0; j < perTier; j++) {
      const a = (j / perTier) * Math.PI * 2 + t * 0.9 + (rand() - 0.5) * 0.3;
      const ca = Math.cos(a), sa = Math.sin(a);
      const tan = [-sa, 0, ca];
      const rr = r * (0.95 + rand() * 0.3);
      const droop = 0.35 + rand() * 0.7;
      const top = [ca * r * 0.06, y0 + h * 0.9, sa * r * 0.06];
      const bot = [ca * rr, y0 - droop, sa * rr];
      const wTop = 0.35, wBot = (Math.PI * 2 * rr) / perTier * 0.95;
      const P = [
        [bot[0] - tan[0] * wBot, bot[1], bot[2] - tan[2] * wBot],
        [bot[0] + tan[0] * wBot, bot[1], bot[2] + tan[2] * wBot],
        [top[0] + tan[0] * wTop, top[1], top[2] + tan[2] * wTop],
        [top[0] - tan[0] * wTop, top[1], top[2] - tan[2] * wTop],
      ];
      const nOut = norm([ca * 0.85, 0.55, sa * 0.85]);
      const N = [norm([nOut[0] - tan[0] * 0.3, nOut[1], nOut[2] - tan[2] * 0.3]), norm([nOut[0] + tan[0] * 0.3, nOut[1], nOut[2] + tan[2] * 0.3]), [0, 1, 0], [0, 1, 0]];
      const cBot = 0.72 + 0.12 * f, cTop = 1.0;
      const UV = [[bu0, bv1], [bu1, bv1], [bu0 + (bu1 - bu0) * 0.56, bv0], [bu0 + (bu1 - bu0) * 0.44, bv0]];
      cb.card(P, N, [cBot, cBot, cTop, cTop], UV);
    }
  }
  return cb.build();
}
