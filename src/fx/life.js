// Ambient life: glittering dust motes that drift through sunbeams (fireflies
// after dark) and flocks of birds wheeling over the lake.

import * as THREE from 'three';
import { U, GLSL_FOG_PARS } from '../core/materials.js';
import { mulberry32 } from '../core/noise.js';

export function buildMotes(count = 900) {
  const rand = mulberry32(5);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 2;
    pos[i * 3 + 1] = rand();
    pos[i * 3 + 2] = (rand() - 0.5) * 2;
    seed[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uCenter: { value: new THREE.Vector3() }, uRadius: { value: 70 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform vec3 uCenter;
      uniform float uRadius;
      uniform float uTime;
      uniform float uPixel;
      uniform float uNight;
      varying float vSeed;
      varying float vFade;
      varying float vSun;
      uniform vec3 uSunDir;
      void main() {
        vSeed = aSeed;
        vec3 p = position;
        float t = uTime * (0.02 + aSeed * 0.03);
        vec3 drift = vec3(sin(t * 6.0 + aSeed * 40.0), sin(t * 4.0 + aSeed * 13.0) * 0.5, cos(t * 5.0 + aSeed * 27.0)) * 0.08;
        vec3 local = fract((p + drift + vec3(t * 0.3, 0.0, t * 0.12)) * 0.5 + 0.5) * 2.0 - 1.0;
        vec3 wp = uCenter + vec3(local.x * uRadius, (local.y * 0.5 + 0.5) * mix(28.0, 7.0, uNight) - 3.0, local.z * uRadius);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        vFade = smoothstep(uRadius, uRadius * 0.4, length(local.xz) * uRadius) * smoothstep(0.5, 4.0, d);
        vSun = pow(max(dot(normalize(wp - cameraPosition), uSunDir), 0.0), 6.0);
        gl_PointSize = clamp((mix(1.2, 2.2, aSeed) * uPixel * 50.0) / d, 1.0, 6.0 * uPixel);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNight;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying float vSeed;
      varying float vFade;
      varying float vSun;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        a *= a;
        // daytime: pale golden motes; night: green-gold fireflies blinking
        float blink = smoothstep(0.55, 1.0, sin(uTime * (1.2 + vSeed * 2.0) + vSeed * 50.0));
        vec3 day = uSunColor * (0.05 + 2.2 * vSun) * (0.4 + 0.6 * vSeed);
        vec3 night = vec3(1.2, 1.9, 0.55) * 2.6 * blink * step(0.55, vSeed);
        vec3 col = mix(day, night, uNight);
        gl_FragColor = vec4(col * a * vFade, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'motes';
  return {
    object: points,
    update(camera, pixelRatio) {
      mat.uniforms.uCenter.value.copy(camera.position);
      mat.uniforms.uPixel.value = pixelRatio;
    },
  };
}

export function buildBirds() {
  // one bird: body + two wings, flapping in the vertex shader
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    // left wing
    0, 0, 0.35, -1.0, 0, -0.1, 0, 0, -0.35,
    // right wing
    0, 0, -0.35, 1.0, 0, -0.1, 0, 0, 0.35,
    // body
    0, 0, 0.6, 0.08, -0.03, -0.5, -0.08, -0.03, -0.5,
  ]);
  const wing = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setAttribute('aWing', new THREE.BufferAttribute(wing, 1));
  g.computeVertexNormals();

  const flocks = [
    { c: new THREE.Vector3(80, 120, 40), r: 260, n: 11, speed: 0.06 },
    { c: new THREE.Vector3(-260, 160, 200), r: 180, n: 7, speed: -0.08 },
    { c: new THREE.Vector3(900, 90, -60), r: 220, n: 9, speed: 0.05 },
  ];
  const total = flocks.reduce((a, f) => a + f.n, 0);
  const rand = mulberry32(17);
  const offs = [];
  for (const f of flocks) for (let i = 0; i < f.n; i++) offs.push({ f, a: rand() * 0.25, dy: (rand() - 0.5) * 14, dr: (rand() - 0.5) * 30, ph: rand() * 6.28, s: 0.9 + rand() * 0.5 });

  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      attribute float aWing;
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vW;
      void main() {
        vec3 p = position;
        float flap = sin(uTime * 9.0 + aPhase) ;
        p.y += aWing * flap * 0.55 * abs(p.x);
        vec4 wp = modelMatrix * instanceMatrix * vec4(p * 2.4, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      ${GLSL_FOG_PARS}
      varying vec3 vW;
      void main() {
        vec3 col = vec3(0.05, 0.06, 0.08) + uAmbient * 0.15;
        gl_FragColor = vec4(shinkaiFog(col, vW), 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
  const phases = new Float32Array(total);
  offs.forEach((o, i) => (phases[i] = o.ph));
  g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const mesh = new THREE.InstancedMesh(g, mat, total);
  mesh.frustumCulled = false;
  mesh.name = 'birds';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    object: mesh,
    update(time) {
      offs.forEach((o, i) => {
        const f = o.f;
        const ang = time * f.speed + o.a * Math.sign(f.speed) * -1;
        const r = f.r + o.dr + Math.sin(time * 0.3 + o.ph) * 12;
        p.set(f.c.x + Math.cos(ang) * r, f.c.y + o.dy + Math.sin(time * 0.5 + o.ph) * 6, f.c.z + Math.sin(ang) * r);
        const heading = ang + (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        q.setFromAxisAngle(up, -heading + Math.PI / 2);
        s.setScalar(o.s);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
