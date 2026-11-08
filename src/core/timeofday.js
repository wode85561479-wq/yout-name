// Keyframed palettes for a full day over Itomori. Colours are authored in
// sRGB (as a painter would pick them) and blended in linear space.

import * as THREE from 'three';
import { U } from './materials.js';

const K = (t, o) => ({ t, ...o });

// prettier-ignore
const KEYS = [
  K(0.0,  { top: '#040920', mid: '#0b1838', hor: '#1a2850', fogSun: '#25305a', sun: '#8ea6e6', sunI: 0.55, hemiS: '#2c3c70', hemiG: '#0e121c', hemiI: 1.27, cLit: '#36466f', cShade: '#121a33', cRim: '#6878b0', wDeep: '#050d1a', wShal: '#10283e', rim: '#7a8ad8', exp: 1.25, bloom: 1.05, night: 1.0, stars: 1.0, fog: 11960, rays: 0.0 }),
  K(4.4,  { top: '#060c26', mid: '#101d42', hor: '#22305a', fogSun: '#2e3866', sun: '#8ea6e6', sunI: 0.5, hemiS: '#2c3c70', hemiG: '#0e121c', hemiI: 1.27, cLit: '#3a4a75', cShade: '#141c36', cRim: '#6878b0', wDeep: '#050d1a', wShal: '#10283e', rim: '#7a8ad8', exp: 1.25, bloom: 1.0, night: 1.0, stars: 1.0, fog: 11960, rays: 0.0 }),
  K(5.2,  { top: '#152a5e', mid: '#4a5896', hor: '#c6a2c0', fogSun: '#f4a88c', sun: '#ffae8c', sunI: 0.7, hemiS: '#6474b4', hemiG: '#3a3042', hemiI: 1.99, cLit: '#f2a8a6', cShade: '#585a8e', cRim: '#ffd0b4', wDeep: '#0f2340', wShal: '#3a6688', rim: '#ffb0a0', exp: 1.15, bloom: 1.05, night: 0.6, stars: 0.35, fog: 9360, rays: 0.2 }),
  K(6.2,  { top: '#2a5aa6', mid: '#86ace0', hor: '#d6d8e8', fogSun: '#ffc488', sun: '#ffc892', sunI: 2.3, hemiS: '#88a6e0', hemiG: '#5a5a6a', hemiI: 2.10, cLit: '#ffe2c4', cShade: '#8a8ab8', cRim: '#fff0d4', wDeep: '#14365c', wShal: '#4e8aa4', rim: '#ffd0a0', exp: 1.05, bloom: 0.95, night: 0.1, stars: 0.0, fog: 7800, rays: 0.55 }),
  K(8.5,  { top: '#1858cc', mid: '#5a9cf0', hor: '#c0e4ff', fogSun: '#fff0d6', sun: '#fff3de', sunI: 3.0, hemiS: '#9cc4ff', hemiG: '#5e6e58', hemiI: 2.52, cLit: '#ffffff', cShade: '#9db0d8', cRim: '#ffffff', wDeep: '#11466a', wShal: '#3aa0a8', rim: '#fff4dc', exp: 0.94, bloom: 0.7, night: 0.0, stars: 0.0, fog: 8580, rays: 0.3 }),
  K(12.5, { top: '#1350c6', mid: '#4890ec', hor: '#b2dbff', fogSun: '#fff6e4', sun: '#fffaf0', sunI: 3.0, hemiS: '#a0c8ff', hemiG: '#62705a', hemiI: 2.62, cLit: '#ffffff', cShade: '#a4b6dc', cRim: '#ffffff', wDeep: '#0f4a70', wShal: '#38a6ac', rim: '#fff8e8', exp: 0.9, bloom: 0.65, night: 0.0, stars: 0.0, fog: 8840, rays: 0.22 }),
  K(15.5, { top: '#1852c0', mid: '#5896e8', hor: '#c6e2ff', fogSun: '#ffe8c2', sun: '#fff0d4', sunI: 2.95, hemiS: '#9cc0fa', hemiG: '#66705a', hemiI: 2.52, cLit: '#fffcf4', cShade: '#a0aed6', cRim: '#fff6e0', wDeep: '#114468', wShal: '#3c9ca6', rim: '#ffecc8', exp: 0.93, bloom: 0.72, night: 0.0, stars: 0.0, fog: 8320, rays: 0.35 }),
  K(17.0, { top: '#2858b6', mid: '#7ea6de', hor: '#e2dcd6', fogSun: '#ffc27c', sun: '#ffd098', sunI: 3.1, hemiS: '#8aa8ec', hemiG: '#5e5a66', hemiI: 2.62, cLit: '#fff0d2', cShade: '#8a92c4', cRim: '#ffe0a0', wDeep: '#193c64', wShal: '#4a88a0', rim: '#ffcc88', exp: 1.0, bloom: 0.9, night: 0.0, stars: 0.0, fog: 7020, rays: 0.7 }),
  K(17.75,{ top: '#2a469a', mid: '#9a86c4', hor: '#d6a6bc', fogSun: '#ff9a52', sun: '#ffa060', sunI: 2.1, hemiS: '#7c80d0', hemiG: '#4a4058', hemiI: 2.62, cLit: '#ffc48a', cShade: '#7868a6', cRim: '#ffd08c', wDeep: '#1c2850', wShal: '#68668e', rim: '#ffa070', exp: 1.03, bloom: 1.1, night: 0.12, stars: 0.0, fog: 6760, rays: 0.85 }),
  K(18.35,{ top: '#1a2266', mid: '#6e52a4', hor: '#b48eb4', fogSun: '#ff8a66', sun: '#ff8070', sunI: 0.75, hemiS: '#6c66c0', hemiG: '#3a3250', hemiI: 2.73, cLit: '#ff9c9e', cShade: '#4a3a7c', cRim: '#ffb2a2', wDeep: '#141a40', wShal: '#4a3a6c', rim: '#ff9aa0', exp: 1.1, bloom: 1.2, night: 0.45, stars: 0.35, fog: 7800, rays: 0.4 }),
  K(19.0, { top: '#0a1242', mid: '#26306c', hor: '#5a4a7c', fogSun: '#6a4a72', sun: '#8090d0', sunI: 0.45, hemiS: '#3a4272', hemiG: '#181828', hemiI: 1.99, cLit: '#4c4c82', cShade: '#1a1a3a', cRim: '#7a70a2', wDeep: '#08102a', wShal: '#1c2a4c', rim: '#8a8ad0', exp: 1.2, bloom: 1.1, night: 0.85, stars: 0.8, fog: 10400, rays: 0.0 }),
  K(20.0, { top: '#040a22', mid: '#0c1a3c', hor: '#1c2a54', fogSun: '#27325c', sun: '#8ea6e6', sunI: 0.55, hemiS: '#2c3c70', hemiG: '#0e121c', hemiI: 1.27, cLit: '#36466f', cShade: '#121a33', cRim: '#6878b0', wDeep: '#050d1a', wShal: '#10283e', rim: '#7a8ad8', exp: 1.25, bloom: 1.05, night: 1.0, stars: 1.0, fog: 11960, rays: 0.0 }),
  K(24.0, { top: '#040920', mid: '#0b1838', hor: '#1a2850', fogSun: '#25305a', sun: '#8ea6e6', sunI: 0.55, hemiS: '#2c3c70', hemiG: '#0e121c', hemiI: 1.27, cLit: '#36466f', cShade: '#121a33', cRim: '#6878b0', wDeep: '#050d1a', wShal: '#10283e', rim: '#7a8ad8', exp: 1.25, bloom: 1.05, night: 1.0, stars: 1.0, fog: 11960, rays: 0.0 }),
];

const COLOR_KEYS = ['top', 'mid', 'hor', 'fogSun', 'sun', 'hemiS', 'hemiG', 'cLit', 'cShade', 'cRim', 'wDeep', 'wShal', 'rim'];
const NUM_KEYS = ['sunI', 'hemiI', 'exp', 'bloom', 'night', 'stars', 'fog', 'rays'];
// pre-convert colours
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = new THREE.Color(k[c]);

export const MOON_DIR = new THREE.Vector3(0.5, 0.62, 0.6).normalize();
export const COMET_HEAD = new THREE.Vector3(0.22, 0.2, 0.95).normalize();
export const COMET_TAIL = (() => {
  const t = new THREE.Vector3(0.9, 0.62, -0.25);
  t.addScaledVector(COMET_HEAD, -t.dot(COMET_HEAD)).normalize();
  return t;
})();

export function sunDirection(hour, out = new THREE.Vector3()) {
  const phi = (Math.PI * (hour - 6)) / 12;
  return out.set(Math.cos(phi), Math.sin(phi) * 0.85 - 0.05, Math.sin(phi) * 0.55).normalize();
}

const ease = (t) => t * t * (3 - 2 * t);

export const TOD = {
  sunI: 1, hemiI: 2.10, exp: 1, bloom: 1, night: 0, stars: 0, fog: 7800, rays: 0.3,
  sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(),
  lightDir: new THREE.Vector3(), sunDir: new THREE.Vector3(), sunVisible: 1,
};

export function evaluate(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = ease((h - a.t) / (b.t - a.t));
  const out = {};
  for (const c of COLOR_KEYS) out[c] = a[c].clone().lerp(b[c], t);
  for (const n of NUM_KEYS) out[n] = a[n] + (b[n] - a[n]) * t;
  return out;
}

/**
 * Applies the palette for `hour` to the shared uniforms and the given lights.
 * Returns the evaluated values for the post-processing stack.
 */
export function applyTimeOfDay(hour, { sunLight, hemiLight, comet = true, cometSplit = 0 }) {
  const p = evaluate(hour);
  const sunDir = sunDirection(hour, TOD.sunDir);

  U.uSkyTop.value.copy(p.top);
  U.uSkyMid.value.copy(p.mid);
  U.uSkyHorizon.value.copy(p.hor);
  U.uFogColor.value.copy(p.hor);
  U.uFogSunColor.value.copy(p.fogSun);
  U.uSunDir.value.copy(sunDir);
  U.uMoonDir.value.copy(MOON_DIR);
  U.uCloudLit.value.copy(p.cLit);
  U.uCloudShade.value.copy(p.cShade);
  U.uCloudRim.value.copy(p.cRim);
  U.uWaterDeep.value.copy(p.wDeep);
  U.uWaterShallow.value.copy(p.wShal);
  U.uRimColor.value.copy(p.rim);
  U.uNight.value = p.night;
  U.uStars.value = p.stars;
  U.uFogDensity.value = 1 / p.fog;
  U.uDusk.value = Math.max(0, 1 - Math.abs(hour - 18.0) / 1.2);

  // sun disk colour: visible while above the horizon
  const sunUp = THREE.MathUtils.smoothstep(sunDir.y, -0.04, 0.02);
  U.uSunColor.value.copy(p.sun).multiplyScalar(sunUp);

  // key light: the sun (clamped just above the horizon) or the moon at night
  const useSun = sunDir.y > -0.12;
  const ld = TOD.lightDir;
  if (useSun) ld.set(sunDir.x, Math.max(sunDir.y, 0.05), sunDir.z).normalize();
  else ld.copy(MOON_DIR);
  U.uLightDir.value.copy(ld);
  U.uLightColor.value.copy(p.sun).multiplyScalar(p.sunI / Math.PI);

  const amb = p.hemiS.clone().lerp(p.hemiG, 0.35).multiplyScalar(p.hemiI / Math.PI);
  U.uAmbient.value.copy(amb);

  if (sunLight) {
    sunLight.color.copy(p.sun);
    sunLight.intensity = p.sunI;
  }
  if (hemiLight) {
    hemiLight.color.copy(p.hemiS);
    hemiLight.groundColor.copy(p.hemiG);
    hemiLight.intensity = p.hemiI;
  }

  const dark = 1 - THREE.MathUtils.smoothstep(sunDir.y, -0.15, 0.25);
  U.uComet.value = comet ? 0.22 + 0.78 * dark : 0;
  U.uCometSplit.value = cometSplit;
  U.uCometHead.value.copy(COMET_HEAD);
  U.uCometTail.value.copy(COMET_TAIL);
  U.uLanterns.value = THREE.MathUtils.smoothstep(p.night, 0.15, 0.6);

  TOD.sunVisible = sunUp;
  Object.assign(TOD, { sunI: p.sunI, hemiI: p.hemiI, exp: p.exp, bloom: p.bloom, night: p.night, stars: p.stars, fog: p.fog, rays: p.rays });
  return p;
}

export function phaseName(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 4.6) return ['深夜', 'shin\'ya'];
  if (h < 5.8) return ['黎明', 'かわたれ時'];
  if (h < 7.0) return ['日の出', 'sunrise'];
  if (h < 11.0) return ['朝', 'morning'];
  if (h < 14.5) return ['昼', 'noon'];
  if (h < 16.6) return ['午後', 'afternoon'];
  if (h < 17.6) return ['夕方', 'golden hour'];
  if (h < 18.1) return ['夕焼け', 'sunset'];
  if (h < 18.8) return ['黄昏 · 片割れ時', 'katawaredoki'];
  if (h < 20.0) return ['宵', 'dusk'];
  return ['夜', 'night'];
}
