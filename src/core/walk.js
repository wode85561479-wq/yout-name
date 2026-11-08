// First-person stroll: WASD / arrow keys to walk (Shift to hurry), drag to
// look around. On touch screens a hold-to-walk button appears.

import * as THREE from 'three';

export function createWalk(camera, canvas, { groundAt, isWater }) {
  const keys = new Set();
  let active = false;
  let yaw = 0, pitch = 0;
  let dragging = false, lastX = 0, lastY = 0;
  let touchWalk = 0;
  let eyeY = 0;
  const dir = new THREE.Vector3();
  const btn = document.getElementById('walk-btn');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onKey = (e) => {
    if (!active) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      if (e.type === 'keydown') keys.add(k); else keys.delete(k);
      if (k.startsWith('arrow')) e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    if (!active) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || !dragging) return;
    const s = e.pointerType === 'touch' ? 0.006 : 0.0035;
    yaw -= (e.clientX - lastX) * s;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - lastY) * s, -1.2, 1.2);
    lastX = e.clientX; lastY = e.clientY;
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  if (btn) {
    const on = (e) => { e.preventDefault(); touchWalk = 1; };
    const off = () => { touchWalk = 0; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  }

  return {
    get active() { return active; },
    enable() {
      active = true;
      camera.getWorldDirection(dir);
      yaw = Math.atan2(-dir.x, -dir.z);
      pitch = THREE.MathUtils.clamp(Math.asin(dir.y), -0.5, 0.5);
      eyeY = groundAt(camera.position.x, camera.position.z) + 1.6;
      if (btn) btn.hidden = !window.matchMedia('(pointer: coarse)').matches;
    },
    disable() {
      active = false;
      keys.clear();
      touchWalk = 0;
      if (btn) btn.hidden = true;
    },
    /** Returns a point the orbit controls can look at when walking ends. */
    lookTarget(out = new THREE.Vector3()) {
      camera.getWorldDirection(dir);
      return out.copy(camera.position).addScaledVector(dir, 30);
    },
    update(dt) {
      if (!active) return;
      const run = keys.has('shift') ? 3 : 1;
      let f = touchWalk, r = 0;
      if (keys.has('w') || keys.has('arrowup')) f += 1;
      if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      if (keys.has('d')) r += 1;
      if (keys.has('a')) r -= 1;
      if (keys.has('arrowleft')) yaw += dt * 1.6;
      if (keys.has('arrowright')) yaw -= dt * 1.6;
      const speed = 4.2 * run;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let nx = camera.position.x + (fx * f + rx * r) * speed * dt;
      let nz = camera.position.z + (fz * f + rz * r) * speed * dt;
      if (isWater(nx, nz)) { nx = camera.position.x; nz = camera.position.z; }
      const target = Math.max(groundAt(nx, nz), 0) + 1.6;
      eyeY += (target - eyeY) * Math.min(1, dt * 10);
      // a gentle footstep bob while moving
      const moving = Math.abs(f) + Math.abs(r) > 0;
      const bob = moving && !reducedMotion ? Math.sin(performance.now() * 0.011 * run) * 0.04 : 0;
      camera.position.set(nx, eyeY + bob, nz);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    },
  };
}
