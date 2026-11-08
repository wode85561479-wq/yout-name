// All man-made structures of Itomori, merged into a handful of draw calls.

import * as THREE from 'three';
import { Builder, jitter } from './builder.js';
import { mulberry32 } from '../core/noise.js';
import { toonMaterial, lineMaterial } from '../core/materials.js';
import { glowMaterial } from './glow.js';
import {
  terrainHeight, SITES, SITE_HEIGHTS, STAIRS, stairHeight, lakeRadius, valleyCenterZ, shoreDistance, SHINTAI_FLOOR,
} from './heightfield.js';

const WALLS = ['#e4dccc', '#dcd0bc', '#cfc2aa', '#e6e2d8', '#c6bba6', '#8a6446', '#6e4e38', '#b2a998', '#ddd3bf'];
const ROOFS = ['#3d4c5e', '#55687c', '#8b3f2f', '#46668a', '#2f3842', '#6b4b3b', '#3f6a5d', '#5c6670', '#7a3a33', '#2e5a7a', '#384a40'];
const WOOD = '#5a3c2a';
const WOOD_DARK = '#3b281d';
const FOUND = '#8f8b82';

const WIN_WARM = [2.4, 1.55, 0.75];
const WIN_COOL = [1.6, 1.8, 2.1];

function addWindowsOnWall(win, rand, { x0, x1, z, y0, y1, out, n, ww, wh, kind = 0, axis = 'x' }) {
  const span = x1 - x0;
  for (let i = 0; i < n; i++) {
    const cx = x0 + (span * (i + 0.5)) / n + (rand() - 0.5) * (span / n) * 0.2;
    const cy = (y0 + y1) / 2;
    win.rnd = rand();
    win.kind = kind;
    win.emit = kind === 5 ? [2.2, 1.7, 1.0] : rand() < 0.2 ? WIN_COOL : WIN_WARM;
    const glass = kind === 5 ? '#e8e0cc' : '#2b3a4a';
    const hw = ww / 2, hh = wh / 2;
    if (axis === 'x') {
      const zz = z + out * 0.03;
      win.quad([cx - hw, cy - hh, zz], [cx + hw, cy - hh, zz], [cx + hw, cy + hh, zz], [cx - hw, cy + hh, zz], glass, [0, 0, out]);
    } else {
      const xx = z + out * 0.03;
      win.quad([xx, cy - hh, cx - hw], [xx, cy - hh, cx + hw], [xx, cy + hh, cx + hw], [xx, cy + hh, cx - hw], glass, [out, 0, 0]);
    }
  }
}

/** Gable roof with the ridge along local x. */
function gableRoof(b, w, d, yEave, rise, over, roofCol, wallCol, { ridgeAlongZ = false, thick = 0.22 } = {}) {
  if (ridgeAlongZ) {
    // swap axes by rotating the frame 90°
    const ox = b.ox, oy = b.oy, oz = b.oz, cr = b.cr, sr = b.sr;
    b.cr = -sr; b.sr = cr; // rot + 90°
    gableRoof(b, d, w, yEave, rise, over, roofCol, wallCol, { thick });
    b.ox = ox; b.oy = oy; b.oz = oz; b.cr = cr; b.sr = sr;
    return;
  }
  const hx = w / 2 + over, hz = d / 2 + over;
  const slope = rise / (d / 2);
  const yLow = yEave - over * slope;
  const yTop = yEave + rise;
  // two slopes
  b.quad([-hx, yLow, hz], [hx, yLow, hz], [hx, yTop, 0], [-hx, yTop, 0], roofCol, [0, 1, 1]);
  b.quad([hx, yLow, -hz], [-hx, yLow, -hz], [-hx, yTop, 0], [hx, yTop, 0], roofCol, [0, 1, -1]);
  // eave fascia
  const fc = [roofCol[0] * 0.6, roofCol[1] * 0.6, roofCol[2] * 0.6];
  b.quad([-hx, yLow - thick, hz], [hx, yLow - thick, hz], [hx, yLow, hz], [-hx, yLow, hz], fc, [0, 0, 1]);
  b.quad([hx, yLow - thick, -hz], [-hx, yLow - thick, -hz], [-hx, yLow, -hz], [hx, yLow, -hz], fc, [0, 0, -1]);
  // undersides (seen from below the eaves)
  const uc = [wallCol[0] * 0.55, wallCol[1] * 0.55, wallCol[2] * 0.55];
  b.quad([-hx, yLow - 0.01, hz], [-hx, yTop - 0.3, 0], [hx, yTop - 0.3, 0], [hx, yLow - 0.01, hz], uc, [0, -1, 0]);
  b.quad([hx, yLow - 0.01, -hz], [hx, yTop - 0.3, 0], [-hx, yTop - 0.3, 0], [-hx, yLow - 0.01, -hz], uc, [0, -1, 0]);
  // gable triangles
  const gx = w / 2;
  b.tri([gx, yEave, d / 2], [gx, yEave, -d / 2], [gx, yTop - 0.05, 0], wallCol, [1, 0, 0]);
  b.tri([-gx, yEave, -d / 2], [-gx, yEave, d / 2], [-gx, yTop - 0.05, 0], wallCol, [-1, 0, 0]);
  // barge boards
  b.quad([hx, yLow, hz], [hx, yTop, 0], [hx, yTop - thick, 0], [hx, yLow - thick, hz], fc, [1, 0, 0]);
  b.quad([hx, yLow, -hz], [hx, yTop, 0], [hx, yTop - thick, 0], [hx, yLow - thick, -hz], fc, [1, 0, 0]);
  b.quad([-hx, yLow, hz], [-hx, yTop, 0], [-hx, yTop - thick, 0], [-hx, yLow - thick, hz], fc, [-1, 0, 0]);
  b.quad([-hx, yLow, -hz], [-hx, yTop, 0], [-hx, yTop - thick, 0], [-hx, yLow - thick, -hz], fc, [-1, 0, 0]);
  // ridge cap
  b.box(0, 0, w + over * 2 + 0.1, 0.45, yTop - 0.05, yTop + 0.18, fc);
}

/** Hip roof (寄棟) – optionally with a small gable on top (入母屋). */
function hipRoof(b, w, d, yEave, rise, over, roofCol, { irimoya = false, upturn = 0 } = {}) {
  const hx = w / 2 + over, hz = d / 2 + over;
  const slope = rise / (d / 2);
  const yLow = yEave - over * slope;
  const yTop = yEave + rise;
  const rx = Math.max(0.3, hx - hz); // ridge half length
  const up = upturn;
  b.quad([-hx, yLow + up, hz], [hx, yLow + up, hz], [rx, yTop, 0], [-rx, yTop, 0], roofCol, [0, 1, 1]);
  b.quad([hx, yLow + up, -hz], [-hx, yLow + up, -hz], [-rx, yTop, 0], [rx, yTop, 0], roofCol, [0, 1, -1]);
  const side = [roofCol[0] * 0.92, roofCol[1] * 0.92, roofCol[2] * 0.92];
  b.tri([hx, yLow + up, hz], [hx, yLow + up, -hz], [rx, yTop, 0], side, [1, 1, 0]);
  b.tri([-hx, yLow + up, -hz], [-hx, yLow + up, hz], [-rx, yTop, 0], side, [-1, 1, 0]);
  const fc = [roofCol[0] * 0.55, roofCol[1] * 0.55, roofCol[2] * 0.55];
  b.quad([-hx, yLow + up - 0.25, hz], [hx, yLow + up - 0.25, hz], [hx, yLow + up, hz], [-hx, yLow + up, hz], fc, [0, 0, 1]);
  b.quad([hx, yLow + up - 0.25, -hz], [-hx, yLow + up - 0.25, -hz], [-hx, yLow + up, -hz], [hx, yLow + up, -hz], fc, [0, 0, -1]);
  b.quad([hx, yLow + up - 0.25, -hz], [hx, yLow + up - 0.25, hz], [hx, yLow + up, hz], [hx, yLow + up, -hz], fc, [1, 0, 0]);
  b.quad([-hx, yLow + up - 0.25, hz], [-hx, yLow + up - 0.25, -hz], [-hx, yLow + up, -hz], [-hx, yLow + up, hz], fc, [-1, 0, 0]);
  if (irimoya) {
    // small gable pediment on each end of the ridge
    const gy = yTop - rise * 0.38;
    const gz = hz * 0.38;
    b.tri([rx + 0.02, gy, gz], [rx + 0.02, gy, -gz], [rx + 0.02, yTop, 0], [0.92, 0.88, 0.8].map((v) => v * 0.6), [1, 0, 0]);
    b.tri([-rx - 0.02, gy, -gz], [-rx - 0.02, gy, gz], [-rx - 0.02, yTop, 0], [0.92, 0.88, 0.8].map((v) => v * 0.6), [-1, 0, 0]);
  }
  b.box(0, 0, rx * 2 + 0.6, 0.5, yTop - 0.05, yTop + 0.3, fc);
}

function buildHouse(b, win, h) {
  const rand = mulberry32(Math.floor(h.seed * 1e9));
  const base = h.y;
  b.setFrame(h.x, base, h.z, h.rot);
  win.setFrame(h.x, base, h.z, h.rot);
  const w = h.w, d = h.d;
  const floorH = 2.75;
  const plinth = 0.55 + Math.max(0, (h.top || base) - base);
  const nF = h.kind === 'manor' ? 2 : h.floors;
  let wallC = jitter(WALLS[Math.floor(rand() * WALLS.length)], rand);
  let roofC = jitter(ROOFS[Math.floor(rand() * ROOFS.length)], rand, 0.08);
  if (h.kind === 'manor') { wallC = jitter('#efe9dc', rand, 0.02); roofC = jitter('#353c44', rand, 0.02); }
  const kura = h.kind !== 'manor' && rand() < 0.07;
  if (kura) { wallC = jitter('#f3f1ea', rand, 0.02); roofC = jitter('#2c3238', rand, 0.03); }
  const woodC = jitter(WOOD, rand, 0.08);

  // foundation sunk into the slope
  b.box(0, 0, w + 0.3, d + 0.3, -3, plinth, FOUND);
  const yWall0 = plinth;
  const y1 = yWall0 + floorH * nF;
  // walls: Hida-style dark timber skirt under pale plaster
  const skirt = kura ? '#2a2a2c' : rand() < 0.55 ? woodC : wallC;
  b.box(0, 0, w, d, yWall0, yWall0 + 1.0, skirt, { top: false });
  b.box(0, 0, w, d, yWall0 + 1.0, y1, wallC, { top: false });
  // timber posts at the corners for the traditional look
  if (!kura && rand() < 0.6) {
    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      b.box(px, pz, 0.28, 0.28, yWall0, y1, woodC, { top: false });
    }
    b.box(0, d / 2, w + 0.02, 0.06, yWall0 + floorH - 0.12, yWall0 + floorH + 0.12, woodC, { top: false });
    b.box(0, -d / 2, w + 0.02, 0.06, yWall0 + floorH - 0.12, yWall0 + floorH + 0.12, woodC, { top: false });
  }

  // windows
  const wins = (yA, yB, kind) => {
    const nx = Math.max(1, Math.floor(w / 3.2));
    const nz = Math.max(1, Math.floor(d / 3.6));
    const ww = kura ? 0.8 : 1.5, wh = kura ? 0.8 : 1.15;
    for (const side of [1, -1]) {
      if (rand() < 0.9) addWindowsOnWall(win, rand, { x0: -w / 2 + 0.6, x1: w / 2 - 0.6, z: (side * d) / 2, y0: yA, y1: yB, out: side, n: kura ? 1 : nx, ww, wh, kind });
      if (rand() < 0.6) addWindowsOnWall(win, rand, { x0: -d / 2 + 0.6, x1: d / 2 - 0.6, z: (side * w) / 2, y0: yA, y1: yB, out: side, n: kura ? 1 : nz, ww, wh, kind, axis: 'z' });
    }
  };
  for (let f = 0; f < nF; f++) {
    const yA = yWall0 + f * floorH + 0.75, yB = yA + 1.2;
    wins(yA, yB, f === 0 && rand() < 0.3 ? 5 : 0);
  }

  const rise = (kura ? 0.38 : 0.3 + rand() * 0.18) * (d / 2);
  const over = kura ? 0.5 : 0.6 + rand() * 0.35;
  const roofType = h.kind === 'manor' ? 'irimoya' : kura ? 'gable' : rand() < 0.62 ? 'gable' : rand() < 0.7 ? 'hip' : 'irimoya';
  const along = rand() < 0.82 ? 'x' : 'z';
  if (roofType === 'gable') gableRoof(b, w, d, y1, rise, over, roofC, wallC, { ridgeAlongZ: along === 'z' && w < d * 1.3 });
  else hipRoof(b, w, d, y1, rise, over, roofC, { irimoya: roofType === 'irimoya' });

  // lower pent roof (下屋) for two storey houses
  if (nF === 2 && !kura && rand() < 0.75) {
    const yE = yWall0 + floorH + 0.15;
    const ov = 0.9;
    for (const side of [1, -1]) {
      b.quad([-w / 2 - 0.3, yE - ov * 0.45, side * (d / 2 + ov)], [w / 2 + 0.3, yE - ov * 0.45, side * (d / 2 + ov)], [w / 2 + 0.3, yE + 0.15, (side * d) / 2], [-w / 2 - 0.3, yE + 0.15, (side * d) / 2], roofC, [0, 1, side]);
    }
  }
  // entrance canopy + door
  if (rand() < 0.7) {
    const dz = d / 2;
    const dx = (rand() - 0.5) * (w - 3);
    b.box(dx, dz + 0.02, 1.6, 0.04, yWall0, yWall0 + 2.1, '#4a3a2e', { top: false });
    b.quad([dx - 1.3, yWall0 + 2.5, dz + 1.2], [dx + 1.3, yWall0 + 2.5, dz + 1.2], [dx + 1.3, yWall0 + 2.8, dz], [dx - 1.3, yWall0 + 2.8, dz], roofC, [0, 1, 1]);
  }
  // balcony / laundry pole on some upper floors
  if (nF === 2 && rand() < 0.3) {
    b.box(0, -d / 2 - 0.6, w * 0.6, 1.2, yWall0 + floorH, yWall0 + floorH + 0.12, '#b8b4aa');
    b.box(0, -d / 2 - 1.15, w * 0.6, 0.06, yWall0 + floorH, yWall0 + floorH + 1.0, '#c8c4ba', { top: false });
  }
  // Kura: black namako band near the top
  if (kura) b.box(0, 0, w + 0.04, d + 0.04, y1 - 0.5, y1 - 0.2, '#2a2a2c', { top: false });
}

// ---------------------------------------------------------------------------

function buildSchool(b, win) {
  const S = SITES.school;
  const y = SITE_HEIGHTS.school;
  const white = '#e2e0d8', base = '#a39f95', band = '#c9c6bd', roofC = '#8e9497';
  // main building (north edge of the plateau, facing the lake to the south)
  const bx = S.x - 8, bz = S.z - 42;
  b.setFrame(bx, y, bz, 0);
  win.setFrame(bx, y, bz, 0);
  const L = 96, D = 15, floors = 3, fh = 3.7;
  b.box(0, 0, L + 1, D + 1, -3, 0.6, base);
  b.box(0, 0, L, D, 0.6, 0.6 + floors * fh, white, { topColor: roofC });
  for (let f = 1; f <= floors; f++) {
    b.box(0, 0, L + 0.25, D + 0.25, 0.6 + f * fh - 0.35, 0.6 + f * fh, band, { top: f === floors, topColor: roofC });
  }
  b.box(0, 0, L + 0.3, D + 0.3, 0.6 + floors * fh, 0.6 + floors * fh + 1.0, white, { topColor: roofC }); // parapet
  // windows: long ribbons per floor on both sides, broken by mullions
  for (let f = 0; f < floors; f++) {
    const yA = 0.6 + f * fh + 0.95, yB = yA + 1.9;
    for (const side of [1, -1]) {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const x0 = -L / 2 + 2 + ((L - 4) * i) / n, x1 = x0 + (L - 4) / n - 0.35;
        win.rnd = Math.random();
        win.kind = 4;
        win.emit = WIN_COOL;
        const zz = (side * D) / 2 + side * 0.03;
        win.quad([x0, yA, zz], [x1, yA, zz], [x1, yB, zz], [x0, yB, zz], '#2c3d52', [0, 0, side]);
      }
    }
  }
  // central stair tower with the clock
  const tH = 0.6 + floors * fh + 4.5;
  b.box(0, 0.5, 9, D + 2, 0.6, tH, white, { topColor: roofC });
  b.box(0, 0.5, 9.4, D + 2.4, tH, tH + 0.5, band);
  b.setFrame(bx, y, bz + D / 2 + 1.05, 0);
  // clock face
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
    const cy = tH - 2.2, r = 1.5;
    b.tri([0, cy, 0.01], [Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.01], [Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.01], '#fbfbf5', [0, 0, 1]);
    b.tri([Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.0], [Math.cos(a0) * (r + 0.15), cy + Math.sin(a0) * (r + 0.15), 0.0], [Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.0], '#2d3440', [0, 0, 1]);
  }
  b.beam([0, tH - 2.2, 0.03], [0.0, tH - 1.2, 0.03], 0.12, '#1e232b');
  b.beam([0, tH - 2.2, 0.03], [0.75, tH - 2.4, 0.03], 0.12, '#1e232b');

  // entrance canopy
  b.setFrame(bx, y, bz, 0);
  b.box(14, D / 2 + 3, 10, 6, 3.2, 3.6, '#c9c7c0');
  b.box(10, D / 2 + 5.6, 0.4, 0.4, 0.6, 3.2, '#c9c7c0', { top: false });
  b.box(18, D / 2 + 5.6, 0.4, 0.4, 0.6, 3.2, '#c9c7c0', { top: false });

  // gymnasium with a vaulted roof
  const gx = S.x + 82, gz = S.z - 18;
  b.setFrame(gx, y, gz, Math.PI / 2);
  win.setFrame(gx, y, gz, Math.PI / 2);
  const GL = 44, GD = 28, GH = 8.5;
  b.box(0, 0, GL + 1, GD + 1, -3, 0.6, base);
  b.box(0, 0, GL, GD, 0.6, GH, '#e9e7df', { top: false });
  const roofG = [0.17, 0.36, 0.43];
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
    const z0 = Math.cos(a0) * (GD / 2 + 0.6), z1 = Math.cos(a1) * (GD / 2 + 0.6);
    const y0 = GH + Math.sin(a0) * 4.2, y1 = GH + Math.sin(a1) * 4.2;
    b.quad([-GL / 2 - 0.6, y0, z0], [GL / 2 + 0.6, y0, z0], [GL / 2 + 0.6, y1, z1], [-GL / 2 - 0.6, y1, z1], roofG, [0, 1, (z0 + z1) * 0.1]);
    b.quad([GL / 2, GH, 0], [GL / 2, y0, z0], [GL / 2, y1, z1], [GL / 2, GH, 0], '#e9e7df', [1, 0, 0]);
    b.quad([-GL / 2, GH, 0], [-GL / 2, y1, z1], [-GL / 2, y0, z0], [-GL / 2, GH, 0], '#e9e7df', [-1, 0, 0]);
  }
  for (const side of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      const x0 = -GL / 2 + 2 + i * 5.2;
      win.rnd = Math.random(); win.kind = 4; win.emit = WIN_COOL;
      const zz = (side * GD) / 2 + side * 0.03;
      win.quad([x0, 5.2, zz], [x0 + 3.8, 5.2, zz], [x0 + 3.8, 7.6, zz], [x0, 7.6, zz], '#2c3d52', [0, 0, side]);
    }
  }
  // goal posts & backstop on the ground
  b.setFrame(S.x + 8, y, S.z + 34, 0);
  for (const sx of [-58, 58]) {
    b.box(sx, -3.6, 0.15, 0.15, 0, 2.4, '#f2f2f2', { top: false });
    b.box(sx, 3.6, 0.15, 0.15, 0, 2.4, '#f2f2f2', { top: false });
    b.box(sx, 0, 0.15, 7.4, 2.3, 2.45, '#f2f2f2');
  }
}

function buildTownHall(b, win, T) {
  b.setFrame(T.x, T.y, T.z, T.rot);
  win.setFrame(T.x, T.y, T.z, T.rot);
  const L = T.w, D = T.d, fh = 3.6, floors = 3;
  b.box(0, 0, L + 1, D + 1, -3, 0.6, FOUND);
  b.box(0, 0, L, D, 0.6, 0.6 + floors * fh, '#e4dccb', { topColor: '#8a8f92' });
  b.box(0, 0, L + 0.4, D + 0.4, 0.6 + floors * fh, 0.6 + floors * fh + 0.8, '#d0c8b6');
  for (let f = 0; f < floors; f++) {
    for (const side of [1, -1]) {
      addWindowsOnWall(win, Math.random, { x0: -L / 2 + 1, x1: L / 2 - 1, z: (side * D) / 2, y0: 0.6 + f * fh + 0.9, y1: 0.6 + f * fh + 2.6, out: side, n: 12, ww: 2.2, wh: 1.7, kind: 4 });
    }
  }
  b.box(0, D / 2 + 4, 0.18, 0.18, 0, 12, '#d9d9d9', { top: false }); // flag pole
}

// --- Miyamizu shrine --------------------------------------------------------

const VERMILION = '#c9412a';

function torii(b, x, y, z, rot, scale = 1) {
  b.setFrame(x, y, z, rot);
  const s = scale;
  const span = 4.6 * s, H = 5.6 * s, r = 0.3 * s;
  for (const px of [-span / 2, span / 2]) {
    b.cylinder(px, 0, r * 1.05, r * 0.92, -0.6, H, 10, VERMILION);
    b.cylinder(px, 0, r * 1.35, r * 1.3, -0.6, 0.45 * s, 10, '#2a2524');
  }
  // nuki
  b.box(0, 0, span + 1.2 * s, 0.34 * s, H - 1.3 * s, H - 0.9 * s, VERMILION);
  // shimaki + kasagi with upswept ends
  b.box(0, 0, span + 2.0 * s, 0.5 * s, H - 0.05 * s, H + 0.35 * s, VERMILION);
  const kw = span + 2.8 * s;
  const kc = '#1f1d1d';
  b.box(0, 0, kw * 0.62, 0.62 * s, H + 0.35 * s, H + 0.75 * s, kc);
  for (const sg of [-1, 1]) {
    const xa = sg * kw * 0.3, xb = sg * kw * 0.52;
    b.beam([xa, H + 0.55 * s, 0], [xb, H + 0.95 * s, 0], 0.55 * s, kc);
  }
  // gakuzuka
  b.box(0, 0, 0.36 * s, 0.25 * s, H - 0.9 * s, H, VERMILION);
}

function stoneLantern(b, x, y, z, s = 1) {
  b.setFrame(x, y, z, 0);
  const c = '#a7a395';
  b.box(0, 0, 0.9 * s, 0.9 * s, 0, 0.3 * s, c);
  b.cylinder(0, 0, 0.18 * s, 0.16 * s, 0.3 * s, 1.4 * s, 8, c);
  b.box(0, 0, 0.7 * s, 0.7 * s, 1.4 * s, 1.6 * s, c);
  b.box(0, 0, 0.5 * s, 0.5 * s, 1.6 * s, 2.1 * s, '#8f8b7e');
  b.box(0, 0, 1.0 * s, 1.0 * s, 2.1 * s, 2.25 * s, c);
  b.box(0, 0, 0.5 * s, 0.5 * s, 2.25 * s, 2.5 * s, c);
}

function buildShrine(b, win, glowList) {
  const S = SITES.shrine;
  const y = SITE_HEIGHTS.shrine;
  const dir = STAIRS.dir;
  const facing = Math.atan2(-dir.z, -dir.x); // shrine faces down the stairs (towards the lake)
  const stone = '#aaa699';

  // --- stairway
  const n = Math.round(STAIRS.len / 0.42);
  const rot = Math.atan2(dir.z, dir.x);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const yTop = stairHeight(t1);
    const cx = STAIRS.a.x + dir.x * STAIRS.len * (t0 + t1) / 2;
    const cz = STAIRS.a.z + dir.z * STAIRS.len * (t0 + t1) / 2;
    b.setFrame(cx, 0, cz, rot);
    const sc = (0.95 + 0.08 * Math.sin(i * 12.9898)) ;
    b.box(0, 0, STAIRS.len / n + 0.02, STAIRS.width, yTop - 1.6, yTop, [0.62 * sc, 0.6 * sc, 0.55 * sc], { topColor: [0.58 * sc, 0.56 * sc, 0.51 * sc] });
  }
  // side walls along the stairs
  for (const side of [-1, 1]) {
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const off = side * (STAIRS.width / 2 + 0.35);
      const ax = STAIRS.a.x + dir.x * STAIRS.len * t0 - dir.z * off, az = STAIRS.a.z + dir.z * STAIRS.len * t0 + dir.x * off;
      const bx2 = STAIRS.a.x + dir.x * STAIRS.len * t1 - dir.z * off, bz2 = STAIRS.a.z + dir.z * STAIRS.len * t1 + dir.x * off;
      b.setFrame(0, 0, 0, 0);
      const ya = stairHeight(t0) + 0.55, yb = stairHeight(t1) + 0.55;
      const ga = Math.min(terrainHeight(ax, az), ya) - 2, gb = Math.min(terrainHeight(bx2, bz2), yb) - 2;
      const ox = -dir.z * side * 0.35, oz = dir.x * side * 0.35;
      // outer + inner faces and the cap
      b.quad([ax + ox, ga, az + oz], [bx2 + ox, gb, bz2 + oz], [bx2 + ox, yb, bz2 + oz], [ax + ox, ya, az + oz], '#8f8b7d', [-dir.z * side, 0, dir.x * side]);
      b.quad([ax - ox, ga, az - oz], [bx2 - ox, gb, bz2 - oz], [bx2 - ox, yb, bz2 - oz], [ax - ox, ya, az - oz], '#8f8b7d', [dir.z * side, 0, -dir.x * side]);
      b.quad([ax - ox, ya, az - oz], [bx2 - ox, yb, bz2 - oz], [bx2 + ox, yb, bz2 + oz], [ax + ox, ya, az + oz], '#9c988a', [0, 1, 0]);
    }
  }
  // stone lanterns and festival lantern posts beside the stairs
  for (let t = 0.04; t < 1; t += 0.085) {
    for (const side of [-1, 1]) {
      const off = side * (STAIRS.width / 2 + 1.6);
      const x = STAIRS.a.x + dir.x * STAIRS.len * t - dir.z * off;
      const z = STAIRS.a.z + dir.z * STAIRS.len * t + dir.x * off;
      const yy = Math.max(terrainHeight(x, z), stairHeight(t) - 0.3);
      glowList.push({ x, y: yy, z, kind: 'post', t });
    }
  }

  torii(b, STAIRS.a.x - dir.x * 6, 3.4, STAIRS.a.z - dir.z * 6, rot + Math.PI / 2, 1.15);
  torii(b, STAIRS.b.x + dir.x * 4, y, STAIRS.b.z + dir.z * 4, rot + Math.PI / 2, 0.92);

  // --- terrace buildings. Local frame: +z points down the stairs.
  const fr = facing - Math.PI / 2;
  const toW = (lx, lz) => ({ x: S.x + lx * Math.cos(fr) - lz * Math.sin(fr), z: S.z + lx * Math.sin(fr) + lz * Math.cos(fr) });
  const copper = [0.16, 0.38, 0.33];
  const wood = '#7b5234', woodD = '#4a2f20', plaster = '#efe9dc';

  // Haiden (worship hall)
  {
    const p = toW(0, -6);
    b.setFrame(p.x, y, p.z, fr);
    b.box(0, 0, 15, 11, -2, 0.9, stone);
    b.box(0, 0, 13, 9, 0.9, 1.6, woodD);
    for (const [px, pz] of [[-6, -4], [6, -4], [6, 4], [-6, 4], [-2, 4], [2, 4], [-2, -4], [2, -4]]) b.box(px, pz, 0.45, 0.45, 1.6, 5.6, wood, { top: false });
    b.box(0, 0, 12.2, 8.2, 1.6, 5.4, '#5d3b26', { top: false });
    b.box(0, 4.15, 12.2, 0.1, 2.2, 5.0, plaster, { top: false, sides: true });
    b.box(0, 0, 12.8, 8.8, 5.4, 5.75, woodD);
    hipRoof(b, 13, 9, 5.75, 3.6, 2.2, copper, { irimoya: true, upturn: 0.35 });
    // kohai (front step roof) + steps
    b.quad([-3.2, 4.6, 7.8], [3.2, 4.6, 7.8], [3.2, 5.9, 4.3], [-3.2, 5.9, 4.3], copper, [0, 1, 1]);
    b.box(-2.6, 7.2, 0.35, 0.35, 0.9, 4.6, wood, { top: false });
    b.box(2.6, 7.2, 0.35, 0.35, 0.9, 4.6, wood, { top: false });
    for (let i = 0; i < 4; i++) b.box(0, 5.2 + i * 0.5, 5, 0.5, 0, 0.9 - i * 0.22, stone);
    // shimenawa rope + paper streamers
    b.beam([-2.2, 4.1, 7.1], [0, 3.75, 7.15], 0.32, '#d9c48a');
    b.beam([0, 3.75, 7.15], [2.2, 4.1, 7.1], 0.32, '#d9c48a');
    for (const sx of [-1.2, 0, 1.2]) b.box(sx, 7.2, 0.25, 0.03, 3.1, 3.75, '#ffffff', { top: false });
    // saisen box
    b.box(0, 6.1, 1.6, 0.9, 0.9, 1.7, woodD);
  }
  // Honden (main sanctuary) behind, raised
  {
    const p = toW(0, -17);
    b.setFrame(p.x, y, p.z, fr);
    b.box(0, 0, 8, 7, -2, 1.6, stone);
    b.box(0, 0, 5.5, 4.5, 1.6, 4.6, '#6a4229');
    gableRoof(b, 5.5, 4.5, 4.6, 2.2, 1.4, copper, [0.42, 0.27, 0.17], { ridgeAlongZ: true });
    // chigi + katsuogi on the ridge
    for (const sz of [-1, 1]) {
      b.beam([0, 6.4, sz * 2.9], [0, 7.7, sz * 3.6], 0.18, '#2c2620');
    }
    for (let i = -1; i <= 1; i++) b.box(0, i * 1.1, 0.5, 0.35, 6.9, 7.2, '#c9a64a');
    // tamagaki fence
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      b.box(Math.cos(a) * 6, Math.sin(a) * 5.4, 0.18, 0.18, 0, 1.4, VERMILION, { top: true });
    }
  }
  // Kagura-den (dance stage) — where the kuchikamizake ritual dance is held
  {
    const p = toW(13, 4);
    b.setFrame(p.x, y, p.z, fr + Math.PI / 2);
    b.box(0, 0, 8, 6, -2, 1.3, stone);
    b.box(0, 0, 7.4, 5.4, 1.3, 1.5, '#8a6040');
    for (const [px, pz] of [[-3.5, -2.5], [3.5, -2.5], [3.5, 2.5], [-3.5, 2.5]]) b.box(px, pz, 0.32, 0.32, 1.5, 4.6, wood, { top: false });
    b.box(0, -2.6, 7.2, 0.15, 1.5, 4.4, '#d9c9a3', { top: false });
    hipRoof(b, 7.4, 5.4, 4.6, 2.2, 1.3, copper, { irimoya: true, upturn: 0.2 });
  }
  // Shamusho (office) and chōzuya
  {
    const p = toW(-14, 2);
    b.setFrame(p.x, y, p.z, fr - Math.PI / 2);
    win.setFrame(p.x, y, p.z, fr - Math.PI / 2);
    b.box(0, 0, 10, 6, -2, 0.6, stone);
    b.box(0, 0, 9.4, 5.6, 0.6, 3.4, plaster, { top: false });
    b.box(0, 0, 9.4, 5.6, 0.6, 1.3, wood, { top: false });
    addWindowsOnWall(win, Math.random, { x0: -4, x1: 4, z: 2.8, y0: 1.4, y1: 2.8, out: 1, n: 3, ww: 1.6, wh: 1.1, kind: 5 });
    gableRoof(b, 9.4, 5.6, 3.4, 1.4, 0.9, [0.2, 0.22, 0.25], [0.88, 0.85, 0.78]);
    const q = toW(-8, 12);
    b.setFrame(q.x, y, q.z, fr);
    b.box(0, 0, 2.2, 1.2, 0, 0.9, '#8d897c');
    for (const [px, pz] of [[-1.3, -0.9], [1.3, -0.9], [1.3, 0.9], [-1.3, 0.9]]) b.box(px, pz, 0.2, 0.2, 0, 2.6, wood, { top: false });
    gableRoof(b, 2.8, 2.2, 2.6, 0.9, 0.5, copper, [0.48, 0.32, 0.2]);
  }
  // stone lanterns flanking the approach + komainu plinths
  for (const sx of [-4.5, 4.5]) {
    const p = toW(sx, 9);
    stoneLantern(b, p.x, y, p.z, 1.1);
    const q = toW(sx * 0.7, 13);
    b.setFrame(q.x, y, q.z, fr);
    b.box(0, 0, 1.0, 1.4, 0, 1.0, stone);
    b.box(0, 0, 0.6, 0.9, 1.0, 1.9, '#9a968a');
  }
  // festival lanterns strung across the terrace
  for (let i = 0; i < 14; i++) {
    const p = toW(-12 + i * 1.85, 14 + Math.sin(i * 0.45) * 0.4);
    glowList.push({ x: p.x, y: y + 3.4 - Math.sin((i / 13) * Math.PI) * 0.6, z: p.z, kind: 'hang' });
  }
}

// The go-shintai: a tiny stone sanctuary tucked under the great tree's roots.
function buildShintai(b) {
  const G = SITES.shintai;
  const a = Math.atan2(-G.z, -G.x); // facing the town
  const x = G.x + Math.cos(a) * 10, z = G.z + Math.sin(a) * 10;
  const y = terrainHeight(x, z);
  b.setFrame(x, y, z, a + Math.PI / 2);
  b.box(0, 0, 3.4, 2.6, -1.5, 0.5, '#8e8a7e');
  b.box(0, -0.2, 1.8, 1.4, 0.5, 2.0, '#9b978a');
  gableRoof(b, 1.8, 1.4, 2.0, 0.6, 0.35, [0.35, 0.34, 0.32], [0.6, 0.58, 0.53]);
  b.box(0, 0.75, 1.2, 0.06, 0.7, 1.7, '#3a3632', { top: false });
  // shimenawa around the rock
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    const r = 13.5, yy = SHINTAI_FLOOR + 5.5;
    b.setFrame(0, 0, 0, 0);
    b.beam([G.x + Math.cos(a0) * r, yy + Math.sin(i * 1.3) * 0.2, G.z + Math.sin(a0) * r], [G.x + Math.cos(a1) * r, yy + Math.sin((i + 1) * 1.3) * 0.2, G.z + Math.sin(a1) * r], 0.35, '#d8c58c');
  }
  // stepping stones across the moat
  for (let i = 0; i < 9; i++) {
    const r = 52 + i * 4.2;
    const sx = G.x + Math.cos(a) * r, sz = G.z + Math.sin(a) * r;
    b.setFrame(sx, terrainHeight(sx, sz), sz, a);
    b.box(0, 0, 1.6, 1.3, -0.6, 0.35, '#9a968a');
  }
}

// --- Substation, pylons, poles ------------------------------------------------

function lattice(b, x, y, z, rot, H, wBase, wTop, color) {
  b.setFrame(x, y, z, rot);
  const levels = 7;
  const corner = (lvl, i, j) => {
    const t = lvl / levels;
    const w = wBase + (wTop - wBase) * Math.pow(t, 0.8);
    return [i * w / 2, t * H, j * w / 2];
  };
  for (const [i, j] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    for (let l = 0; l < levels; l++) b.beam(corner(l, i, j), corner(l + 1, i, j), 0.32, color);
  }
  for (let l = 0; l < levels; l++) {
    const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = c[k], [i1, j1] = c[(k + 1) % 4];
      b.beam(corner(l, i0, j0), corner(l + 1, i1, j1), 0.14, color);
      b.beam(corner(l + 1, i0, j0), corner(l + 1, i1, j1), 0.14, color);
    }
  }
}

function buildSubstation(b, sub) {
  const steel = '#9aa1a6';
  b.setFrame(sub.x, sub.y, sub.z, sub.rot);
  // control building
  b.box(-26, -14, 16, 9, -2, 4.2, '#d8d4c8', { topColor: '#7b8084' });
  // transformers
  for (let i = 0; i < 4; i++) {
    const x = -8 + i * 9;
    b.setFrame(sub.x, sub.y, sub.z, sub.rot);
    b.box(x, 4, 5, 3.6, 0, 3.8, '#7f8a90');
    for (let k = 0; k < 6; k++) b.box(x - 2.4 + k * 0.95, 6.1, 0.12, 0.6, 0.4, 3.4, '#6d777c');
    b.cylinder(x - 1.2, 3, 0.22, 0.12, 3.8, 6.2, 6, '#b8b0a0');
    b.cylinder(x + 1.2, 3, 0.22, 0.12, 3.8, 6.2, 6, '#b8b0a0');
    b.box(x, 1.5, 3.8, 1.2, 3.8, 4.6, '#6d777c');
  }
  // gantries
  for (const gx of [-12, 2, 16, 30]) {
    b.setFrame(sub.x, sub.y, sub.z, sub.rot);
    b.beam([gx, 0, -12], [gx, 14, -12], 0.5, steel);
    b.beam([gx, 0, 12], [gx, 14, 12], 0.5, steel);
    b.beam([gx, 14, -12], [gx, 14, 12], 0.45, steel);
    b.beam([gx, 11, -12], [gx, 11, 12], 0.3, steel);
    b.beam([gx, 0, -12], [gx, 11, 0], 0.18, steel);
    b.beam([gx, 0, 12], [gx, 11, 0], 0.18, steel);
  }
  // fence
  b.setFrame(sub.x, sub.y, sub.z, sub.rot);
  const hw = sub.w / 2, hd = sub.d / 2;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    for (const [x, z] of [[-hw + t * sub.w, -hd], [-hw + t * sub.w, hd], [-hw, -hd + t * sub.d], [hw, -hd + t * sub.d]]) {
      b.box(x, z, 0.12, 0.12, 0, 2.4, '#8c9296', { top: false });
    }
  }
}

function catenary(points, a, b, sag, segs = 10) {
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    points.push(...p(t0), ...p(t1));
  }
}

function buildPylons(b, wires, sub) {
  // a high-voltage line from the substation climbing over the northern ridge
  const towers = [];
  const start = { x: sub.x - 30, z: sub.z - 40 };
  const dir = { x: -0.35, z: -0.94 };
  for (let i = 0; i < 9; i++) {
    const d = 120 + i * 330;
    const x = start.x + dir.x * d + Math.sin(i * 1.3) * 30, z = start.z + dir.z * d;
    towers.push({ x, z, y: terrainHeight(x, z) });
  }
  // second line south-east across the valley
  const t2 = [];
  for (let i = 0; i < 6; i++) {
    const x = sub.x + 140 + i * 300, z = sub.z + 380 + i * 160 + Math.sin(i) * 40;
    t2.push({ x, z, y: terrainHeight(x, z) });
  }
  const steel = '#b7bcc0';
  const all = [towers, t2];
  for (const line of all) {
    for (let i = 0; i < line.length; i++) {
      const t = line[i];
      const nxt = line[Math.min(line.length - 1, i + 1)], prv = line[Math.max(0, i - 1)];
      t.rot = Math.atan2(nxt.z - prv.z, nxt.x - prv.x) + Math.PI / 2;
      const H = 46;
      lattice(b, t.x, t.y - 1, t.z, t.rot, H, 9, 2.2, steel);
      // cross arms
      b.setFrame(t.x, t.y - 1, t.z, t.rot);
      for (const [hy, len] of [[H - 6, 9], [H - 14, 11], [H - 22, 9.5]]) {
        b.beam([-len, hy, 0], [len, hy, 0], 0.45, steel);
        b.beam([-len, hy, 0], [0, hy + 3, 0], 0.18, steel);
        b.beam([len, hy, 0], [0, hy + 3, 0], 0.18, steel);
      }
      b.beam([0, H, 0], [0, H + 4, 0], 0.3, steel);
      t.arms = [];
      for (const [hy, len] of [[H - 6, 9], [H - 14, 11], [H - 22, 9.5]]) {
        for (const s of [-1, 1]) {
          const lx = s * len, ly = hy - 2.2;
          t.arms.push([t.x + lx * Math.cos(t.rot), t.y - 1 + ly, t.z + lx * Math.sin(t.rot)]);
        }
      }
    }
    for (let i = 0; i < line.length - 1; i++) {
      for (let k = 0; k < line[i].arms.length; k++) catenary(wires, line[i].arms[k], line[i + 1].arms[k], 9, 16);
    }
  }
}

function buildPoles(b, wires, glow, poleLines) {
  const wood = '#6f6a62';
  const tops = [];
  for (const line of poleLines) {
    const tl = [];
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      const H = 10.5;
      b.setFrame(p.x, p.y, p.z, p.rot);
      b.cylinder(0, 0, 0.17, 0.12, -0.5, H, 6, wood, { top: true });
      b.box(0, 0, 0.14, 1.9, H - 0.9, H - 0.75, '#4b4a48');
      b.box(0, 0, 0.14, 1.4, H - 2.2, H - 2.05, '#4b4a48');
      if (i % 4 === 1) {
        b.cylinder(0.45, 0, 0.32, 0.32, H - 4.2, H - 3.0, 8, '#9aa0a3');
      }
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const arm = (lz, ly) => [p.x - lz * s, p.y + ly, p.z + lz * c];
      tl.push([arm(-0.85, H - 0.82), arm(0.85, H - 0.82), arm(0, H - 0.82), arm(-0.6, H - 2.12), arm(0.6, H - 2.12)]);
      // street lamp every few poles
      if (i % 3 === 0) {
        b.beam([0, H - 3.2, 0], [0, H - 3.0, -1.4], 0.08, '#555');
        glow.setFrame(p.x, p.y, p.z, p.rot);
        glow.kind = 2;
        glow.rnd = Math.random();
        glow.emit = [3.2, 2.7, 1.9];
        glow.box(0, -1.55, 0.35, 0.5, H - 3.25, H - 3.05, '#d8d8d0');
      }
    }
    for (let i = 0; i < tl.length - 1; i++) {
      for (let k = 0; k < 5; k++) catenary(wires, tl[i][k], tl[i + 1][k], 0.55 + (k % 3) * 0.12, 8);
    }
    tops.push(tl);
  }
  return tops;
}

function buildGuardrails(b) {
  const rails = '#e7e6df';
  const step = 4;
  for (let th = -Math.PI; th < Math.PI; th += step / 545) {
    const R = lakeRadius(th) + 22 - 4.5;
    const x = Math.cos(th) * R, z = Math.sin(th) * R;
    if (Math.abs(z - valleyCenterZ(x)) < 12 && x > 0) continue; // bridge
    if (Math.abs(th - 0.36) < 0.03) continue; // pier
    const y = terrainHeight(x, z);
    b.setFrame(x, y, z, th);
    b.box(0, 0, 0.12, 0.12, -0.3, 0.75, '#bdbcb5');
    const R2 = R, th2 = th + step / 545;
    const x2 = Math.cos(th2) * R2, z2 = Math.sin(th2) * R2, y2 = terrainHeight(x2, z2);
    b.setFrame(0, 0, 0, 0);
    b.beam([x, y + 0.62, z], [x2, y2 + 0.62, z2], 0.22, rails);
  }
}

function buildPier(b, P) {
  b.setFrame(P.x, 0, P.z, P.rot);
  const plank = '#8a6a4c';
  b.box(P.len / 2, 0, P.len, 2.6, 0.9, 1.15, plank);
  for (let i = 0; i <= 8; i++) {
    const x = (P.len * i) / 8;
    for (const zz of [-1.2, 1.2]) b.box(x, zz, 0.22, 0.22, -3, 1.0, '#5a4636', { top: false });
  }
  // little rowing boats tied alongside
  const boat = (bx, bz, r, c) => {
    b.setFrame(P.x + bx * Math.cos(P.rot) - bz * Math.sin(P.rot), 0.15, P.z + bx * Math.sin(P.rot) + bz * Math.cos(P.rot), P.rot + r);
    const L = 4.4, W = 1.4;
    const hull = [[-L / 2, 0], [-L / 2 + 0.6, W / 2], [L / 2 - 1, W / 2], [L / 2, 0], [L / 2 - 1, -W / 2], [-L / 2 + 0.6, -W / 2]];
    for (let i = 0; i < hull.length; i++) {
      const [x0, z0] = hull[i], [x1, z1] = hull[(i + 1) % hull.length];
      b.quad([x0 * 0.85, -0.1, z0 * 0.7], [x1 * 0.85, -0.1, z1 * 0.7], [x1, 0.55, z1], [x0, 0.55, z0], c, [(x0 + x1), 0, (z0 + z1) * 2]);
    }
    b.quad([-L / 2 + 0.5, 0.25, -W / 2 + 0.1], [L / 2 - 0.9, 0.25, -W / 2 + 0.1], [L / 2 - 0.9, 0.25, W / 2 - 0.1], [-L / 2 + 0.5, 0.25, W / 2 - 0.1], '#8f7458', [0, 1, 0]);
  };
  boat(18, 2.8, 0.1, '#e8e4da');
  boat(30, -3.0, -0.08, '#4f7fa8');
  boat(38, 3.1, 0.2, '#c45a3c');
}

function buildBridges(b, bridges) {
  for (const br of bridges) {
    const y = Math.max(terrainHeight(br.x, br.z), 2.6);
    b.setFrame(br.x, y, br.z, br.rot + Math.PI / 2);
    const L = br.wide ? 26 : 18, W = br.wide ? 8 : 5;
    b.box(0, 0, W, L, 0.2, 0.75, '#a4a29a');
    for (const s of [-1, 1]) {
      b.box((s * W) / 2, 0, 0.3, L, 0.75, 1.65, '#c9c7bf');
    }
  }
}

function buildVending(b, glow, v) {
  b.setFrame(v.x, v.y, v.z, v.rot);
  // little bus-stop shelter – the town's only "café"
  b.box(0, 0, 4.2, 2.2, -0.5, 0.15, '#9a968c');
  b.box(0, -1.0, 4.4, 0.12, 0.15, 2.5, '#cfd3d6', { top: false });
  b.quad([-2.4, 2.5, 1.4], [2.4, 2.5, 1.4], [2.4, 2.75, -1.2], [-2.4, 2.75, -1.2], '#5a7a9a', [0, 1, 0]);
  b.box(0.4, -0.4, 2.2, 0.45, 0.15, 0.6, '#c94e3c');
  glow.setFrame(v.x, v.y, v.z, v.rot);
  glow.kind = 3; glow.rnd = 0.5;
  glow.emit = [2.6, 2.9, 3.2];
  glow.box(-1.4, 0.2, 1.0, 0.8, 0.15, 1.95, '#d9534a');
  glow.emit = [3.4, 3.6, 3.8];
  glow.quad([-1.85, 0.9, 0.62], [-0.95, 0.9, 0.62], [-0.95, 1.8, 0.62], [-1.85, 1.8, 0.62], '#f4f4f0', [0, 0, 1]);
}

function buildGreenhouses(b, fields) {
  for (const f of fields) {
    if (!f.greenhouse) continue;
    const y = terrainHeight(f.x, f.z);
    b.setFrame(f.x, y, f.z, f.rot);
    const seg = 8, R = Math.min(f.d, 7) / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
      b.quad([-f.w / 2, Math.sin(a0) * R * 0.8 + 0.2, Math.cos(a0) * R], [f.w / 2, Math.sin(a0) * R * 0.8 + 0.2, Math.cos(a0) * R],
        [f.w / 2, Math.sin(a1) * R * 0.8 + 0.2, Math.cos(a1) * R], [-f.w / 2, Math.sin(a1) * R * 0.8 + 0.2, Math.cos(a1) * R], '#e4ece8', [0, 1, Math.cos((a0 + a1) / 2)]);
    }
    b.box(0, 0, f.w, R * 2, -0.5, 0.2, '#e4ece8', { top: false });
  }
}

// ---------------------------------------------------------------------------

export function buildStructures(layout) {
  const b = new Builder();
  const win = new Builder({ glow: true });
  const glowB = new Builder({ glow: true });
  const wirePts = [];
  const lanternSpots = [];

  for (const h of layout.houses) buildHouse(b, win, h);
  buildSchool(b, win);
  buildTownHall(b, win, layout.townHall);
  buildShrine(b, win, lanternSpots);
  buildShintai(b);
  buildSubstation(b, layout.substation);
  buildPylons(b, wirePts, layout.substation);
  const poleTops = buildPoles(b, wirePts, glowB, layout.poleLines);
  buildGuardrails(b);
  buildPier(b, layout.pier);
  buildBridges(b, layout.props.bridges);
  buildVending(b, glowB, layout.props.vending);
  buildGreenhouses(b, layout.fields);

  // Festival lanterns (chōchin): along the stairs, across the shrine terrace and
  // strung between the poles of the main street.
  const lanternBuilder = glowB;
  const lantern = (x, y, z, red) => {
    lanternBuilder.setFrame(x, y, z, 0);
    lanternBuilder.kind = 1;
    lanternBuilder.rnd = Math.random();
    lanternBuilder.emit = red ? [3.4, 1.1, 0.55] : [3.2, 2.4, 1.3];
    const c = red ? '#d8452f' : '#f2e6c8';
    lanternBuilder.cylinder(0, 0, 0.13, 0.22, -0.34, -0.12, 10, c, { top: false });
    lanternBuilder.cylinder(0, 0, 0.22, 0.22, -0.12, 0.12, 10, c, { top: false });
    lanternBuilder.cylinder(0, 0, 0.22, 0.13, 0.12, 0.34, 10, c, { top: true });
  };
  for (const s of lanternSpots) {
    if (s.kind === 'post') {
      b.setFrame(s.x, s.y, s.z, 0);
      b.box(0, 0, 0.14, 0.14, 0, 2.6, '#5a3c2a', { top: false });
      b.box(0, 0.35, 0.1, 0.8, 2.45, 2.55, '#5a3c2a');
      lantern(s.x + 0, s.y + 2.05, s.z, Math.round(s.t * 12) % 2 === 0);
    } else lantern(s.x, s.y, s.z, true);
  }
  // main street festival lanterns hanging from the pole wires
  for (const tl of poleTops.slice(0, 3)) {
    for (let i = 0; i < tl.length - 1; i++) {
      const a = tl[i][3], c = tl[i + 1][3];
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        lantern(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - 0.55 * 4 * t * (1 - t) - 0.6, a[2] + (c[2] - a[2]) * t, k % 2 === 0);
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'structures';
  const mat = toonMaterial({ vertexColors: true }, { key: 'buildings', rim: 0.35 });
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const gm = glowMaterial();
  const winMesh = new THREE.Mesh(win.build(), gm);
  group.add(winMesh);
  const glowMesh = new THREE.Mesh(glowB.build(), gm);
  glowMesh.castShadow = false;
  group.add(glowMesh);

  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  const wires = new THREE.LineSegments(wg, lineMaterial(0x1c1f24, { transparent: true, opacity: 0.85 }));
  wires.name = 'wires';
  group.add(wires);

  return { group, stats: { tris: b.triangleCount, windows: win.triangleCount / 2 } };
}
