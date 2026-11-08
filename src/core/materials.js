// Shared uniforms + shader patches that give every surface the same
// "Shinkai" treatment: soft two-tone toon light, cool blue shadows,
// back-lit rims and a sun-tinted, height-based aerial perspective.

import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, // direction towards the sun
  uLightDir: { value: new THREE.Vector3(0, 1, 0) }, // direction towards the key light (sun or moon)
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uLightColor: { value: new THREE.Color(1, 1, 1) },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogColor: { value: new THREE.Color(0.6, 0.75, 0.9) },
  uFogSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogDensity: { value: 1 / 3000 },
  uFogFalloff: { value: 1 / 350 },
  uFogBase: { value: 1 / 70000 },
  uNight: { value: 0 },
  uDusk: { value: 0 },
  uRimColor: { value: new THREE.Color(1, 0.9, 0.7) },
  uSkyTop: { value: new THREE.Color() },
  uSkyMid: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() },
  uCloudShade: { value: new THREE.Color() },
  uCloudRim: { value: new THREE.Color() },
  uWaterDeep: { value: new THREE.Color() },
  uWaterShallow: { value: new THREE.Color() },
  uAmbient: { value: new THREE.Color() },
  uComet: { value: 1 },
  uCometSplit: { value: 0 },
  uCometHead: { value: new THREE.Vector3(0, 0.5, 1).normalize() },
  uCometTail: { value: new THREE.Vector3(1, 0, 0) },
  uStars: { value: 0 },
  uCirrus: { value: 0.6 },
  uWind: { value: 1 },
  uLanterns: { value: 0 },
  uInhabited: { value: 1 },
  uCloudShadow: { value: 0.5 },
};

// ---------------------------------------------------------------------------
// GLSL snippets shared between built-in (patched) and custom shader materials.

export const GLSL_COMMON = /* glsl */ `
float sHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash12(i), sHash12(i + vec2(1.0, 0.0)), u.x),
             mix(sHash12(i + vec2(0.0, 1.0)), sHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * sNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
`;

export const GLSL_FOG_PARS = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uSunDir;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
vec3 shinkaiFog(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  vec3 v = d / max(dist, 1e-3);
  float b = uFogFalloff;
  float h0 = max(cameraPosition.y, 0.0);
  float dy = d.y;
  float e0 = exp(-b * h0);
  float avg = abs(dy) < 0.5 ? e0 : (e0 - exp(-b * (h0 + dy))) / (b * dy);
  float optical = dist * (uFogDensity * max(avg, 0.0) + uFogBase);
  float f = 1.0 - exp(-optical);
  float s = max(dot(v, uSunDir), 0.0);
  vec3 fc = mix(uFogColor, uFogSunColor, pow(s, 3.0) * 0.8);
  return mix(col, fc, f);
}
`;

// Override three's fog chunks once, globally. Every material that has
// fog enabled (and is patched by stylize()) gets the aerial perspective.
let chunksPatched = false;
export function patchFogChunks() {
  if (chunksPatched) return;
  chunksPatched = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldPos;
  ${GLSL_FOG_PARS}
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = shinkaiFog(gl_FragColor.rgb, vFogWorldPos);
#endif`;
}

// Two-tone ramp: a soft but clearly readable terminator, like painted light.
let toonRamp = null;
export function getToonRamp() {
  if (toonRamp) return toonRamp;
  const n = 256;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = i / (n - 1);
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const v = 0.86 * sm(0.44, 0.55, c) + 0.14 * sm(0.55, 0.95, c);
    data[i] = Math.round(v * 255);
  }
  toonRamp = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  toonRamp.minFilter = THREE.LinearFilter;
  toonRamp.magFilter = THREE.LinearFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/**
 * Patches a built-in material so it shares the scene uniforms and gets the
 * stylised extras. `opts.key` must be unique per distinct shader variant.
 *
 * opts: { key, wind, rim, basic, uniforms, vertexPars, vertexMain, fragPars, fragColor, fragOutput }
 * (`basic: true` for materials without normals, e.g. lines and MeshBasicMaterial.)
 */
export function stylize(material, opts = {}) {
  const key = opts.key || 'default';
  material.onBeforeCompile = (shader) => {
    for (const k in U) shader.uniforms[k] = U[k];
    if (opts.uniforms) Object.assign(shader.uniforms, opts.uniforms);

    const defines = [];
    if (opts.wind) defines.push(`#define STYLE_WIND ${opts.wind.toFixed(3)}`);
    if (opts.rim) defines.push(`#define STYLE_RIM ${opts.rim.toFixed(3)}`);

    let vs = shader.vertexShader;
    vs = vs.replace(
      '#include <common>',
      `#include <common>
${defines.join('\n')}
uniform float uTime;
uniform float uWind;
varying vec3 vSWPos;
varying vec3 vSWNor;
${opts.vertexPars || ''}`
    );
    if (opts.trunk) {
      vs = vs.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
  // non-grey vertex colours (bark) keep their own colour
  if (abs(color.r - color.b) > 0.04) vColor.xyz = color.xyz;
#endif`
      );
    }
    vs = vs.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef STYLE_WIND
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = vec3(0.0);
  #endif
  float swayT = uTime * 1.25 + ip.x * 0.043 + ip.z * 0.061;
  float sway = (sin(swayT) * 0.6 + sin(swayT * 2.3 + 1.7) * 0.25) * uWind;
  float hgt = max(position.y, 0.0);
  transformed.x += sway * STYLE_WIND * hgt * hgt * 0.0011;
  transformed.z += sway * STYLE_WIND * hgt * hgt * 0.0007;
#endif
${opts.vertexMain || ''}`
    );
    vs = vs.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
vSWPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
${opts.basic ? 'vSWNor = vec3(0.0, 1.0, 0.0);' : `
#ifdef USE_INSTANCING
  vSWNor = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
  vSWNor = normalize(mat3(modelMatrix) * objectNormal);
#endif`}`
    );
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace(
      '#include <common>',
      `#include <common>
${defines.join('\n')}
uniform float uTime;
uniform float uNight;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uRimColor;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyTop;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uCloudShadow;
varying vec3 vSWPos;
varying vec3 vSWNor;
${GLSL_COMMON}
float cloudShade(vec2 p) {
  vec2 q = p * 0.00085 + vec2(uTime * 0.0045, uTime * 0.0021);
  float n = sNoise(q) * 0.65 + sNoise(q * 2.3 + 7.1) * 0.35;
  return smoothstep(0.56, 0.68, n);
}
${opts.fragPars || ''}`
    );
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${opts.fragColor || ''}`);
    fs = fs.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
  // drifting shadows of the cumulus overhead
  reflectedLight.directDiffuse *= 1.0 - cloudShade(vSWPos.xz) * uCloudShadow;
#ifdef STYLE_RIM
  {
    vec3 Vw = normalize(cameraPosition - vSWPos);
    vec3 Nw = normalize(vSWNor);
    float rim = pow(1.0 - clamp(dot(Nw, Vw), 0.0, 1.0), 3.0);
    float back = pow(clamp(dot(-Vw, uLightDir), 0.0, 1.0), 1.5);
    reflectedLight.directDiffuse += uRimColor * rim * (0.15 + 1.6 * back) * diffuseColor.rgb * STYLE_RIM;
  }
#endif`
    );
    fs = fs.replace('#include <opaque_fragment>', `${opts.fragOutput || ''}\n#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => 'stylize:' + key;
  return material;
}

export function toonMaterial(params = {}, opts = {}) {
  const mat = new THREE.MeshToonMaterial({ gradientMap: getToonRamp(), ...params });
  return stylize(mat, opts);
}

export function lineMaterial(color, opts = {}) {
  const mat = new THREE.LineBasicMaterial({ color, ...opts });
  return stylize(mat, { key: 'line', basic: true });
}
