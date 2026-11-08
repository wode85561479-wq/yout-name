// Analytic height field of the Itomori basin.
//
// Coordinate convention (metres):  +x = east, -z = north, +y = up.
// The round crater lake (糸守湖) sits at the origin. The town spreads over the
// gentle northern and eastern shores, a river valley opens to the east, the
// Miyamizu shrine sits on a wooded hill to the west-north-west, the high school
// on a plateau to the north, and the go-shintai caldera crowns a distant peak.

import { createNoise2D, fbm, ridged, smooth, angDiff, lerp } from '../core/noise.js';

const nA = createNoise2D(11);
const nB = createNoise2D(23);
const nC = createNoise2D(37);
const nD = createNoise2D(51);

export const LAKE_R = 520;
export const WATER_Y = 0;

const polar = (th, r) => ({ x: Math.cos(th) * r, z: Math.sin(th) * r });

export const SITES = {
  school: { x: -150, z: -960, r: 118 },
  shrine: { ...polar(-2.58, 690), r: 34 }, // terrace of 宮水神社
  shrineHill: polar(-2.58, 760),
  shintai: { x: -2350, z: -1700, r: 150 }, // 御神体 caldera
  substation: { x: 1180, z: -250, r: 45 },
};

function gauss(th, c, w) {
  const d = angDiff(th, c);
  return Math.exp(-(d * d) / (w * w));
}

/** Wobbly lake radius so the crater is round but not a perfect circle. */
export function lakeRadius(th) {
  return LAKE_R * (1 + 0.016 * nA(Math.cos(th) * 1.7 + 9.1, Math.sin(th) * 1.7 - 3.3));
}

/** Width of the gentle land band between the shore and the foothills. */
export function flatWidth(th) {
  return 70 + 280 * gauss(th, -1.5, 0.62) + 560 * gauss(th, -0.05, 0.6) + 140 * gauss(th, 0.85, 0.35);
}

export function valleyCenterZ(x) {
  return 38 * Math.sin(x * 0.0021 + 0.6) + 26 * Math.sin(x * 0.0047 + 1.3);
}

function baseHeight(x, z) {
  const r = Math.sqrt(x * x + z * z) + 1e-6;
  const th = Math.atan2(z, x);
  const R = lakeRadius(th);
  const s = r - R;

  let h;
  if (s < 0) {
    h = 0.8 - 46 * (1 - Math.exp(s / 85));
  } else {
    h = 0.8 + 2.4 * smooth(0, 16, s);
    h += Math.max(0, s - 45) * 0.032;
    h += 4.0 * fbm(nB, x * 0.0035, z * 0.0035, 3) * smooth(35, 140, s);
  }

  // Mountains ring the crater.
  const fw = flatWidth(th);
  let m = smooth(fw * 0.42, fw + 560, s);
  const vz = valleyCenterZ(x);
  const vm = Math.exp(-Math.pow((z - vz) / 230, 2)) * smooth(LAKE_R + 250, LAKE_R + 800, x);
  m *= 1 - 0.88 * vm;
  if (m > 0.0005) {
    const amp = 360 + 170 * gauss(th, 1.9, 0.9) + 90 * gauss(th, -2.6, 0.6) - 60 * gauss(th, -0.1, 0.5);
    const rd = ridged(nC, x * 0.00105 + 17, z * 0.00105 - 4, 4);
    const bs = fbm(nD, x * 0.00045, z * 0.00045, 3) * 0.5 + 0.5;
    h += m * amp * (0.25 + 0.42 * rd + 0.55 * bs);
  }

  // Distant higher ranges (the Hida mountains) closing the horizon.
  const far = smooth(2800, 6500, r);
  if (far > 0) {
    const fr = ridged(nC, x * 0.00038 - 31, z * 0.00038 + 8, 3);
    const fb = fbm(nD, x * 0.00025 + 5, z * 0.00025 - 2, 3) * 0.5 + 0.5;
    h += far * (360 + 380 * fr + 420 * fb);
  }
  return h;
}

// Cached heights of the flattened sites.
const SCHOOL_H = baseHeight(SITES.school.x, SITES.school.z) + 2;
const SHRINE_BASE = baseHeight(SITES.shrine.x, SITES.shrine.z);

function shintaiRawHeight(x, z) {
  const d = Math.hypot(x - SITES.shintai.x, z - SITES.shintai.z);
  return baseHeight(x, z) + 260 * smooth(1100, 120, d);
}
const SHINTAI_RIM = shintaiRawHeight(SITES.shintai.x, SITES.shintai.z) + 8;
export const SHINTAI_FLOOR = SHINTAI_RIM - 34;
export const SHINTAI_MOAT = { inner: 58, outer: 82, level: SHINTAI_FLOOR - 1.2 };

export function shrineHillBump(x, z) {
  const d = Math.hypot(x - SITES.shrineHill.x, z - SITES.shrineHill.z);
  return 26 * smooth(230, 50, d);
}
export const SHRINE_H = SHRINE_BASE + shrineHillBump(SITES.shrine.x, SITES.shrine.z) - 2;

// The long stone stairway climbing from the lake road to the shrine terrace.
const STAIR_TH = -2.58;
export const STAIRS = {
  a: polar(STAIR_TH, 566),
  b: polar(STAIR_TH, 657),
  hA: 4.2,
  hB: SHRINE_H,
  width: 4.2,
};
STAIRS.len = Math.hypot(STAIRS.b.x - STAIRS.a.x, STAIRS.b.z - STAIRS.a.z);
STAIRS.dir = { x: (STAIRS.b.x - STAIRS.a.x) / STAIRS.len, z: (STAIRS.b.z - STAIRS.a.z) / STAIRS.len };

/** Height of the stairway line at parameter t (0 = bottom, 1 = top). */
export function stairHeight(t) {
  return lerp(STAIRS.hA, STAIRS.hB, t);
}

export function terrainHeight(x, z) {
  let h = baseHeight(x, z);

  // School plateau (糸守高校) on the northern foothills.
  {
    const S = SITES.school;
    const d = Math.hypot(x - S.x, z - S.z);
    if (d < 420) {
      const skirt = SCHOOL_H - 2 - (d - S.r) * 0.32;
      h = Math.max(h, lerp(h, skirt, smooth(420, 150, d)));
      h = lerp(h, SCHOOL_H, smooth(S.r + 32, S.r, d));
    }
  }

  // Wooded shrine hill with a flat terrace.
  {
    const dh = Math.hypot(x - SITES.shrineHill.x, z - SITES.shrineHill.z);
    if (dh < 260) h += shrineHillBump(x, z);
    const d = Math.hypot(x - SITES.shrine.x, z - SITES.shrine.z);
    if (d < 90) h = lerp(h, SHRINE_H, smooth(SITES.shrine.r + 26, SITES.shrine.r, d));
    // carve a corridor for the stairway
    const dx = x - STAIRS.a.x, dz = z - STAIRS.a.z;
    const along = dx * STAIRS.dir.x + dz * STAIRS.dir.z;
    if (along > -20 && along < STAIRS.len + 10) {
      const lat = Math.abs(dx * STAIRS.dir.z - dz * STAIRS.dir.x);
      if (lat < 14) {
        const t = Math.min(1, Math.max(0, along / STAIRS.len));
        const hs = stairHeight(t) - 0.4;
        const w = smooth(13, 5, lat) * smooth(-20, 0, along);
        if (h > hs) h = lerp(h, hs, w);
      }
    }
  }

  // Go-shintai: a peak with a caldera, a moat and a rock in the middle.
  {
    const G = SITES.shintai;
    const d = Math.hypot(x - G.x, z - G.z);
    if (d < 1100) {
      h += 260 * smooth(1100, 120, d);
      if (d < 210) {
        const c = SHINTAI_FLOOR + 34 * smooth(70, 150, d);
        const rimBlend = smooth(205, 150, d);
        h = lerp(h, c, rimBlend);
        // moat ring
        const mo = SHINTAI_MOAT;
        const mid = (mo.inner + mo.outer) / 2;
        const half = (mo.outer - mo.inner) / 2;
        const md = Math.abs(d - mid);
        h -= 2.8 * smooth(half + 6, half - 2, md);
        // central rock mound
        h += 11 * smooth(20, 5, d);
      }
    }
  }
  return h;
}

/** Signed distance (m) from the shoreline: negative inside the lake. */
export function shoreDistance(x, z) {
  const r = Math.hypot(x, z);
  return r - lakeRadius(Math.atan2(z, x));
}

export function terrainNormal(x, z, e = 2) {
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return { x: nx / l, y: ny / l, z: nz / l };
}

export const SITE_HEIGHTS = { school: SCHOOL_H, shrine: SHRINE_H, shintaiRim: SHINTAI_RIM };
