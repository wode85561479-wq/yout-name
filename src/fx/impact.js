// The falling fragment of comet Tiamat: a blazing head with a long fading
// trail that streaks down from the split comet towards the shrine.

import * as THREE from 'three';

const TRAIL = 140;

export function buildImpact() {
  const count = TRAIL + 1;
  const pos = new Float32Array(count * 3);
  const age = new Float32Array(count);
  for (let i = 0; i < count; i++) age[i] = i / TRAIL; // 0 = head, 1 = oldest trail point
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: 1 }, uFade: { value: 0 }, uHeat: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aAge;
      uniform float uPixel;
      varying float vAge;
      void main() {
        vAge = aAge;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(-mv.z, 1.0);
        float head = aAge < 0.001 ? 1.0 : 0.0;
        float size = mix(mix(9000.0, 900.0, sqrt(aAge)), 60000.0, head) / d;
        gl_PointSize = clamp(size, head > 0.5 ? 10.0 : 2.0, head > 0.5 ? 320.0 : 80.0) * uPixel;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      uniform float uHeat;
      varying float vAge;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        float a = smoothstep(0.5, 0.0, r);
        float core = smoothstep(0.18, 0.0, r);
        // white-blue head, cooling to pink and red along the trail
        vec3 hot = vec3(1.0, 0.97, 0.92);
        vec3 col = mix(hot, vec3(0.55, 0.8, 1.0), smoothstep(0.0, 0.15, vAge));
        col = mix(col, vec3(1.0, 0.45, 0.6), smoothstep(0.15, 0.6, vAge));
        col = mix(col, vec3(0.7, 0.25, 0.3), smoothstep(0.6, 1.0, vAge));
        float k = (1.0 - vAge) * (1.0 - vAge);
        float glow = (a * 0.8 + core * 2.5) * k * (vAge < 0.001 ? 4.0 + uHeat * 6.0 : 1.4);
        gl_FragColor = vec4(col * glow * uFade, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 5;
  points.name = 'falling-fragment';

  const O = new THREE.Vector3(), D0 = new THREE.Vector3(), D1 = new THREE.Vector3(), P = new THREE.Vector3(), D = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q = new THREE.Quaternion();
  const fwd = new THREE.Vector3(0, 0, -1);
  let dist0 = 9000, dist1 = 600;
  const history = [];
  let t = 0, dur = 9, active = false, onImpact = null;

  return {
    object: points,
    get active() { return active; },
    get progress() { return Math.min(1, t / dur); },
    /**
     * origin: the viewer; startDir: where the fragment appears in the sky;
     * to: impact point. The path sweeps across the sky in angle so it reads
     * as a streak, not as something flying straight at the camera.
     */
    start(origin, startDir, to, duration, impactCb) {
      O.copy(origin);
      D0.copy(startDir).normalize();
      D1.subVectors(to, origin);
      dist1 = D1.length();
      D1.normalize();
      dist0 = 9000;
      qa.setFromUnitVectors(fwd, D0);
      qb.setFromUnitVectors(fwd, D1);
      dur = duration; t = 0; active = true; onImpact = impactCb;
      history.length = 0;
      points.visible = true;
      mat.uniforms.uFade.value = 1;
    },
    stop() { active = false; points.visible = false; },
    update(dt, pixelRatio) {
      if (!active) return;
      mat.uniforms.uPixel.value = pixelRatio;
      t += dt;
      const k = Math.min(1, t / dur);
      const a = Math.pow(k, 1.5); // accelerating sweep
      q.slerpQuaternions(qa, qb, a);
      D.copy(fwd).applyQuaternion(q);
      D.y += Math.sin(Math.PI * a) * 0.12; // bulge upwards across the sky
      D.normalize();
      // close in early so the fragment stays in front of the ridges as it dives
      const d = dist1 + (dist0 - dist1) * Math.pow(1 - k, 3);
      P.copy(O).addScaledVector(D, d);
      history.unshift(P.clone());
      if (history.length > TRAIL + 1) history.length = TRAIL + 1;
      const arr = geo.attributes.position.array;
      for (let i = 0; i <= TRAIL; i++) {
        const h = history[Math.min(i, history.length - 1)];
        arr[i * 3] = h.x; arr[i * 3 + 1] = h.y; arr[i * 3 + 2] = h.z;
      }
      geo.attributes.position.needsUpdate = true;
      mat.uniforms.uHeat.value = k;
      if (k >= 1) {
        active = false;
        points.visible = false;
        if (onImpact) onImpact();
      }
    },
  };
}
