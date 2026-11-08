// Hand-placed camera shots around Itomori and a slow cinematic tour.

import * as THREE from 'three';
import { terrainHeight, SITES, SITE_HEIGHTS, STAIRS, valleyCenterZ, lakeRadius, SHINTAI_FLOOR } from '../world/heightfield.js';
import { ERA, CRATER2 } from './era.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function makeShots() {
  const S = SITES.school;
  const sh = SITE_HEIGHTS.school;
  const d = STAIRS.dir;
  const G = SITES.shintai;
  const toTown = new THREE.Vector2(-G.x, -G.z).normalize();
  const pierTh = 0.36;
  const pier = { x: Math.cos(pierTh) * (lakeRadius(pierTh) - 20), z: Math.sin(pierTh) * (lakeRadius(pierTh) - 20) };
  const streetX = 760;
  const streetZ = valleyCenterZ(streetX) + 72;

  if (ERA.after) {
    // Eight years on: the second crater, the deserted streets, the surviving school.
    const C = CRATER2;
    const away = new THREE.Vector2(S.x - C.x, S.z - C.z).normalize();
    const rim = { x: C.x + away.x * (C.R + 70), z: C.z + away.y * (C.R + 70) };
    return [
      { id: 'hero', name: '瓢箪形的糸守湖', sub: '八年后 · 高中后山远眺', pos: V(S.x + 40, sh + 95, S.z + 90), target: V(-170, 40, 60), drift: V(40, 6, -10), fov: 58 },
      { id: 'crater', name: '新的火口湖', sub: '宫水神社旧址', pos: V(rim.x, terrainHeight(rim.x, rim.z) + 24, rim.z), target: V(C.x - away.x * 120, 0, C.z - away.y * 120), drift: V(-away.y * 30, 2, away.x * 30), fov: 55 },
      { id: 'street', name: '无人的街道', sub: '电线杆仍然立着', pos: V(streetX, terrainHeight(streetX, streetZ) + 1.8, streetZ + 1.2), target: V(streetX - 260, terrainHeight(streetX - 260, streetZ) + 22, valleyCenterZ(streetX - 260) + 66), drift: V(-24, 0.2, 0), fov: 55 },
      { id: 'shore', name: '湖畔栈桥', sub: '对岸是新湖', pos: V(pier.x + 6, 4.2, pier.z + 4), target: V(-420, 60, -120), drift: V(-10, 0.5, 14), fov: 50 },
      { id: 'aerial', name: '鸟瞰', sub: '两个火口相连', pos: V(700, 1500, 1500), target: V(-150, 0, -200), drift: V(-240, -40, 0), fov: 45 },
      { id: 'shintai', name: '御神体', sub: '山顶火口', pos: V(G.x - toTown.x * 168, SHINTAI_FLOOR + 44, G.z - toTown.y * 168), target: V(G.x + toTown.x * 40, SHINTAI_FLOOR + 16, G.z + toTown.y * 40), drift: V(-toTown.y * 30, 4, toTown.x * 30), fov: 50 },
      { id: 'school', name: '糸守高中', sub: '当年的避难所', pos: V(S.x + 40, sh + 2.2, S.z + 70), target: V(S.x - 10, sh + 9, S.z - 40), drift: V(-20, 0.5, 0), fov: 52 },
    ];
  }

  return [
    {
      id: 'hero', name: '糸守湖全景', sub: '高中后山远眺',
      pos: V(S.x + 40, sh + 95, S.z + 90), target: V(140, 70, 260), drift: V(40, 6, -10), fov: 55,
    },
    {
      id: 'shrine', name: '宫水神社', sub: '参道石阶',
      pos: V(STAIRS.a.x - d.x * 16, 4.9, STAIRS.a.z - d.z * 16), target: V(STAIRS.b.x, SITE_HEIGHTS.shrine - 6, STAIRS.b.z), drift: V(d.x * 7, 0.4, d.z * 7), fov: 58,
    },
    {
      id: 'shrineView', name: '神社远眺', sub: '从境内望向小镇',
      pos: V(STAIRS.b.x - d.x * 2 + d.z * 3, SITE_HEIGHTS.shrine + 7, STAIRS.b.z - d.z * 2 - d.x * 3), target: V(380, 10, -180), drift: V(-d.z * 10, 2, d.x * 10), fov: 50,
    },
    {
      id: 'street', name: '町中街道', sub: '电线杆与夕阳',
      pos: V(streetX, terrainHeight(streetX, streetZ) + 1.8, streetZ + 1.2), target: V(streetX - 260, terrainHeight(streetX - 260, streetZ) + 22, valleyCenterZ(streetX - 260) + 66), drift: V(-24, 0.2, 0), fov: 55,
    },
    {
      id: 'shore', name: '湖畔栈桥', sub: '湖面倒影',
      pos: V(pier.x + 6, 4.2, pier.z + 4), target: V(-420, 60, -120), drift: V(-10, 0.5, 14), fov: 50,
    },
    {
      id: 'aerial', name: '鸟瞰', sub: '陨石湖与山谷',
      pos: V(900, 1300, 1700), target: V(80, 0, -150), drift: V(-240, -40, 0), fov: 45,
    },
    {
      id: 'shintai', name: '御神体', sub: '山顶火口 · 片割れ时',
      pos: V(G.x - toTown.x * 168, SHINTAI_FLOOR + 44, G.z - toTown.y * 168), target: V(G.x + toTown.x * 40, SHINTAI_FLOOR + 16, G.z + toTown.y * 40), drift: V(-toTown.y * 30, 4, toTown.x * 30), fov: 50,
    },
    {
      id: 'school', name: '糸守高中', sub: '校园操场',
      pos: V(S.x + 40, sh + 2.2, S.z + 70), target: V(S.x - 10, sh + 9, S.z - 40), drift: V(-20, 0.5, 0), fov: 52,
    },
  ];
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Director {
  constructor(camera, controls, shots) {
    this.camera = camera;
    this.controls = controls;
    this.shots = shots;
    this.flight = null;
    this.tour = false;
    this.tourIndex = 0;
    this.hold = 0;
    this.current = null;
    this.onShot = null;
  }

  go(idOrIndex, duration = 3.2) {
    const shot = typeof idOrIndex === 'number' ? this.shots[idOrIndex] : this.shots.find((s) => s.id === idOrIndex);
    if (!shot) return;
    this.current = shot;
    if (this.onShot) this.onShot(shot);
    this.flight = {
      t: 0,
      dur: duration,
      p0: this.camera.position.clone(),
      t0: this.controls.target.clone(),
      f0: this.camera.fov,
      p1: shot.pos.clone(),
      t1: shot.target.clone(),
      f1: shot.fov || 50,
    };
    if (duration <= 0) { this._apply(1); this.flight = null; }
    this.hold = 0;
  }

  _apply(k) {
    const f = this.flight;
    const e = ease(k);
    // arc the path upwards a little for long moves
    const dist = f.p0.distanceTo(f.p1);
    const lift = Math.min(400, dist * 0.25) * Math.sin(Math.PI * e);
    this.camera.position.lerpVectors(f.p0, f.p1, e);
    this.camera.position.y += lift;
    this.controls.target.lerpVectors(f.t0, f.t1, e);
    this.camera.fov = f.f0 + (f.f1 - f.f0) * e;
    this.camera.updateProjectionMatrix();
  }

  startTour() {
    this.tour = true;
    this.tourIndex = this.current ? this.shots.indexOf(this.current) : 0;
    this.go(this.tourIndex, 3.5);
  }

  stopTour() { this.tour = false; }

  cancel() {
    this.flight = null;
    this.tour = false;
  }

  get busy() { return !!this.flight || this.tour; }

  update(dt) {
    if (this.flight) {
      this.flight.t += dt;
      const k = Math.min(1, this.flight.t / this.flight.dur);
      this._apply(k);
      if (k >= 1) this.flight = null;
      return;
    }
    if (this.tour && this.current) {
      this.hold += dt;
      const s = this.current;
      // slow dolly while holding the shot
      const k = Math.min(1, this.hold / 13);
      const e = k * k * (3 - 2 * k);
      this.camera.position.copy(s.pos).addScaledVector(s.drift, e);
      this.controls.target.copy(s.target).addScaledVector(s.drift, e * 0.35);
      if (this.hold > 13) {
        this.tourIndex = (this.tourIndex + 1) % this.shots.length;
        this.go(this.tourIndex, 4.0);
      }
    }
  }
}
