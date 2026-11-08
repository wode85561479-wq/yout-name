// Tiny CPU mesh builder: accumulates flat-shaded triangles with vertex
// colours (plus optional emission / random attributes) in a local frame
// that can be moved and rotated, then bakes them into one BufferGeometry.

import * as THREE from 'three';

const _c = new THREE.Color();

export class Builder {
  constructor({ glow = false } = {}) {
    this.glow = glow;
    this.p = [];
    this.n = [];
    this.c = [];
    this.e = glow ? [] : null;
    this.r = glow ? [] : null;
    this.k = glow ? [] : null;
    this.setFrame(0, 0, 0, 0);
    this.emit = [0, 0, 0];
    this.rnd = 0;
    this.kind = 0;
  }

  setFrame(x, y, z, rot = 0) {
    this.ox = x; this.oy = y; this.oz = z;
    this.cr = Math.cos(rot); this.sr = Math.sin(rot);
    return this;
  }

  /** local -> world */
  X(lx, ly, lz) {
    return [this.ox + lx * this.cr - lz * this.sr, this.oy + ly, this.oz + lx * this.sr + lz * this.cr];
  }

  color(c) {
    if (c instanceof THREE.Color) return [c.r, c.g, c.b];
    if (Array.isArray(c)) return c;
    _c.set(c);
    return [_c.r, _c.g, _c.b];
  }

  triW(A, B, C, col) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
    if (this.glow) {
      const e = this.emit;
      this.e.push(e[0], e[1], e[2], e[0], e[1], e[2], e[0], e[1], e[2]);
      this.r.push(this.rnd, this.rnd, this.rnd);
      this.k.push(this.kind, this.kind, this.kind);
    }
  }

  /**
   * Quad from four local points. `out` is an approximate outward normal in
   * local space; winding is fixed automatically so the face points that way.
   */
  quad(a, b, c, d, color, out = null) {
    const col = this.color(color);
    let A = this.X(...a), B = this.X(...b), C = this.X(...c), D = this.X(...d);
    if (out) {
      const o = this.dirW(out);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * o[0] + ny * o[1] + nz * o[2] < 0) { const t = B; B = D; D = t; }
    }
    this.triW(A, B, C, col);
    this.triW(A, C, D, col);
  }

  tri(a, b, c, color, out = null) {
    const col = this.color(color);
    let A = this.X(...a), B = this.X(...b), C = this.X(...c);
    if (out) {
      const o = this.dirW(out);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * o[0] + ny * o[1] + nz * o[2] < 0) { const t = B; B = C; C = t; }
    }
    this.triW(A, B, C, col);
  }

  dirW(d) {
    return [d[0] * this.cr - d[2] * this.sr, d[1], d[0] * this.sr + d[2] * this.cr];
  }

  /** Axis-aligned (in local frame) box. y0 = bottom, y1 = top. */
  box(cx, cz, w, d, y0, y1, color, { top = true, bottom = false, sides = true, topColor = null } = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    if (sides) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, [0, 0, 1]);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, [0, 0, -1]);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, [1, 0, 0]);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, [-1, 0, 0]);
    }
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], topColor || color, [0, 1, 0]);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, [0, -1, 0]);
  }

  /** Box between two local points (a beam), square section `t`. */
  beam(a, b, t, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const fx = dx / L, fy = dy / L, fz = dz / L;
    // pick a perpendicular
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(fy) > 0.9) { ux = 1; uy = 0; }
    // s = f x u
    let sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
    let l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
    // u = s x f
    ux = sy * fz - sz * fy; uy = sz * fx - sx * fz; uz = sx * fy - sy * fx;
    const h = t / 2;
    const corner = (p, i, j) => [p[0] + (sx * i + ux * j) * h, p[1] + (sy * i + uy * j) * h, p[2] + (sz * i + uz * j) * h];
    const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % 4];
      const out = [(sx * (i0 + i1) + ux * (j0 + j1)), (sy * (i0 + i1) + uy * (j0 + j1)), (sz * (i0 + i1) + uz * (j0 + j1))];
      this.quad(corner(a, i0, j0), corner(b, i0, j0), corner(b, i1, j1), corner(a, i1, j1), color, out);
    }
  }

  /** Vertical cylinder (low poly) centred at local (cx, cz). */
  cylinder(cx, cz, r0, r1, y0, y1, seg, color, { top = true } = {}) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const am = (a0 + a1) / 2;
      this.quad(
        [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1],
        color, [Math.cos(am), 0, Math.sin(am)]
      );
      if (top) this.tri([cx, y1, cz], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], color, [0, 1, 0]);
    }
  }

  get triangleCount() { return this.p.length / 9; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.glow) {
      g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.e, 3));
      g.setAttribute('aRand', new THREE.Float32BufferAttribute(this.r, 1));
      g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.k, 1));
    }
    g.computeBoundingSphere();
    return g;
  }
}

/** Slight per-object colour jitter so a town of identical paints still breathes. */
export function jitter(hex, rand, amt = 0.06) {
  const c = new THREE.Color(hex);
  const k = 1 + (rand() - 0.5) * 2 * amt;
  return [c.r * k, c.g * k, c.b * k];
}
