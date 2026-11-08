// Material for everything that lights up after dusk: windows (glass by day),
// paper festival lanterns, street lamps and the glowing vending machine.
//
// aKind: 0 house window · 1 festival lantern · 2 lamp head · 3 vending machine
//        4 school / office window · 5 shoji (paper) window

import * as THREE from 'three';
import { U, GLSL_FOG_PARS } from '../core/materials.js';

const vertexShader = /* glsl */ `
attribute vec3 aEmit;
attribute float aRand;
attribute float aKind;
varying vec3 vColor;
varying vec3 vEmit;
varying float vRand;
varying float vKind;
varying vec3 vN;
varying vec3 vW;
void main() {
  vColor = color;
  vEmit = aEmit;
  vRand = aRand;
  vKind = aKind;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uLanterns;
uniform float uInhabited;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyTop;
${GLSL_FOG_PARS}
varying vec3 vColor;
varying vec3 vEmit;
varying float vRand;
varying float vKind;
varying vec3 vN;
varying vec3 vW;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(uLightDir);
  float ndl = dot(N, L);
  float ramp = smoothstep(-0.12, 0.12, ndl);
  vec3 diffuse = vColor * (uAmbient + uLightColor * ramp);

  float kind = floor(vKind + 0.5);
  vec3 col = diffuse;
  if (kind == 0.0 || kind == 4.0) {
    // glass: reflect the sky, glint in the sun
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.4, 0.0, 1.0));
    sky = mix(sky, uAmbient * 0.6, smoothstep(0.02, -0.2, R.y));
    float fres = 0.25 + 0.75 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
    col = mix(vColor * uAmbient * 1.4, sky, fres * 0.85);
    col += uLightColor * pow(max(dot(R, L), 0.0), 120.0) * 6.0;
  }

  float on = 0.0;
  if (kind == 0.0) on = step(vRand, 0.68);
  else if (kind == 4.0) on = step(vRand, 0.12);
  else if (kind == 5.0) on = step(vRand, 0.8);
  else if (kind == 1.0) on = uLanterns;
  else on = 1.0;
  if (kind != 1.0) on *= uInhabited;
  float flick = 1.0;
  if (kind == 1.0) flick = 0.88 + 0.12 * sin(uTime * 7.0 + vRand * 60.0) * sin(uTime * 3.1 + vRand * 17.0);
  // windows come on gradually through the evening
  float lightsOn = smoothstep(vRand * 0.5, vRand * 0.5 + 0.35, uNight);
  vec3 emit = vEmit * on * flick * (kind == 1.0 ? max(uNight, 0.35) : lightsOn);
  if (kind == 1.0) col = mix(col, vColor * uAmbient, 0.0);
  col = col * (1.0 - min(length(emit), 1.0) * 0.7) + emit;

  col = shinkaiFog(col, vW);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function glowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader,
    fragmentShader,
    vertexColors: true,
  });
}
