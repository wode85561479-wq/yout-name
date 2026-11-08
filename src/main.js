// 糸守町 · Itomori — entry point.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { patchFogChunks, U } from './core/materials.js';
import { applyTimeOfDay, TOD } from './core/timeofday.js';
import { makeShots, Director } from './core/shots.js';
import { buildLayout } from './world/layout.js';
import { buildTerrain } from './world/terrain.js';
import { buildLake, buildMoat } from './world/water.js';
import { buildStructures } from './world/buildings.js';
import { buildVegetation } from './world/vegetation.js';
import { buildGrass, GRASS_LAYER } from './world/grass.js';
import { terrainHeight } from './world/heightfield.js';
import { buildSky } from './sky/sky.js';
import { buildClouds } from './sky/clouds.js';
import { buildPost } from './fx/post.js';
import { buildMotes, buildBirds } from './fx/life.js';
import { buildUI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 600;
const quality = params.get('q') || (isMobile ? 'low' : 'high');

const state = {
  hour: params.has('t') ? parseFloat(params.get('t')) : 17.0,
  flow: params.get('flow') === '1',
  speed: 0.06, // in-game hours per second
  comet: params.get('comet') !== '0',
  split: params.get('split') === '1',
  splitAmt: params.get('split') === '1' ? 1 : 0,
  festival: params.get('festival') !== '0',
  tour: false,
  uiHidden: false,
  debug: params.has('debug'),
};

const loaderMsg = document.getElementById('loader-msg');
const loaderBar = document.getElementById('loader-progress');
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function step(msg, pct) {
  loaderMsg.textContent = msg;
  loaderBar.style.width = `${pct}%`;
  await frame();
}

async function main() {
  patchFogChunks();
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
  const maxPR = quality === 'low' ? 1 : 1.6;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // shadows are re-rendered every other frame (the map and its matrix stay consistent)
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  let frameNo = 0;

  const scene = new THREE.Scene();
  // Enables the fog chunks; actual values come from the shared uniforms.
  scene.fog = new THREE.FogExp2(0xffffff, 0.0001);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 34000);
  camera.position.set(0, 400, 1200);

  await step('规划町并 · 道路与田地…', 8);
  const layout = buildLayout({ groundRes: quality === 'low' ? 2048 : 4096 });

  await step('隆起群山 · 陨石湖…', 28);
  const terrain = buildTerrain(layout, renderer, quality);
  scene.add(terrain.group);

  await step('糸守湖 · 湖面…', 42);
  const lake = buildLake(renderer, quality);
  scene.add(lake);
  scene.add(buildMoat());

  await step('建造房屋 · 神社 · 高中…', 52);
  const structures = buildStructures(layout);
  scene.add(structures.group);

  await step('种植杉林…', 66);
  const veg = buildVegetation(layout, quality, renderer);
  scene.add(veg.group);
  const grass = buildGrass(layout, quality);
  scene.add(grass.group);
  camera.layers.enable(GRASS_LAYER);
  // keep the dense grass out of the lake reflection pass
  lake.getReflectionCamera(camera).layers.disable(GRASS_LAYER);

  await step('天空与积云…', 80);
  scene.add(buildSky());
  const clouds = buildClouds(quality);
  scene.add(clouds.group);
  const motes = buildMotes(quality === 'low' ? 400 : 900);
  scene.add(motes.object);
  const birds = buildBirds();
  scene.add(birds.object);

  // Lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const smSize = quality === 'low' ? 2048 : 4096;
  sun.shadow.mapSize.set(smSize, smSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9cc4ff, 0x6e7a4a, 1.2);
  scene.add(hemi);

  // Controls + camera director
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 7000;
  controls.maxPolarAngle = Math.PI * 0.72;
  controls.zoomSpeed = 0.9;
  const shots = makeShots();
  const director = new Director(camera, controls, shots);
  const stopAuto = () => {
    if (director.busy) {
      director.cancel();
      state.tour = false;
      ui.refresh();
    }
  };
  canvas.addEventListener('pointerdown', stopAuto);
  canvas.addEventListener('wheel', stopAuto, { passive: true });

  await step('后期 · 光晕与色彩…', 88);
  const post = buildPost(renderer, scene, camera, quality);
  post.setSize(window.innerWidth, window.innerHeight);

  const hooks = {
    setHour(h, animate) {
      if (animate) {
        hourTween = { from: state.hour, to: h, t: 0, dur: 2.5 };
        // take the short way round the clock
        if (hourTween.to - hourTween.from > 12) hourTween.from += 24;
        if (hourTween.from - hourTween.to > 12) hourTween.to += 24;
      } else {
        hourTween = null;
        state.hour = h;
      }
    },
  };
  let hourTween = null;
  const ui = buildUI(state, director, shots, hooks);

  // First frame setup + shader warm-up.
  const shotParam = params.get('shot');
  director.go(shotParam && !isNaN(+shotParam) ? +shotParam : shotParam || 'hero', 0);
  director.flight = null;
  camera.position.copy(director.current.pos);
  controls.target.copy(director.current.target);
  controls.update();
  applyTimeOfDay(state.hour, { sunLight: sun, hemiLight: hemi, comet: state.comet, cometSplit: 0 });
  await step('编译着色器…', 94);
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older drivers: compile lazily */ }

  // Resize
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
    const pr = renderer.getPixelRatio();
    lake.userData.resize(w * pr, h * pr);
  });

  // Shadow frustum follows what the camera is looking at.
  const focus = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  function updateShadow() {
    const dist = camera.position.distanceTo(controls.target);
    const R = THREE.MathUtils.clamp(dist * 0.85, 160, 1500);
    camera.getWorldDirection(fwd);
    focus.copy(camera.position).addScaledVector(fwd, Math.min(dist, R * 0.9));
    focus.y = Math.max(0, terrainHeight(focus.x, focus.z));
    const sc = sun.shadow.camera;
    if (sc.right !== R) {
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
      sc.near = 1; sc.far = 9000;
      sc.updateProjectionMatrix();
    }
    sun.position.copy(focus).addScaledVector(TOD.lightDir, 4000);
    sun.target.position.copy(focus);
    sun.target.updateMatrixWorld();
  }

  const rayColor = new THREE.Color();
  const todExtra = { rayColor, leak: 0, rays: 0, exp: 1, bloom: 1, sunVisible: 1 };

  let last = performance.now();
  let time = 0;
  let fpsAcc = 0, fpsN = 0, fps = 60;
  const capture = params.has('capture');
  let captureFrames = 0;
  function tick(now) {
    if (capture && captureFrames >= 2) return; // headless capture: render a couple of frames, then idle
    captureFrames++;
    const dt = capture ? 1 / 30 : Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    U.uTime.value = time;

    if (hourTween) {
      hourTween.t += dt;
      const k = Math.min(1, hourTween.t / hourTween.dur);
      const e = k * k * (3 - 2 * k);
      state.hour = (((hourTween.from + (hourTween.to - hourTween.from) * e) % 24) + 24) % 24;
      if (k >= 1) hourTween = null;
    } else if (state.flow) {
      state.hour = (state.hour + dt * state.speed) % 24;
    }
    state.splitAmt += ((state.split ? 1 : 0) - state.splitAmt) * Math.min(1, dt * 0.25);

    const p = applyTimeOfDay(state.hour, { sunLight: sun, hemiLight: hemi, comet: state.comet, cometSplit: state.splitAmt });
    if (!state.festival) U.uLanterns.value = 0;

    if (state.tour && !director.tour) director.startTour();
    director.update(dt);
    controls.enabled = !director.flight;
    controls.update();
    // keep the camera above ground
    const gy = Math.max(terrainHeight(camera.position.x, camera.position.z), 0) + 1.6;
    if (camera.position.y < gy) camera.position.y = gy;

    updateShadow();
    if ((frameNo++ & 1) === 0 || capture) renderer.shadowMap.needsUpdate = true;
    clouds.update(dt);
    birds.update(time);
    motes.update(camera, renderer.getPixelRatio());

    rayColor.copy(p.fogSun).lerp(p.sun, 0.4);
    todExtra.leak = U.uDusk.value * 0.35;
    todExtra.rays = TOD.rays;
    todExtra.exp = TOD.exp;
    todExtra.bloom = TOD.bloom;
    todExtra.sunVisible = TOD.sunVisible;
    post.update(time, U.uSunDir.value, todExtra);
    post.composer.render(dt);

    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    ui.update(fps);
    requestAnimationFrame(tick);
  }

  await step('完成', 100);
  const loaderEl = document.getElementById('loader');
  loaderEl.classList.add('done');
  if (capture) loaderEl.style.display = 'none';
  if (params.get('ui') !== '0') ui.show();
  if (director.onShot) director.onShot(director.current);
  requestAnimationFrame((t) => { last = t; tick(t); });

  // Small automation hook (used for screenshots / embedding).
  window.__itomori = {
    state, director, renderer, scene, camera, controls, U,
    setHour: (h) => { hourTween = null; state.hour = h; },
    shot: (i) => director.go(i, 0),
    renderFrames: (n = 1) => { captureFrames = 0; const keep = capture; for (let i = 0; i < n; i++) { captureFrames = 0; tick(performance.now()); } return keep; },
    stats: { houses: layout.houses.length, paddies: layout.paddies.length, structures: structures.stats, vegetation: veg.stats, grass: grass.count },
    ready: true,
  };
  if (state.debug) console.log('Itomori stats', window.__itomori.stats, renderer.info);
}

main().catch((err) => {
  console.error(err);
  loaderMsg.textContent = '加载失败：' + (err && err.message ? err.message : err);
});
