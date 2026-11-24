import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Vegetation } from './vegetation.js';
import { Colliders, Platforms } from './physics.js';
import { SkySystem } from './sky.js';
import { Ambient } from './effects.js';
import { patchWorldMaterial, FX } from './materials.js';
import { buildBench, buildLampPost, glowSprite, M } from './models.js';
import { PATHS, ZONES, LAKE, PLATEAU, POND } from './config.js';
import { mulberry32 } from './noise.js';

const rnd = mulberry32(4242);

export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.quality = quality;
    this.terrain = new Terrain();
    this.colliders = new Colliders();
    this.platforms = new Platforms();
    this.sky = new SkySystem(scene, renderer);
    scene.add(this.terrain.buildMesh());
    this.water = new Water(scene, this.terrain, this.sky);
    this.veg = new Vegetation(scene, this.terrain, this.colliders, quality);
    this.lamps = [];
    this.benches = [];
    this.rockMat = patchWorldMaterial(new THREE.MeshStandardMaterial({ color: '#a29c90', flatShading: true, roughness: 0.9 }));
  }

  // find dry land near a point
  dryNear(x, z, minH = 0.6) {
    for (let r = 0; r < 30; r += 1.5) {
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.terrain.heightAt(px, pz) > minH && this.terrain.normalAt(px, pz).y > 0.85) return { x: px, z: pz, y: this.terrain.heightAt(px, pz) };
        if (r === 0) break;
      }
    }
    return { x, z, y: this.terrain.heightAt(x, z) };
  }

  // reserve space before vegetation is placed
  reserveAreas(list) { for (const [x, z, r] of list) this.veg.reserve(x, z, r); }

  buildDecor() {
    this.veg.build();
    this.ambient = new Ambient(this.scene, this.terrain, Math.min(window.devicePixelRatio, 2));
    this.buildLamps();
    this.buildBenches();
  }

  buildLamps() {
    for (const p of PATHS) {
      let acc = 8;
      for (let i = 0; i < p.length - 1; i++) {
        const a = new THREE.Vector2(...p[i]), b = new THREE.Vector2(...p[i + 1]);
        const len = a.distanceTo(b);
        const dir = b.clone().sub(a).normalize();
        const side = new THREE.Vector2(-dir.y, dir.x);
        for (; acc < len; acc += 20) {
          const s = (Math.floor(acc / 20) % 2 ? 1 : -1) * 2.6;
          const x = a.x + dir.x * acc + side.x * s, z = a.y + dir.y * acc + side.y * s;
          const lamp = buildLampPost();
          lamp.position.set(x, this.terrain.heightAt(x, z) - 0.05, z);
          lamp.rotation.y = Math.atan2(-side.x * Math.sign(s), -side.y * Math.sign(s)) - Math.PI / 2;
          this.scene.add(lamp);
          this.lamps.push(lamp);
          this.colliders.add(x, z, 0.25);
        }
        acc -= len;
      }
    }
  }

  buildBenches() {
    const spots = [
      { x: 9, z: 30, look: [0, 90], text: '하늘나무 언덕의 벤치' },
      { x: 18, z: 186, look: [30, 260], text: '바다가 보이는 벤치' },
      { x: 92, z: 26, look: [140, -5], text: '호숫가 벤치' },
      { x: -100, z: -22, look: [-140, 0], text: '숲 어귀의 벤치' },
      { x: 22, z: -124, look: [60, -40], text: '고원 꼭대기 벤치' },
    ];
    for (const s of spots) {
      const d = this.dryNear(s.x, s.z, 0.8);
      const b = buildBench();
      b.position.set(d.x, d.y, d.z);
      const ang = Math.atan2(s.look[0] - d.x, s.look[1] - d.z);
      b.rotation.y = ang;
      this.scene.add(b);
      this.colliders.add(d.x, d.z, 0.9);
      this.benches.push({ obj: b, x: d.x, z: d.z, y: d.y, ang, text: s.text });
      this.veg.reserve(d.x, d.z, 3);
    }
  }

  // decorative rock platform (for climbing to hidden spots)
  rockPillar(x, z, top, r = 1.3) {
    const ground = this.terrain.heightAt(x, z);
    const h = top - ground + 1;
    const g = new THREE.CylinderGeometry(r * 0.9, r * 1.1, h, 9, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const ang = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + Math.sin(ang * 3 + p.getY(i)) * 0.07;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.rockMat);
    m.position.set(x, ground - 1 + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    this.scene.add(m);
    // mossy top
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.9, 0.12, 9), patchWorldMaterial(new THREE.MeshStandardMaterial({ color: '#7fa65a', flatShading: true })));
    cap.position.set(x, top + 0.02, z);
    cap.receiveShadow = true;
    this.scene.add(cap);
    this.platforms.add(x, z, r * 0.95, top + 0.06, { height: h });
    return m;
  }

  update(dt, elapsed, playerPos, timeScale) {
    FX.uTime.value = elapsed;
    FX.uPlayer.value.copy(playerPos);
    this.sky.update(dt * timeScale, elapsed, 600, playerPos);
    this.water.update(elapsed, this.scene);
    const night = this.sky.night;
    this.veg.update(playerPos, night);
    for (const l of this.lamps) {
      l.userData.lampMat.emissiveIntensity = 0.2 + night * 3;
      l.userData.glow.material.opacity = night * 0.8;
    }
  }
}
