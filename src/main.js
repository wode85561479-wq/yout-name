// 糸守町 · Itomori — entry point.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { patchFogChunks, U } from './core/materials.js';
import { applyTimeOfDay, TOD, COMET_HEAD, COMET_TAIL } from './core/timeofday.js';
import { makeShots, Director } from './core/shots.js';
import { buildLayout } from './world/layout.js';
import { buildTerrain } from './world/terrain.js';
import { buildLake, buildMoat } from './world/water.js';
import { buildStructures } from './world/buildings.js';
import { buildVegetation } from './world/vegetation.js';
import { buildGrass, GRASS_LAYER } from './world/grass.js';
import { terrainHeight, shoreDistance } from './world/heightfield.js';
import { createWalk } from './core/walk.js';
import { buildSky } from './sky/sky.js';
import { buildClouds } from './sky/clouds.js';
import { buildPost } from './fx/post.js';
import { buildMotes, buildBirds } from './fx/life.js';
import { buildUI } from './ui/ui.js';
import { ERA, CRATER2 } from './core/era.js';
import { buildImpact } from './fx/impact.js';
import { createAmbience } from './fx/audio.js';

const params = new URLSearchParams(location.search);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 600;
// Weak, integrated or software GPUs start on the light preset; the panel can switch.
function detectQuality() {
  if (isMobile) return 'low';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    if (/swiftshader|llvmpipe|software|mali|adreno|powervr|intel(?!.*arc)/i.test(name)) return 'low';
  } catch (e) { /* fall through */ }
  return 'high';
}
let quality = params.get('q') || (location.hash === '#low' ? 'low' : detectQuality());

const state = {
  hour: params.has('t') ? parseFloat(params.get('t')) : 17.0,
  flow: params.get('flow') === '1',
  speed: 0.06, // in-game hours per second
  comet: params.has('comet') ? params.get('comet') !== '0' : !ERA.after,
  split: params.get('split') === '1',
  splitAmt: params.get('split') === '1' ? 1 : 0,
  festival: params.has('festival') ? params.get('festival') !== '0' : !ERA.after,
  after: ERA.after,
  sound: false,
  lowq: false,
  walk: false,
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
  const prFor = (q) => Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : 1.6);
  renderer.setPixelRatio(prFor(quality));
  state.lowq = quality === 'low';
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

  camera.layers.enable(GRASS_LAYER);

  // Everything that depends on the era (before / after the impact) lives in
  // one group so it can be torn down and rebuilt in place.
  async function buildWorld() {
    const group = new THREE.Group();
    group.name = 'world';
    await step(ERA.after ? '八年后 · 2021 · 规划废墟…' : '规划町并 · 道路与田地…', 8);
    const layout = buildLayout({ groundRes: quality === 'low' ? 2048 : 4096 });
    await step(ERA.after ? '第二个火口…' : '隆起群山 · 陨石湖…', 28);
    const terrain = buildTerrain(layout, renderer, quality);
    group.add(terrain.group);
    await step('糸守湖 · 湖面…', 42);
    const lake = buildLake(renderer, quality);
    group.add(lake);
    group.add(buildMoat());
    await step(ERA.after ? '残存的房屋…' : '建造房屋 · 神社 · 高中…', 52);
    const structures = buildStructures(layout);
    group.add(structures.group);
    await step('种植杉林…', 66);
    const veg = buildVegetation(layout, quality, renderer);
    group.add(veg.group);
    const grass = buildGrass(layout, quality);
    group.add(grass.group);
    // keep the dense grass out of the lake reflection pass
    lake.getReflectionCamera(camera).layers.disable(GRASS_LAYER);
    U.uInhabited.value = ERA.after ? 0 : 1;
    return {
      group, lake, terrain,
      stats: { houses: layout.houses.length, paddies: layout.paddies.length, structures: structures.stats, vegetation: veg.stats, grass: grass.count },
    };
  }

  function disposeWorld(w) {
    scene.remove(w.group);
    const mats = new Set();
    w.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      if (o.isInstancedMesh) o.dispose();
    });
    mats.forEach((m) => m.dispose());
    w.terrain.textures.ground.dispose();
    w.terrain.textures.mask.dispose();
    w.lake.getRenderTarget().dispose();
  }

  let world = await buildWorld();
  scene.add(world.group);

  await step('天空与积云…', 80);
  scene.add(buildSky());
  const clouds = buildClouds(quality);
  scene.add(clouds.group);
  const motes = buildMotes(quality === 'low' ? 400 : 900);
  scene.add(motes.object);
  const birds = buildBirds();
  scene.add(birds.object);
  const impact = buildImpact();
  scene.add(impact.object);
  const ambience = createAmbience();
  let audioClock = 0;

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
  let shots = makeShots();
  const director = new Director(camera, controls, shots);
  const stopAuto = () => {
    if (director.busy) {
      director.cancel();
      state.tour = false;
      ui.refresh();
    }
  };
  canvas.addEventListener('pointerdown', stopAuto);
  const walk = createWalk(camera, canvas, { groundAt: terrainHeight, isWater: (x, z) => shoreDistance(x, z) < 2 });
  canvas.addEventListener('wheel', stopAuto, { passive: true });

  await step('后期 · 光晕与色彩…', 88);
  let post = buildPost(renderer, scene, camera, quality);
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
    async setEra(after, opts = {}) {
      if (rebuilding || after === ERA.after) return;
      rebuilding = true;
      const keep = director.current ? director.current.id : 'hero';
      const loaderEl = document.getElementById('loader');
      if (!opts.silent) {
        loaderEl.classList.remove('done');
        await new Promise((r) => setTimeout(r, 700));
      }
      ERA.after = after;
      state.after = after;
      state.comet = !after;
      state.festival = !after;
      state.split = false;
      state.splitAmt = 0;
      director.cancel();
      state.tour = false;
      disposeWorld(world);
      world = await buildWorld();
      scene.add(world.group);
      shots = makeShots();
      director.shots = shots;
      ui.setShots(shots);
      director.go(shots.find((s) => s.id === keep) ? keep : 'hero', 0);
      controls.update();
      await step('编译着色器…', 94);
      try { await renderer.compileAsync(scene, camera); } catch (e) { /* compile lazily */ }
      await step('完成', 100);
      renderer.shadowMap.needsUpdate = true;
      if (!opts.silent) loaderEl.classList.add('done');
      try {
        if (after) location.hash = 'after';
        else history.replaceState(null, '', location.pathname + location.search);
      } catch (e) { /* sandboxed frames may refuse history edits */ }
      if (window.__itomori) window.__itomori.stats = world.stats;
      ui.refresh();
      if (director.onShot && !opts.silent) director.onShot(director.current);
      rebuilding = false;
      perf.warm = 4;
    },

    setWalk(on) {
      if (on === walk.active) return;
      state.walk = on;
      if (on) {
        director.cancel();
        state.tour = false;
        walk.enable();
        ui.caption('漫步模式', 'WASD / 方向键移动 · 拖动环顾 · Shift 快走');
      } else {
        controls.target.copy(walk.lookTarget());
        walk.disable();
        controls.update();
      }
      ui.refresh();
    },

    setSound(on) {
      if (on) ambience.enable().catch(() => {});
      else ambience.disable();
    },

    // Switch between the full and the light preset without reloading.
    async setQuality(q) {
      if (rebuilding || q === quality) return;
      rebuilding = true;
      const loaderEl = document.getElementById('loader');
      loaderEl.classList.remove('done');
      await new Promise((r) => setTimeout(r, 700));
      quality = q;
      state.lowq = q === 'low';
      const keepPos = camera.position.clone(), keepTarget = controls.target.clone();
      disposeWorld(world);
      world = await buildWorld();
      scene.add(world.group);
      for (const pass of post.composer.passes) if (pass.dispose) pass.dispose();
      post.composer.dispose();
      basePR = prFor(q);
      perf.scale = 1;
      renderer.setPixelRatio(basePR);
      post = buildPost(renderer, scene, camera, q);
      post.setSize(window.innerWidth, window.innerHeight);
      const sm = q === 'low' ? 2048 : 4096;
      sun.shadow.mapSize.set(sm, sm);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      camera.position.copy(keepPos);
      controls.target.copy(keepTarget);
      controls.update();
      await step('编译着色器…', 94);
      try { await renderer.compileAsync(scene, camera); } catch (e) { /* compile lazily */ }
      await step('完成', 100);
      renderer.shadowMap.needsUpdate = true;
      loaderEl.classList.add('done');
      if (window.__itomori) window.__itomori.stats = world.stats;
      ui.refresh();
      rebuilding = false;
      perf.warm = 4;
    },

    // The climax: from the school, watch the fragment fall on the shrine.
    async startImpact() {
      if (ERA.after || rebuilding || inSequence) return;
      inSequence = true;
      hooks.setWalk(false);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      director.cancel();
      Object.assign(state, { tour: false, flow: false, comet: true, split: true, festival: true });
      hooks.setHour(20.3, true);
      director.go('hero', 3.5);
      ui.refresh();
      await wait(5200);
      await new Promise((resolve) => startFall(resolve));
      const flash = document.getElementById('flash');
      flash.classList.add('on');
      await wait(900);
      await hooks.setEra(true, { silent: true });
      hooks.setHour(15.6, false);
      director.go('hero', 0);
      controls.update();
      await wait(600);
      flash.classList.remove('on');
      ui.caption('八年后', '2021 · 糸守町跡');
      inSequence = false;
    },
  };
  let inSequence = false;
  // start where the split fragment sits in the sky, end on the shrine grounds
  // while the fragment falls the camera stays put and pans after it
  let fallCam = null;
  function startFall(onDone) {
    fallCam = { t0: controls.target.clone(), t1: new THREE.Vector3(CRATER2.x, 30, CRATER2.z), look: new THREE.Vector3(), base: camera.position.clone() };
    const H = COMET_HEAD.clone(), T = COMET_TAIL.clone();
    const B = new THREE.Vector3().crossVectors(H, T).normalize();
    const dir = H.clone().addScaledVector(T, -0.065).addScaledVector(B, -0.03).normalize();
    const to = new THREE.Vector3(CRATER2.x, 4, CRATER2.z);
    impact.start(camera.position.clone(), dir, to, 9.5, () => {
      controls.target.copy(fallCam.look);
      camera.position.copy(fallCam.base);
      fallCam = null;
      onDone();
    });
  }
  let rebuilding = false;
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
    world.lake.userData.resize(w * pr, h * pr);
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

  // Dynamic resolution: drop the pixel ratio on slow GPUs, raise it back when there is headroom.
  let basePR = renderer.getPixelRatio();
  const perf = { scale: 1, acc: 0, n: 0, good: 0, warm: 4 };
  function applyScale() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = basePR * perf.scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    post.composer.setPixelRatio(pr);
    post.setSize(w, h);
    world.lake.userData.resize(w * pr, h * pr);
  }
  function adapt(realDt) {
    if (capture || params.has('fixedres')) return;
    if (rebuilding || perf.warm > 0) { perf.warm = Math.max(0, perf.warm - realDt); perf.acc = perf.n = 0; return; }
    perf.acc += realDt; perf.n++;
    if (perf.acc < 2) return;
    const f = perf.n / perf.acc;
    perf.acc = perf.n = 0;
    if (f < 30 && perf.scale > 0.5) { perf.scale = Math.max(0.5, perf.scale - 0.15); perf.good = 0; applyScale(); perf.warm = 1; }
    else if (f > 57 && perf.scale < 1) { if (++perf.good >= 2) { perf.scale = Math.min(1, perf.scale + 0.1); perf.good = 0; applyScale(); perf.warm = 1; } }
    else perf.good = 0;
  }

  function tick(now) {
    if (capture && captureFrames >= 2) return; // headless capture: render a couple of frames, then idle
    captureFrames++;
    const realDt = Math.max(0, (now - last) / 1000);
    const dt = capture ? 1 / 30 : Math.min(0.1, realDt);
    last = now;
    adapt(realDt);
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
    if (walk.active && director.flight) hooks.setWalk(false); // a preset shot ends the stroll
    controls.enabled = !director.flight && !fallCam && !walk.active;
    if (walk.active) walk.update(dt);
    else if (fallCam) {
      const k = impact.progress;
      const e = THREE.MathUtils.smoothstep(k, 0.3, 0.97);
      fallCam.look.lerpVectors(fallCam.t0, fallCam.t1, e);
      const shake = THREE.MathUtils.smoothstep(k, 0.82, 1.0) * 1.6;
      camera.position.copy(fallCam.base).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
      camera.lookAt(fallCam.look);
    } else controls.update();
    // keep the camera above ground
    const gy = Math.max(terrainHeight(camera.position.x, camera.position.z), 0) + 1.6;
    if (camera.position.y < gy) camera.position.y = gy;

    updateShadow();
    if ((frameNo++ & 1) === 0 || capture) renderer.shadowMap.needsUpdate = true;
    clouds.update(dt);
    impact.update(dt, renderer.getPixelRatio());
    audioClock += dt;
    if (audioClock > 0.25) { audioClock = 0; ambience.update(state.hour, ERA.after); }
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
    ui.update(fps, perf.scale);
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
    stats: world.stats,
    setEra: (after) => hooks.setEra(after),
    startImpact: () => hooks.startImpact(),
    previewFall: (k) => { startFall(() => {}); const n = Math.floor((9.5 * k) / (1 / 30)); for (let i = 0; i < n; i++) impact.update(1 / 30, renderer.getPixelRatio()); },
    ready: true,
  };
  if (state.debug) console.log('Itomori stats', window.__itomori.stats, renderer.info);
}

main().catch((err) => {
  console.error(err);
  loaderMsg.textContent = '加载失败：' + (err && err.message ? err.message : err);
});
