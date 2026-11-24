import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w * 0.99999;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
  uniform vec3 uSunDir; uniform vec3 uSunColor;
  uniform float uNight; uniform float uTime; uniform float uAurora;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    float a=hash(vec3(i,1.0)), b=hash(vec3(i+vec2(1,0),1.0)), c=hash(vec3(i+vec2(0,1),1.0)), d=hash(vec3(i+vec2(1,1),1.0));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, uBottom, smoothstep(0.0, -0.3, h));
    float sd = max(dot(d, uSunDir), 0.0);
    float day = 1.0 - uNight;
    col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.35) * day;
    col += uSunColor * smoothstep(0.9985, 0.9993, sd) * 4.0 * day;
    // moon
    vec3 md = normalize(-uSunDir + vec3(0.0, 0.0, 0.0));
    float mdd = max(dot(d, md), 0.0);
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9990, 0.9994, mdd) * 1.6 + pow(mdd, 40.0) * 0.12) * uNight;
    // stars
    if (uNight > 0.01 && h > -0.05) {
      vec3 p = d * 220.0;
      vec3 cell = floor(p);
      float r = hash(cell);
      vec3 f = fract(p) - 0.5;
      float star = step(0.985, r) * smoothstep(0.22, 0.0, length(f));
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 50.0);
      col += vec3(0.9, 0.93, 1.0) * star * tw * uNight * smoothstep(-0.05, 0.25, h) * 1.4;
      // milky band
      float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.5, 0.8))) * 3.0, 2.0));
      col += vec3(0.25, 0.25, 0.4) * band * n2(d.xz * 9.0 + d.y * 4.0) * 0.25 * uNight;
    }
    // aurora
    if (uAurora > 0.001 && h > 0.0) {
      float a = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float wave = sin(d.x * 6.0 + uTime * 0.25 + fi * 2.0) * 0.06 + sin(d.x * 13.0 - uTime * 0.4 + fi) * 0.025;
        float y = 0.22 + fi * 0.08 + wave;
        a += smoothstep(0.08, 0.0, abs(h - y)) * (0.6 + 0.4 * n2(vec2(d.x * 20.0 + uTime * 0.5, fi)));
      }
      vec3 ac = mix(vec3(0.2, 1.0, 0.6), vec3(0.6, 0.4, 1.0), smoothstep(0.2, 0.45, h));
      col += ac * a * 0.45 * uAurora * smoothstep(-0.2, 0.3, -d.z + 0.3);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const KEYS = [
  { t: 0.0,  top: '#0a1330', hor: '#22335c', sun: '#9fb6ff', si: 0.45, hs: '#4a5c96', hg: '#262c44', hi: 0.85, fog: '#1d2949' },
  { t: 0.2,  top: '#16224a', hor: '#3a3d6a', sun: '#9fb6ff', si: 0.4, hs: '#56629a', hg: '#2e2c40', hi: 0.8, fog: '#2c3258' },
  { t: 0.245, top: '#3c548e', hor: '#f4a37c', sun: '#ffb07a', si: 0.9, hs: '#9095c0', hg: '#5c4a40', hi: 0.6, fog: '#d2a594' },
  { t: 0.31, top: '#5d9ce2', hor: '#ffdcb6', sun: '#ffe1b8', si: 2.2, hs: '#bfd9ff', hg: '#7a6a4a', hi: 0.75, fog: '#dbe4ea' },
  { t: 0.5,  top: '#4a8de0', hor: '#cde6f8', sun: '#fff3df', si: 2.7, hs: '#c8e0ff', hg: '#8a7a5a', hi: 0.85, fog: '#d3e6f3' },
  { t: 0.69, top: '#5a8ed6', hor: '#ffe0b8', sun: '#ffdcaa', si: 2.3, hs: '#c4d6f6', hg: '#8a6f50', hi: 0.8, fog: '#e3dfd6' },
  { t: 0.765, top: '#44528f', hor: '#ff9868', sun: '#ff9858', si: 1.25, hs: '#a8a0c8', hg: '#6a4a3a', hi: 0.65, fog: '#e5a788' },
  { t: 0.82, top: '#1d2650', hor: '#6a4b7c', sun: '#8a9cff', si: 0.45, hs: '#626aa0', hg: '#302a40', hi: 0.8, fog: '#3a3a60' },
  { t: 1.0,  top: '#0a1330', hor: '#22335c', sun: '#9fb6ff', si: 0.45, hs: '#4a5c96', hg: '#262c44', hi: 0.85, fog: '#1d2949' },
].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), sun: new THREE.Color(k.sun), hs: new THREE.Color(k.hs), hg: new THREE.Color(k.hg), fog: new THREE.Color(k.fog) }));

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color('#2c4a66') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
      uNight: { value: 0 }, uTime: { value: 0 }, uAurora: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sm = renderer.userData.quality === 'low' ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(0xcfe0ee, 60, 420);

    this.clouds = this.makeClouds();
    scene.add(this.clouds);

    this.time = 0.3; // morning
    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.night = 0;
    this.aurora = 0;
    this._k = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), fog: new THREE.Color() };
  }

  makeClouds() {
    const group = new THREE.Group();
    const rnd = mulberry32(5);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x99a4b8, emissiveIntensity: 0.35, flatShading: true, fog: false, transparent: true, opacity: 0.95 });
    this.cloudMat = mat;
    const base = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 34; i++) {
      const c = new THREE.Group();
      const puffs = 4 + Math.floor(rnd() * 5);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(base, mat);
        const s = 6 + rnd() * 9;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((p - puffs / 2) * 8 + rnd() * 4, rnd() * 4, rnd() * 8 - 4);
        c.add(m);
      }
      const a = rnd() * Math.PI * 2, r = 180 + rnd() * 380;
      c.position.set(Math.cos(a) * r, 85 + rnd() * 60, Math.sin(a) * r);
      c.userData = { a, r, speed: 0.002 + rnd() * 0.003 };
      c.scale.setScalar(0.7 + rnd() * 0.8);
      group.add(c);
    }
    return group;
  }

  // dt: game seconds; dayLength: seconds per day
  update(dt, elapsed, dayLength, playerPos) {
    const night0 = this.night > 0.5;
    this.time = (this.time + (dt / dayLength) * (night0 ? 2.0 : 1.0)) % 1;
    this.applyTime(elapsed, playerPos);
    for (const c of this.clouds.children) {
      c.userData.a += c.userData.speed * dt * 0.3;
      c.position.x = Math.cos(c.userData.a) * c.userData.r;
      c.position.z = Math.sin(c.userData.a) * c.userData.r;
    }
  }

  applyTime(elapsed, playerPos) {
    const t = this.time;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = (t - a.t) / (b.t - a.t);
    const k = this._k;
    k.top.copy(a.top).lerp(b.top, f);
    k.hor.copy(a.hor).lerp(b.hor, f);
    k.sun.copy(a.sun).lerp(b.sun, f);
    k.hs.copy(a.hs).lerp(b.hs, f);
    k.hg.copy(a.hg).lerp(b.hg, f);
    k.fog.copy(a.fog).lerp(b.fog, f);
    const si = a.si + (b.si - a.si) * f;
    const hi = a.hi + (b.hi - a.hi) * f;

    const ang = (t - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang) * 0.8, Math.sin(ang), Math.cos(ang) * 0.35 + 0.35).normalize();
    const elev = this.sunDir.y;
    this.night = THREE.MathUtils.smoothstep(-elev, -0.05, 0.12);

    const u = this.uniforms;
    u.uTop.value.copy(k.top);
    u.uHorizon.value.copy(k.hor);
    u.uBottom.value.copy(k.fog).multiplyScalar(0.7);
    u.uSunDir.value.copy(this.sunDir);
    u.uSunColor.value.copy(k.sun);
    u.uNight.value = this.night;
    u.uTime.value = elapsed;
    u.uAurora.value = Math.max(this.aurora, 0);

    // light comes from sun or moon
    this.lightDir.copy(elev > -0.02 ? this.sunDir : this.sunDir.clone().negate());
    if (this.lightDir.y < 0.22) { this.lightDir.y = 0.22; this.lightDir.normalize(); }
    this.sun.color.copy(k.sun);
    this.sun.intensity = si;
    this.hemi.color.copy(k.hs);
    this.hemi.groundColor.copy(k.hg);
    this.hemi.intensity = hi;
    this.scene.fog.color.copy(k.fog);

    if (playerPos) {
      this.sun.target.position.copy(playerPos);
      this.sun.position.copy(playerPos).addScaledVector(this.lightDir, 120);
      this.sky.position.copy(playerPos);
    }
    // cloud tint
    this.cloudMat.color.copy(k.hor).lerp(new THREE.Color(1, 1, 1), 0.55);
    this.cloudMat.emissive.copy(k.top).lerp(k.hor, 0.4).multiplyScalar(0.6);
    this.horizonColor = k.hor;
    this.topColor = k.top;
    this.sunColor = k.sun;
  }

  get isNight() { return this.night > 0.5; }
}
