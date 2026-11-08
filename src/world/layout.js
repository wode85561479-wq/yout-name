// Town planning for Itomori: roads, house plots, paddies, special sites and
// the painted ground texture. Everything is seeded and deterministic.

import { mulberry32, smooth } from '../core/noise.js';
import { ERA, CRATER2, craterDist } from '../core/era.js';
import {
  terrainHeight, lakeRadius, flatWidth, valleyCenterZ, shoreDistance,
  SITES, STAIRS, LAKE_R,
} from './heightfield.js';

export const GROUND = { min: -1700, size: 3400 };

export const OCC = { FREE: 0, ROAD: 1, BUILDING: 2, PADDY: 3, SPECIAL: 4, YARD: 5, WATER: 6, FIELD: 7 };

class Occupancy {
  constructor(min, size, cell) {
    this.min = min; this.size = size; this.cell = cell;
    this.n = Math.ceil(size / cell);
    this.data = new Uint8Array(this.n * this.n);
  }
  get(x, z) {
    const i = Math.floor((x - this.min) / this.cell);
    const j = Math.floor((z - this.min) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    return this.data[j * this.n + i];
  }
  set(x, z, v) {
    const i = Math.floor((x - this.min) / this.cell);
    const j = Math.floor((z - this.min) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return;
    this.data[j * this.n + i] = v;
  }
  /** Rasterise an oriented rectangle. `onlyFree` keeps existing marks. */
  markRect(cx, cz, w, d, rot, v, onlyFree = false) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ext = Math.hypot(w, d) / 2 + this.cell;
    for (let z = cz - ext; z <= cz + ext; z += this.cell * 0.7) {
      for (let x = cx - ext; x <= cx + ext; x += this.cell * 0.7) {
        const dx = x - cx, dz = z - cz;
        const lx = dx * c + dz * s, lz = -dx * s + dz * c;
        if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) {
          if (!onlyFree || this.get(x, z) === 0) this.set(x, z, v);
        }
      }
    }
  }
  markCircle(cx, cz, r, v, onlyFree = false) {
    for (let z = cz - r; z <= cz + r; z += this.cell * 0.7) {
      for (let x = cx - r; x <= cx + r; x += this.cell * 0.7) {
        if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) {
          if (!onlyFree || this.get(x, z) === 0) this.set(x, z, v);
        }
      }
    }
  }
  markPolyline(pts, halfW, v) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.ceil(len / (this.cell * 0.7)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        this.markCircle(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, halfW, v);
      }
    }
  }
  rectFree(cx, cz, w, d, rot, allow = null) {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let iz = -2; iz <= 2; iz++) {
      for (let ix = -2; ix <= 2; ix++) {
        const lx = (ix / 2) * (w / 2), lz = (iz / 2) * (d / 2);
        const x = cx + lx * c - lz * s, z = cz + lx * s + lz * c;
        const o = this.get(x, z);
        if (o !== 0 && !(allow && allow.includes(o))) return false;
      }
    }
    return true;
  }
  isFree(x, z, r = 0) {
    if (this.get(x, z) !== 0) return false;
    if (r > 0) {
      if (this.get(x + r, z) !== 0 || this.get(x - r, z) !== 0) return false;
      if (this.get(x, z + r) !== 0 || this.get(x, z - r) !== 0) return false;
    }
    return true;
  }
}

const polar = (th, r) => ({ x: Math.cos(th) * r, z: Math.sin(th) * r });

function ringRoadPoint(th) {
  return polar(th, lakeRadius(th) + 22);
}

function arc(r, th0, th1, step = 0.02) {
  const pts = [];
  const n = Math.max(2, Math.ceil(Math.abs(th1 - th0) / step));
  for (let i = 0; i <= n; i++) pts.push(polar(th0 + ((th1 - th0) * i) / n, r));
  return pts;
}

function resample(pts, spacing) {
  const out = [pts[0]];
  let carry = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let t = spacing - carry;
    while (t <= len) {
      out.push({ x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len });
      t += spacing;
    }
    carry = len - (t - spacing);
  }
  return out;
}

/** Catmull-Rom smoothing for hand-authored road control points. */
function smoothPath(ctrl, perSeg = 8) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function slopeAcross(cx, cz, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  let lo = Infinity, hi = -Infinity;
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
    const h = terrainHeight(cx + lx * c - lz * s, cz + lx * s + lz * c);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return { lo, hi, diff: hi - lo };
}

// ---------------------------------------------------------------------------

export function buildLayout({ groundRes = 4096 } = {}) {
  const rand = mulberry32(20160826);
  const occ = new Occupancy(GROUND.min, GROUND.size, 2);
  const roads = []; // { pts, width, kind: 'main'|'street'|'lane'|'path', poles: bool, edgeLines: bool }
  const houses = [];
  const paddies = []; // { poly:[{x,z}x4], color, flooded }
  const fields = [];
  const yardTrees = [];
  const props = { poles: [], lamps: [], vending: null, bench: null, bridges: [] };

  // --- Rivers -------------------------------------------------------------
  const river = [];
  for (let x = LAKE_R - 30; x <= 1750; x += 12) river.push({ x, z: valleyCenterZ(x) });
  occ.markPolyline(river, 6, OCC.WATER);

  // --- Special sites --------------------------------------------------------
  occ.markCircle(SITES.school.x, SITES.school.z, SITES.school.r + 6, OCC.SPECIAL);
  if (ERA.after) {
    // the new crater lake swallowed the shrine and the heart of the old town
    occ.markCircle(CRATER2.x, CRATER2.z, CRATER2.R + 34, OCC.WATER);
  } else {
    occ.markCircle(SITES.shrine.x, SITES.shrine.z, SITES.shrine.r + 10, OCC.SPECIAL);
    // stairway corridor
    occ.markPolyline([STAIRS.a, STAIRS.b], 6, OCC.SPECIAL);
  }

  const subZ = valleyCenterZ(1130) - 175;
  const substation = { x: 1130, z: subZ, w: 72, d: 48, rot: 0.08 };
  occ.markRect(substation.x, substation.z, substation.w + 6, substation.d + 6, substation.rot, OCC.SPECIAL);

  const thHall = -0.42;
  const hallP = polar(thHall, lakeRadius(thHall) + 62);
  const townHall = { ...hallP, w: 38, d: 20, rot: -thHall + Math.PI / 2 };
  occ.markRect(townHall.x, townHall.z, townHall.w + 20, townHall.d + 26, townHall.rot, OCC.SPECIAL);

  // --- Roads ----------------------------------------------------------------
  const ring = [];
  for (let i = 0; i <= 360; i++) ring.push(ringRoadPoint((i / 360) * Math.PI * 2 - Math.PI));
  roads.push({ pts: ring, width: 7, kind: 'main', edgeLines: true, closed: true });

  const msStart = ringRoadPoint(0.165);
  const mainStreet = [msStart];
  for (let x = msStart.x + 25; x <= 1760; x += 20) mainStreet.push({ x, z: valleyCenterZ(x) + 72 });
  roads.push({ pts: mainStreet, width: 7.5, kind: 'main', edgeLines: true, poles: true, houses: true });

  const southStreet = [];
  for (let x = 640; x <= 1520; x += 20) southStreet.push({ x, z: valleyCenterZ(x) - 78 });
  roads.push({ pts: southStreet, width: 5, kind: 'street', poles: true, houses: true });

  for (const x of [690, 830, 980, 1130, 1290, 1430]) {
    const pts = [{ x, z: valleyCenterZ(x) - 78 }, { x: x + 6, z: valleyCenterZ(x + 6) + 72 }];
    roads.push({ pts, width: 4.5, kind: 'lane', houses: true });
    props.bridges.push({ x: x + 3, z: valleyCenterZ(x + 3), rot: Math.atan2(150, 6) });
  }
  // bridge where the lake road crosses the river outlet
  props.bridges.push({ x: lakeRadius(0) + 22, z: valleyCenterZ(lakeRadius(0) + 22), rot: Math.PI / 2, wide: true });

  const northRoad = smoothPath([
    ringRoadPoint(-1.42), { x: 95, z: -612 }, { x: 70, z: -700 }, { x: 12, z: -762 },
    { x: -44, z: -805 }, { x: -82, z: -846 }, { x: -110, z: -858 },
  ]);
  roads.push({ pts: northRoad, width: 6, kind: 'main', edgeLines: true, poles: true, houses: true });

  roads.push({ pts: arc(655, -2.05, -0.42), width: 5, kind: 'street', poles: true, houses: true });
  roads.push({ pts: arc(765, -1.88, -0.62), width: 4.5, kind: 'street', poles: true, houses: true });
  roads.push({
    pts: smoothPath([polar(-0.42, 655), { x: 700, z: -330 }, { x: 760, z: -200 }, { x: 820, z: valleyCenterZ(820) + 72 }]),
    width: 5, kind: 'street', poles: true, houses: true,
  });
  for (const th of [-1.98, -1.72, -1.2, -0.95, -0.72, -0.5, -0.2]) {
    const r1 = LAKE_R + Math.min(320, flatWidth(th) * 0.72);
    const pts = [];
    for (let r = lakeRadius(th) + 22; r <= r1; r += 10) pts.push(polar(th + Math.sin(r * 0.02) * 0.004, r));
    roads.push({ pts, width: 4, kind: 'lane', houses: true });
  }
  // shrine approach lane along the shore
  roads.push({ pts: arc(lakeRadius(-2.58) + 40, -2.72, -2.2), width: 4, kind: 'lane', houses: true });
  // forest road up the east valley side towards the substation
  roads.push({
    pts: smoothPath([{ x: 1010, z: valleyCenterZ(1010) + 72 }, { x: 1060, z: subZ + 60 }, { x: substation.x, z: subZ + 26 }]),
    width: 4.5, kind: 'street',
  });

  // ring road poles only along the inhabited shores
  roads[0].poleRange = [-2.15, 0.9];

  if (ERA.after) {
    // cut every road where it runs into the crater
    const cut = [];
    for (const rd of roads) {
      let run = [];
      let first = true;
      const flush = () => {
        if (run.length > 1) {
          const piece = { ...rd, pts: run, closed: false };
          if (!first) delete piece.poleRange; // the ring's poles are generated once, by angle
          first = false;
          cut.push(piece);
        }
        run = [];
      };
      for (const p of rd.pts) {
        if (craterDist(p.x, p.z) < 14) flush();
        else run.push(p);
      }
      flush();
    }
    // keep the ring road first so the pole range logic still applies
    roads.length = 0;
    roads.push(...cut);
  }

  for (const rd of roads) occ.markPolyline(rd.pts, rd.width / 2 + 0.8, OCC.ROAD);

  // --- Houses ---------------------------------------------------------------
  const townDensity = (x, z) => {
    const r = Math.hypot(x, z);
    const th = Math.atan2(z, x);
    const s = r - lakeRadius(th);
    const fw = flatWidth(th);
    let d = smooth(fw * 0.95 + 40, fw * 0.35, s) * smooth(14, 30, s);
    // valley town
    if (x > 560 && x < 1600) {
      const vz = valleyCenterZ(x);
      const inValley = smooth(200, 110, Math.abs(z - vz)) * smooth(1650, 1200, x);
      d = Math.max(d, inValley);
    }
    // shrine neighbourhood
    const ds = Math.hypot(x - STAIRS.a.x, z - STAIRS.a.z);
    d = Math.max(d, smooth(150, 40, ds) * 0.9);
    return d;
  };

  const tryHouse = (x, z, rot, w, d, opts = {}) => {
    if (shoreDistance(x, z) < 16) return false;
    const sl = slopeAcross(x, z, w, d, rot);
    if (sl.diff > (opts.maxSlope || 4.5)) return false;
    if (!occ.rectFree(x, z, w + 3, d + 3, rot)) return false;
    const floors = opts.floors || (rand() < 0.55 ? 2 : 1);
    houses.push({ x, z, y: sl.lo, top: sl.hi, w, d, rot, floors, seed: rand(), kind: opts.kind || 'house' });
    occ.markRect(x, z, w + 1.5, d + 1.5, rot, OCC.BUILDING);
    occ.markRect(x, z, w + 9, d + 9, rot, OCC.YARD, true);
    return true;
  };

  for (const rd of roads) {
    if (!rd.houses && rd.kind !== 'main') continue;
    const pts = resample(rd.pts, 3);
    for (let i = 2; i < pts.length - 2; i += 1) {
      const a = pts[i - 1], b = pts[i + 1], p = pts[i];
      const dirx = b.x - a.x, dirz = b.z - a.z;
      const L = Math.hypot(dirx, dirz) || 1;
      const tx = dirx / L, tz = dirz / L;
      const rot = Math.atan2(tz, tx);
      for (const side of [-1, 1]) {
        const dens = townDensity(p.x, p.z);
        if (rand() > dens * 0.42) continue;
        const big = rand() < 0.15;
        const w = big ? 12 + rand() * 5 : 7.5 + rand() * 4.5;
        const d = big ? 9 + rand() * 4 : 6.5 + rand() * 3.5;
        const off = rd.width / 2 + 2.2 + d / 2 + rand() * 2.5;
        const x = p.x - tz * off * side, z = p.z + tx * off * side;
        tryHouse(x, z, rot + (rand() - 0.5) * 0.08, w, d);
      }
    }
  }

  // second ring of houses behind the street fronts
  for (let k = 0; k < 9000; k++) {
    const x = -900 + rand() * 2600, z = -1200 + rand() * 1500;
    const dens = townDensity(x, z);
    if (rand() > dens * 0.7) continue;
    // must be near a road (but not on it)
    let near = false;
    for (let a = 0; a < 6 && !near; a++) {
      const ang = (a / 6) * Math.PI * 2;
      const o = occ.get(x + Math.cos(ang) * 26, z + Math.sin(ang) * 26);
      if (o === OCC.ROAD || o === OCC.YARD) near = true;
    }
    if (!near) continue;
    const th = Math.atan2(z, x);
    const rot = th + Math.PI / 2 + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.2;
    tryHouse(x, z, rot, 7 + rand() * 5, 6 + rand() * 4);
  }

  // Miyamizu residence beside the stair foot.
  if (!ERA.after) {
    const p = polar(-2.47, lakeRadius(-2.47) + 58);
    houses.push({ x: p.x, z: p.z, y: terrainHeight(p.x, p.z) - 1, top: 0, w: 17, d: 11, rot: -2.47 + Math.PI / 2, floors: 2, seed: 0.42, kind: 'manor' });
    occ.markRect(p.x, p.z, 26, 20, -2.47 + Math.PI / 2, OCC.BUILDING);
  }

  // --- Paddies --------------------------------------------------------------
  const paddyColors = ['#86bd3c', '#7bb236', '#93c445', '#9fca4b', '#71a833', '#a9c94a', '#c8b94c', '#d4b54a', '#8bbf41'];
  const addPaddy = (corners, flooded) => {
    for (const c of corners) if (occ.get(c.x, c.z) !== 0) return false;
    const cx = (corners[0].x + corners[2].x) / 2, cz = (corners[0].z + corners[2].z) / 2;
    if (occ.get(cx, cz) !== 0) return false;
    let lo = Infinity, hi = -Infinity;
    for (const c of corners) { const h = terrainHeight(c.x, c.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo > 3.2) return false;
    if (shoreDistance(cx, cz) < 30) return false;
    paddies.push({ poly: corners, color: paddyColors[Math.floor(rand() * paddyColors.length)], flooded });
    // mark the interior (slightly shrunk)
    const pts = [corners[0], corners[1], corners[2], corners[3], corners[0]];
    for (let i = 0; i < 4; i++) occ.markPolyline([pts[i], pts[i + 1]], 0.5, OCC.PADDY);
    const w = Math.hypot(corners[1].x - corners[0].x, corners[1].z - corners[0].z);
    const d = Math.hypot(corners[3].x - corners[0].x, corners[3].z - corners[0].z);
    const rot = Math.atan2(corners[1].z - corners[0].z, corners[1].x - corners[0].x);
    occ.markRect(cx, cz, w, d, rot, OCC.PADDY, true);
    return true;
  };

  // terraced paddies following the contour rings of the basin
  for (let r = LAKE_R + 40; r < LAKE_R + 700; r += 21) {
    const segLen = 30 + rand() * 12;
    const dth = segLen / r;
    for (let th = -Math.PI; th < Math.PI; th += dth) {
      const fw = flatWidth(th);
      if (r - LAKE_R > fw * 1.02) continue;
      if (rand() < 0.12) continue;
      const r0 = r + 1, r1 = r + 20;
      const t0 = th + 0.6 / r, t1 = th + dth - 0.6 / r;
      const corners = [polar(t0, r0), polar(t1, r0), polar(t1, r1), polar(t0, r1)];
      addPaddy(corners, rand() < 0.015);
    }
  }
  // valley paddies aligned with the river
  for (let x = 600; x < 1720; x += 27) {
    for (let dz = -230; dz < 230; dz += 19) {
      const z0 = valleyCenterZ(x) + dz;
      const z1 = valleyCenterZ(x + 25) + dz;
      const corners = [{ x, z: z0 }, { x: x + 25, z: z1 }, { x: x + 25, z: z1 + 17.5 }, { x, z: z0 + 17.5 }];
      if (rand() < 0.08) continue;
      addPaddy(corners, rand() < 0.015);
    }
  }

  // Small vegetable fields + greenhouses scattered near houses.
  for (let k = 0; k < 500; k++) {
    const x = -900 + rand() * 2600, z = -1200 + rand() * 1500;
    if (townDensity(x, z) < 0.25) continue;
    const rot = rand() * Math.PI;
    const w = 10 + rand() * 14, d = 7 + rand() * 9;
    if (!occ.rectFree(x, z, w, d, rot, [OCC.YARD])) continue;
    if (slopeAcross(x, z, w, d, rot).diff > 3) continue;
    const greenhouse = rand() < 0.22;
    fields.push({ x, z, w, d, rot, greenhouse, color: ['#7a5b3a', '#6f8a35', '#8a6a42', '#5f7f2e'][Math.floor(rand() * 4)] });
    occ.markRect(x, z, w, d, rot, greenhouse ? OCC.BUILDING : OCC.FIELD);
  }

  // Yard trees.
  for (const h of houses) {
    const n = rand() < 0.65 ? 1 + Math.floor(rand() * 2) : 0;
    for (let i = 0; i < n; i++) {
      const ang = rand() * Math.PI * 2;
      const rr = Math.max(h.w, h.d) * 0.5 + 3 + rand() * 4;
      const x = h.x + Math.cos(ang) * rr, z = h.z + Math.sin(ang) * rr;
      const o = occ.get(x, z);
      if (o === OCC.YARD || o === OCC.FREE) yardTrees.push({ x, z, s: 0.55 + rand() * 0.5 });
    }
  }

  // --- Utility poles --------------------------------------------------------
  const poleLines = [];
  for (const rd of roads) {
    if (!rd.poles && !rd.poleRange) continue;
    let pts = rd.pts;
    if (rd.poleRange) {
      pts = [];
      for (let i = 0; i <= 260; i++) {
        const th = rd.poleRange[0] + ((rd.poleRange[1] - rd.poleRange[0]) * i) / 260;
        pts.push(polar(th, lakeRadius(th) + 22));
      }
    }
    const rs = resample(pts, 34);
    const line = [];
    for (let i = 0; i < rs.length; i++) {
      const a = rs[Math.max(0, i - 1)], b = rs[Math.min(rs.length - 1, i + 1)];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      const off = rd.width / 2 + 0.9;
      const x = rs[i].x + nx * off, z = rs[i].z + nz * off;
      if (shoreDistance(x, z) < 8 || (ERA.after && craterDist(x, z) < 40)) { if (line.length > 1) poleLines.push(line.splice(0)); else line.length = 0; continue; }
      line.push({ x, z, y: terrainHeight(x, z), rot: Math.atan2(b.z - a.z, b.x - a.x) });
    }
    if (line.length > 1) poleLines.push(line);
  }
  for (const line of poleLines) for (let i = 0; i < line.length; i += 3) props.lamps.push(line[i]);

  const cafeP = { x: 108, z: -630 };
  props.vending = { x: cafeP.x, z: cafeP.z, y: terrainHeight(cafeP.x, cafeP.z), rot: 1.2 };
  occ.markCircle(cafeP.x, cafeP.z, 4, OCC.SPECIAL);

  // pier on the eastern shore
  const thP = 0.36;
  const pierBase = polar(thP, lakeRadius(thP) + 4);
  const pier = { x: pierBase.x, z: pierBase.z, rot: thP + Math.PI, len: 46 };

  // Eight years on: houses close to the rim were wrecked by the blast.
  if (ERA.after) {
    for (let i = houses.length - 1; i >= 0; i--) {
      const d = craterDist(houses[i].x, houses[i].z);
      if (d < 220) {
        if (rand() < 0.55 * (1 - d / 260)) houses.splice(i, 1);
        else houses[i].ruined = d < 160 || rand() < 0.3;
      }
    }
  }

  const layout = {
    occ, roads, houses, paddies, fields, yardTrees, river, props, poleLines,
    substation: { ...substation, y: terrainHeight(substation.x, substation.z) },
    townHall: { ...townHall, y: terrainHeight(townHall.x, townHall.z) },
    pier,
    townDensity,
  };
  layout.groundCanvas = paintGround(layout, groundRes);
  layout.maskCanvas = paintMask(layout, Math.min(2048, groundRes));
  return layout;
}

// ---------------------------------------------------------------------------
// Painting

function toPx(res) {
  const k = res / GROUND.size;
  return (p) => [(p.x - GROUND.min) * k, (p.z - GROUND.min) * k];
}

function paintGround(L, res) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = res;
  const ctx = cv.getContext('2d');
  const k = res / GROUND.size;
  const P = toPx(res);
  const rand = mulberry32(99);

  ctx.clearRect(0, 0, res, res);

  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  };
  const rect = (cx, cz, w, d, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([lx, lz]) => ({
      x: cx + lx * c - lz * s, z: cz + lx * s + lz * c,
    }));
    poly(pts);
  };

  // Paddies with darker bunds between them and subtle row striping.
  for (const pd of L.paddies) {
    poly(pd.poly);
    ctx.fillStyle = '#5f8f34';
    ctx.fill();
    ctx.lineWidth = 1.6 * k;
    ctx.strokeStyle = 'rgba(92,120,52,0.9)';
    ctx.stroke();
    const c = pd.poly;
    const shrink = (t) => ({ x: c[0].x + (c[2].x - c[0].x) * t, z: c[0].z + (c[2].z - c[0].z) * t });
    const m = 0.06;
    const inner = c.map((p) => {
      const ctr = shrink(0.5);
      return { x: ctr.x + (p.x - ctr.x) * (1 - m), z: ctr.z + (p.z - ctr.z) * (1 - m) };
    });
    poly(inner);
    ctx.fillStyle = pd.flooded ? '#7f9a8a' : pd.color;
    ctx.fill();
    // row stripes
    ctx.save();
    poly(inner);
    ctx.clip();
    ctx.strokeStyle = pd.flooded ? 'rgba(120,160,70,0.35)' : 'rgba(40,70,20,0.16)';
    ctx.lineWidth = Math.max(1, 0.5 * k);
    const [x0, y0] = P(inner[0]);
    const [x1, y1] = P(inner[1]);
    const [x3, y3] = P(inner[3]);
    const rows = 14;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      ctx.beginPath();
      ctx.moveTo(x0 + (x3 - x0) * t, y0 + (y3 - y0) * t);
      ctx.lineTo(x1 + (x3 - x0) * t, y1 + (y3 - y0) * t);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Vegetable fields & greenhouse plots.
  for (const f of L.fields) {
    rect(f.x, f.z, f.w, f.d, f.rot);
    ctx.fillStyle = f.greenhouse ? '#9a8a6a' : f.color;
    ctx.fill();
    if (!f.greenhouse) {
      ctx.save(); rect(f.x, f.z, f.w, f.d, f.rot); ctx.clip();
      ctx.strokeStyle = 'rgba(40,60,20,0.35)';
      ctx.lineWidth = Math.max(1, 0.6 * k);
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      for (let t = -f.d / 2; t < f.d / 2; t += 1.4) {
        const a = { x: f.x - (f.w / 2) * c - t * s, z: f.z - (f.w / 2) * s + t * c };
        const b = { x: f.x + (f.w / 2) * c - t * s, z: f.z + (f.w / 2) * s + t * c };
        ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // House lots: gravel / garden patches.
  for (const h of L.houses) {
    rect(h.x, h.z, h.w + 6 + rand() * 3, h.d + 6 + rand() * 3, h.rot);
    const g = rand();
    ctx.fillStyle = g < 0.4 ? 'rgba(170,160,138,0.95)' : g < 0.75 ? 'rgba(112,142,70,0.9)' : 'rgba(150,134,104,0.95)';
    ctx.fill();
  }

  // School ground (校庭) with a running track.
  {
    const S = SITES.school;
    const gx = S.x + 8, gz = S.z + 34;
    rect(S.x, S.z, 210, 190, 0); ctx.fillStyle = 'rgba(132,150,88,1)'; ctx.fill();
    rect(gx, gz, 128, 82, 0); ctx.fillStyle = '#b09a6c'; ctx.fill();
    ctx.strokeStyle = 'rgba(250,250,240,0.9)';
    ctx.lineWidth = Math.max(1, 0.5 * k);
    for (const inset of [10, 14]) {
      const [cx, cy] = P({ x: gx, z: gz });
      const rw = (64 - inset) * k, rh = (41 - inset) * k;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    rect(S.x - 8, S.z - 42, 104, 26, 0); ctx.fillStyle = '#9d9a90'; ctx.fill(); // building apron
  }

  // Shrine terrace gravel + approach.
  if (!ERA.after) {
    const S = SITES.shrine;
    ctx.beginPath();
    const [cx, cy] = P(S);
    ctx.arc(cx, cy, (S.r + 6) * k, 0, Math.PI * 2);
    ctx.fillStyle = '#c9c0ac';
    ctx.fill();
  }

  // Substation gravel.
  { const s = L.substation; rect(s.x, s.z, s.w, s.d, s.rot); ctx.fillStyle = '#a6a49c'; ctx.fill(); }
  // Town hall plaza.
  { const t = L.townHall; rect(t.x, t.z, t.w + 18, t.d + 22, t.rot); ctx.fillStyle = '#a3a19a'; ctx.fill(); }

  // River.
  {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    L.river.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = '#8c8a72';
    ctx.lineWidth = 13 * k;
    ctx.stroke();
    ctx.strokeStyle = '#4f7d86';
    ctx.lineWidth = 8 * k;
    ctx.stroke();
  }

  // Roads: shoulders, asphalt, edge lines.
  const strokeRoad = (rd, w, style) => {
    ctx.beginPath();
    rd.pts.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    if (rd.closed) ctx.closePath();
    ctx.lineWidth = w * k;
    ctx.strokeStyle = style;
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const rd of L.roads) strokeRoad(rd, rd.width + 2.2, rd.kind === 'lane' ? 'rgba(150,140,112,0.9)' : 'rgba(128,124,110,0.95)');
  for (const rd of L.roads) strokeRoad(rd, rd.width, rd.kind === 'lane' ? '#8c8b86' : '#6c6e70');
  for (const rd of L.roads) {
    if (!rd.edgeLines) continue;
    ctx.setLineDash([]);
    strokeRoad(rd, rd.width - 0.6, 'rgba(232,232,222,0.85)');
    strokeRoad(rd, rd.width - 1.2, '#6c6e70');
    ctx.setLineDash([3 * k, 4 * k]);
    strokeRoad(rd, 0.18, 'rgba(240,240,230,0.9)');
    ctx.setLineDash([]);
  }

  return cv;
}

function paintMask(L, res) {
  // R: paddy, G: open water (mirror), B: road / hard surface
  const cv = document.createElement('canvas');
  cv.width = cv.height = res;
  const ctx = cv.getContext('2d');
  const k = res / GROUND.size;
  const P = toPx(res);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, res, res);
  for (const pd of L.paddies) {
    ctx.beginPath();
    pd.poly.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = pd.flooded ? 'rgb(255,200,0)' : 'rgb(255,0,0)';
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  L.river.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = 'rgb(0,255,0)';
  ctx.lineWidth = 7.5 * k;
  ctx.stroke();
  for (const rd of L.roads) {
    ctx.beginPath();
    rd.pts.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    if (rd.closed) ctx.closePath();
    ctx.lineWidth = rd.width * k;
    ctx.strokeStyle = 'rgb(0,0,255)';
    ctx.stroke();
  }
  return cv;
}
