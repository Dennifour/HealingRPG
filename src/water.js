import * as THREE from 'three';
import { WORLD, PLATEAU, POND } from './config.js';

const waterVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const waterFrag = /* glsl */ `
  uniform sampler2D uDepth; uniform float uSize; uniform float uTime;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uTop; uniform vec3 uHorizon;
  uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uNight;
  varying vec3 vWorld;

  float waveH(vec2 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec2(0.9, 0.4)) * 0.35 + t * 1.1) * 0.5;
    h += sin(dot(p, vec2(-0.5, 0.8)) * 0.52 + t * 1.4) * 0.35;
    h += sin(dot(p, vec2(0.2, -1.0)) * 1.1 + t * 2.0) * 0.18;
    h += sin(dot(p, vec2(-0.8, -0.3)) * 1.9 + t * 2.6) * 0.1;
    h += sin(dot(p, vec2(0.6, 0.7)) * 3.3 + t * 3.4) * 0.05;
    return h;
  }
  void main() {
    vec2 uv = (vWorld.xz + uSize * 0.5) / uSize;
    float depth = 10.0;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r * 12.0 - 2.0;
    if (depth < -0.05) discard;

    vec2 p = vWorld.xz;
    float e = 0.15;
    float t = uTime;
    float hx = waveH(p + vec2(e, 0.0), t) - waveH(p - vec2(e, 0.0), t);
    float hz = waveH(p + vec2(0.0, e), t) - waveH(p - vec2(0.0, e), t);
    vec3 n = normalize(vec3(-hx * 0.9, 2.0 * e * 6.0, -hz * 0.9));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float dist = length(cameraPosition - vWorld);
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    vec3 r = reflect(-viewDir, n);
    vec3 skyCol = mix(uHorizon, uTop, pow(clamp(r.y, 0.0, 1.0), 0.5));

    vec3 shallow = vec3(0.36, 0.82, 0.80);
    vec3 deep = vec3(0.07, 0.34, 0.52);
    float dl = smoothstep(0.0, 6.0, depth);
    vec3 waterCol = mix(shallow, deep, dl);
    float lightLvl = mix(1.0, 0.28, uNight);
    waterCol *= lightLvl * (0.6 + 0.4 * max(uSunDir.y, 0.0) + 0.25);

    vec3 col = mix(waterCol, skyCol, fres * 0.75);
    float spec = pow(max(dot(r, uSunDir), 0.0), 220.0);
    col += uSunColor * spec * 2.5 * (1.0 - uNight);
    vec3 md = -uSunDir;
    col += vec3(0.7, 0.8, 1.0) * pow(max(dot(r, md), 0.0), 300.0) * 1.2 * uNight;

    // sparkles
    float sp = pow(max(dot(r, uSunDir), 0.0), 30.0) * step(0.985, fract(sin(dot(floor(p * 3.0), vec2(12.9898, 78.233)) + floor(t * 4.0)) * 43758.5453));
    col += uSunColor * sp * 0.8 * (1.0 - uNight);

    // shore foam
    float foamBand = smoothstep(0.7, 0.0, depth);
    float foamLines = 0.5 + 0.5 * sin(depth * 14.0 - t * 2.2 + waveH(p * 0.7, t) * 2.0);
    float foam = foamBand * smoothstep(0.55, 0.95, foamLines) + smoothstep(0.12, 0.0, depth) * 0.8;
    col = mix(col, vec3(0.95, 0.98, 1.0) * lightLvl, clamp(foam, 0.0, 1.0) * 0.75);

    float alpha = mix(0.45, 0.92, smoothstep(0.0, 2.8, depth));
    alpha = max(alpha, fres * 0.9);
    alpha = max(alpha, foam * 0.8);

    float fogF = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fogF);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Water {
  constructor(scene, terrain, sky) {
    this.sky = sky;
    this.uniforms = {
      uDepth: { value: terrain.buildDepthTexture() },
      uSize: { value: WORLD.size },
      uTime: { value: 0 },
      uSunDir: sky.uniforms.uSunDir,
      uSunColor: sky.uniforms.uSunColor,
      uTop: sky.uniforms.uTop,
      uHorizon: sky.uniforms.uHorizon,
      uNight: sky.uniforms.uNight,
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 60 },
      uFogFar: { value: 420 },
    };
    const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: waterVert, fragmentShader: waterFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WORLD.water;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    this.waterfall = this.buildWaterfall(terrain);
    scene.add(this.waterfall);
  }

  buildWaterfall(terrain) {
    const dir = new THREE.Vector2(POND.x - PLATEAU.x, POND.z - PLATEAU.z).normalize();
    const side = new THREE.Vector2(-dir.y, dir.x);
    const steps = 40, width = 5.5;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = 36 + t * 30;
      const cx = PLATEAU.x + dir.x * r, cz = PLATEAU.z + dir.y * r;
      const w = width * (1 + t * 0.4);
      for (let s = 0; s <= 1; s++) {
        const o = (s - 0.5) * w;
        const x = cx + side.x * o, z = cz + side.y * o;
        const y = Math.max(terrain.heightAt(x, z), terrain.heightAt(cx, cz)) + 0.35;
        pos.push(x, Math.max(y, 0.05), z);
        uv.push(s, t * 6);
      }
      if (i < steps) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.fallUniforms = { uTime: { value: 0 }, uNight: this.sky.uniforms.uNight };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.fallUniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uNight; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 8.0, vUv.y * 3.0 - uTime * 2.6);
          float s = n(p) * 0.6 + n(p * 2.3) * 0.4;
          float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          vec3 c = mix(vec3(0.55, 0.82, 0.95), vec3(1.0), smoothstep(0.45, 0.8, s));
          c *= mix(1.0, 0.35, uNight);
          gl_FragColor = vec4(c, (0.55 + 0.4 * s) * edge);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3;
    return m;
  }

  update(elapsed, scene) {
    this.uniforms.uTime.value = elapsed;
    this.fallUniforms.uTime.value = elapsed;
    this.uniforms.uFogColor.value.copy(scene.fog.color);
    this.uniforms.uFogNear.value = scene.fog.near;
    this.uniforms.uFogFar.value = scene.fog.far;
  }
}
