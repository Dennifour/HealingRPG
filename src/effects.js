import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { glowSprite, glowTexture } from './models.js';
import { ZONES } from './config.js';

const rnd = mulberry32(77);

const pointVert = /* glsl */ `
  uniform float uTime; uniform float uSize; uniform vec3 uCenter; uniform float uWrap; uniform float uPixel;
  attribute float aSeed;
  varying float vSeed; varying float vFade;
  void main() {
    vec3 p = position;
    #ifdef WRAP
      p.xz = uCenter.xz + mod(p.xz - uCenter.xz + uWrap * 0.5, uWrap) - uWrap * 0.5;
      p.y = uCenter.y + mod(p.y - uCenter.y + 6.0 - uTime * 0.25 * (0.5 + aSeed), 16.0) - 6.0;
      p.x += sin(uTime * 0.6 + aSeed * 30.0) * 1.2;
      p.z += cos(uTime * 0.5 + aSeed * 20.0) * 1.2;
      float dxz = length(p.xz - uCenter.xz);
      vFade = 1.0 - smoothstep(uWrap * 0.3, uWrap * 0.5, dxz);
    #else
      p.x += sin(uTime * 0.7 + aSeed * 40.0) * 1.4;
      p.y += sin(uTime * 1.1 + aSeed * 17.0) * 0.6;
      p.z += cos(uTime * 0.6 + aSeed * 23.0) * 1.4;
      vFade = 1.0;
    #endif
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * uPixel * (0.6 + aSeed * 0.8) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const pointFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uBlink;
  varying float vSeed; varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.6);
    float blink = mix(1.0, 0.5 + 0.5 * sin(uTime * (1.5 + vSeed * 2.0) + vSeed * 60.0), uBlink);
    gl_FragColor = vec4(uColor * (1.0 + a), a * uOpacity * blink * vFade);
  }
`;

function makePoints(positions, seeds, uniforms, defines = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: pointVert, fragmentShader: pointFrag, defines,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

export class Ambient {
  constructor(scene, terrain, pixelRatio) {
    const px = window.innerHeight * pixelRatio;
    // fireflies
    const pos = [], seeds = [];
    const areas = [[ZONES.forest, 520], [ZONES.meadow, 260], [ZONES.lake, 220], [ZONES.center, 120], [ZONES.highlands, 120]];
    for (const [z, n] of areas) {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * z.r * 0.85;
        const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r;
        const h = Math.max(terrain.heightAt(x, zz), 0.2);
        pos.push(x, h + 0.6 + rnd() * 3.5, zz);
        seeds.push(rnd());
      }
    }
    this.fireU = {
      uTime: { value: 0 }, uSize: { value: 0.5 }, uPixel: { value: px }, uCenter: { value: new THREE.Vector3() }, uWrap: { value: 0 },
      uColor: { value: new THREE.Color('#d6ff7a') }, uOpacity: { value: 0 }, uBlink: { value: 1 },
    };
    this.fireflies = makePoints(pos, seeds, this.fireU);
    scene.add(this.fireflies);

    // drifting motes (around the player)
    const mp = [], ms = [];
    for (let i = 0; i < 700; i++) { mp.push((rnd() - 0.5) * 70, rnd() * 16 - 6, (rnd() - 0.5) * 70); ms.push(rnd()); }
    this.moteU = {
      uTime: { value: 0 }, uSize: { value: 0.22 }, uPixel: { value: px }, uCenter: { value: new THREE.Vector3() }, uWrap: { value: 70 },
      uColor: { value: new THREE.Color('#fff2c0') }, uOpacity: { value: 0.5 }, uBlink: { value: 0.5 },
    };
    this.motes = makePoints(mp, ms, this.moteU, { WRAP: 1 });
    scene.add(this.motes);

    // petals around the great tree
    const pp = [], ps = [];
    for (let i = 0; i < 900; i++) { pp.push((rnd() - 0.5) * 80, rnd() * 16, (rnd() - 0.5) * 80); ps.push(rnd()); }
    this.petalU = {
      uTime: { value: 0 }, uSize: { value: 0.35 }, uPixel: { value: px }, uCenter: { value: new THREE.Vector3(0, 14, 0) }, uWrap: { value: 80 },
      uColor: { value: new THREE.Color('#ffb0cf') }, uOpacity: { value: 0 }, uBlink: { value: 0.3 },
    };
    this.petals = makePoints(pp, ps, this.petalU, { WRAP: 1 });
    scene.add(this.petals);

    this.burst = new Burst(scene);
  }

  update(dt, elapsed, playerPos, night, petalAmount) {
    for (const u of [this.fireU, this.moteU, this.petalU]) u.uTime.value = elapsed;
    this.fireU.uOpacity.value = 0.15 + night * 1.0;
    this.moteU.uCenter.value.copy(playerPos);
    this.moteU.uOpacity.value = 0.45 * (1 - night) + 0.15;
    this.moteU.uColor.value.set(night > 0.5 ? '#a8d8ff' : '#fff2c0');
    this.petalU.uOpacity.value = petalAmount;
    this.burst.update(dt);
  }

  resize(pixelRatio) {
    const px = window.innerHeight * pixelRatio;
    for (const u of [this.fireU, this.moteU, this.petalU]) u.uPixel.value = px;
    this.burst.mat.size = 0.35;
  }
}

class Burst {
  constructor(scene) {
    this.max = 600;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.base = new Float32Array(this.max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.35, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.idx = 0;
  }
  emit(p, color, n = 40, speed = 4, up = 2) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const k = this.idx; this.idx = (this.idx + 1) % this.max;
      this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
      const a = rnd() * Math.PI * 2, b = rnd() * Math.PI - Math.PI / 2;
      const s = speed * (0.3 + rnd() * 0.7);
      this.vel[k * 3] = Math.cos(a) * Math.cos(b) * s;
      this.vel[k * 3 + 1] = Math.abs(Math.sin(b)) * s + up;
      this.vel[k * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.life[k] = 1 + rnd() * 0.8;
      this.base[k * 3] = c.r; this.base[k * 3 + 1] = c.g; this.base[k * 3 + 2] = c.b;
    }
  }
  update(dt) {
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) continue;
      this.life[k] -= dt;
      const f = Math.max(this.life[k], 0);
      this.vel[k * 3 + 1] -= dt * 1.5;
      for (let a = 0; a < 3; a++) {
        this.vel[k * 3 + a] *= 1 - dt * 1.2;
        this.pos[k * 3 + a] += this.vel[k * 3 + a] * dt;
      }
      const d = Math.min(1, f);
      for (let a = 0; a < 3; a++) this.col[k * 3 + a] = this.base[k * 3 + a] * d;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------ Star seed collectible
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color('#ffe9a0') }, uTime: { value: 0 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
    void main(){ float a = pow(1.0 - vUv.y, 1.5) * 0.35 * (0.8 + 0.2 * sin(uTime * 2.0 + vUv.y * 10.0));
      a *= smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x) * 2.0;
      gl_FragColor = vec4(uColor, a); }`,
});
export { beamMat };

export class StarSeed {
  constructor(scene, x, y, z, { id, zone, hidden = true }) {
    this.id = id; this.zone = zone;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.base = new THREE.Vector3(x, y, z);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffcf4a', emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.2, flatShading: true }));
    core.scale.set(1, 1.4, 1);
    this.core = core;
    this.group.add(core);
    this.group.add(glowSprite('#ffd86a', 2.4, 0.9));
    this.halo = glowSprite('#fff0b0', 5, 0.25);
    this.group.add(this.halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 8, 1, true).translate(0, 20, 0), beamMat);
    beam.position.y = -0.5;
    this.beam = beam;
    this.group.add(beam);
    this.collected = false;
    this.visible = !hidden ? true : true;
    scene.add(this.group);
    this.t = rnd() * 10;
    this.collectT = 0;
  }
  setActive(v) { this.group.visible = v; this.active = v; }
  update(dt, elapsed) {
    if (!this.group.visible) return;
    this.t += dt;
    if (this.collected) {
      this.collectT += dt;
      const s = Math.max(0, 1 - this.collectT * 1.8);
      this.group.scale.setScalar(s);
      this.group.position.y += dt * 4;
      if (s <= 0) this.group.visible = false;
      return;
    }
    this.core.rotation.y += dt * 1.4;
    this.group.position.y = this.base.y + Math.sin(this.t * 2) * 0.18;
    this.halo.material.opacity = 0.18 + Math.sin(this.t * 3) * 0.08;
  }
}
