import * as THREE from 'three';
import { ZONES } from './config.js';

// Shared uniforms for every "world" material: time, wind, and zone restoration
export const FX = {
  uTime: { value: 0 },
  uZones: { value: Object.values(ZONES).map((z) => new THREE.Vector4(z.x, z.z, z.r, 0)) },
  uGlobal: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
  uWind: { value: 1 },
};

const COMMON_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  uniform vec3 uPlayer;
  attribute float aSway;
  varying vec3 vWorldPosFX;
  #ifdef FX_GROW
  uniform float uGrow;
  #endif
`;

const COMMON_FRAG = /* glsl */ `
  uniform vec4 uZones[5];
  uniform float uGlobal;
  varying vec3 vWorldPosFX;
  float fxSaturation(vec3 p) {
    float s = mix(0.5, 1.0, uGlobal);
    for (int i = 0; i < 5; i++) {
      vec4 z = uZones[i];
      float d = length(p.xz - z.xy);
      float w = 1.0 - smoothstep(z.z * 0.55, z.z, d);
      s = max(s, mix(0.5, 1.0, z.w * w));
    }
    return s;
  }
`;

/**
 * Patch a built-in material so it supports:
 *  - per-zone desaturation (faded world that regains colour)
 *  - wind sway (mode 1: grass w/ player push, mode 2: tree foliage)
 *  - grow uniform (scale geometry before instancing)
 */
export function patchWorldMaterial(mat, opts = {}) {
  const wind = opts.wind || 0;
  const grow = opts.grow || null;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FX.uTime;
    shader.uniforms.uWind = FX.uWind;
    shader.uniforms.uPlayer = FX.uPlayer;
    shader.uniforms.uZones = FX.uZones;
    shader.uniforms.uGlobal = FX.uGlobal;
    if (grow) {
      shader.uniforms.uGrow = grow;
      shader.defines = shader.defines || {};
      shader.defines.FX_GROW = 1;
    }
    shader.vertexShader = COMMON_VERT + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef FX_GROW
          transformed *= uGrow;
        #endif`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wp = modelMatrix * mvPosition;
        ${wind === 1 ? `
          vec4 basePos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float h = aSway;
          float gust = sin(uTime * 0.7 + basePos.x * 0.05) * 0.5 + 0.5;
          float w = sin(uTime * 2.2 + basePos.x * 0.35 + basePos.z * 0.27) * 0.5
                  + sin(uTime * 3.7 + basePos.z * 0.6) * 0.18;
          wp.x += (w + gust * 0.6) * 0.22 * h * h * uWind;
          wp.z += (w * 0.6) * 0.14 * h * h * uWind;
          vec2 dp = basePos.xz - uPlayer.xz;
          float dl = length(dp);
          float push = (1.0 - smoothstep(0.0, 1.5, dl)) * h;
          wp.xz += normalize(dp + 0.0001) * push * 0.55;
          wp.y -= push * 0.25;
        ` : ''}
        ${wind === 2 ? `
          float s = aSway;
          float t = uTime * 1.3 + wp.x * 0.08 + wp.z * 0.06;
          wp.x += sin(t) * 0.12 * s * uWind;
          wp.z += cos(t * 0.8) * 0.08 * s * uWind;
          wp.y += sin(t * 1.7) * 0.03 * s;
        ` : ''}
        vWorldPosFX = wp.xyz;
        mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
      `);
    shader.fragmentShader = COMMON_FRAG + shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `{
        float sat = fxSaturation(vWorldPosFX);
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 faded = vec3(lum) * vec3(1.02, 1.0, 1.04);
        gl_FragColor.rgb = mix(faded, gl_FragColor.rgb, sat);
        gl_FragColor.rgb *= mix(0.92, 1.0, sat);
      }
      #include <fog_fragment>`
    );
  };
  // ensure programs differ per configuration
  mat.customProgramCacheKey = () => `world-${wind}-${grow ? 1 : 0}`;
  return mat;
}

// geometry needs aSway when wind is used; default zero attribute helper
export function ensureSway(geo, value = 0) {
  if (!geo.attributes.aSway) {
    const a = new Float32Array(geo.attributes.position.count).fill(value);
    geo.setAttribute('aSway', new THREE.BufferAttribute(a, 1));
  }
  return geo;
}

// Merge non-indexed geometries with position/normal/color/aSway
export function mergeGeos(list) {
  let count = 0;
  const geos = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ensureSway(ng, 0);
    if (!ng.attributes.color) {
      const c = new Float32Array(ng.attributes.position.count * 3).fill(1);
      ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    count += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3), sway = new Float32Array(count);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    sway.set(g.attributes.aSway.array, o);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  out.computeBoundingSphere();
  return out;
}

// colour a geometry (with optional gradient by height & jitter)
export function paint(geo, color, opts = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const c2 = opts.top ? new THREE.Color(opts.top) : null;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const arr = new Float32Array(n * 3);
  const sw = new Float32Array(n);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    const t = (y - bb.min.y) / Math.max(0.0001, bb.max.y - bb.min.y);
    tmp.copy(c);
    if (c2) tmp.lerp(c2, t);
    if (opts.jitter) {
      const j = 1 + (Math.sin(i * 12.9898 + y * 78.233) * 43758.5453 % 1) * opts.jitter;
      tmp.multiplyScalar(j);
    }
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
    sw[i] = opts.sway !== undefined ? (opts.swayByHeight ? opts.sway * t : opts.sway) : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  return g;
}
