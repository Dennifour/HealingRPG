import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { ZONES } from './config.js';

const rnd = mulberry32(808);

// Butterflies and birds: purely ambient life
export class Creatures {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.butterflies = [];
    const wingGeo = new THREE.PlaneGeometry(0.28, 0.22);
    wingGeo.rotateX(-Math.PI / 2);
    wingGeo.translate(0.14, 0, 0);
    const colors = ['#ffd45a', '#ff9ec7', '#9fd8ff', '#ffffff', '#ffb06a', '#c9a8ff'];
    const anchors = [[ZONES.meadow, 34], [ZONES.center, 12], [ZONES.lake, 10], [ZONES.highlands, 8]];
    for (const [z, n] of anchors) {
      for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: colors[(rnd() * colors.length) | 0], side: THREE.DoubleSide, emissive: '#222', roughness: 0.6 });
        const g = new THREE.Group();
        const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
        r.scale.x = -1;
        g.add(l, r);
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * z.r * 0.7;
        const home = new THREE.Vector3(z.x + Math.cos(a) * d, 0, z.z + Math.sin(a) * d);
        g.userData = { l, r, home, seed: rnd() * 100, speed: 0.4 + rnd() * 0.4 };
        scene.add(g);
        this.butterflies.push(g);
      }
    }
    // birds
    this.birds = [];
    const bmat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', side: THREE.DoubleSide, roughness: 0.8 });
    const bw = new THREE.BufferGeometry();
    bw.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.1, 0, -0.1], 3));
    bw.computeVertexNormals();
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(bw, bmat), r = new THREE.Mesh(bw, bmat);
      r.scale.x = -1;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.8, 2.2), bmat);
      g.add(l, r, body);
      const c = { x: (rnd() - 0.5) * 300, z: (rnd() - 0.5) * 300 };
      g.userData = { l, r, c, rad: 20 + rnd() * 40, h: 40 + rnd() * 30, ang: rnd() * 6.28, sp: (0.12 + rnd() * 0.1) * (rnd() < 0.5 ? 1 : -1) };
      g.scale.setScalar(1.2);
      scene.add(g);
      this.birds.push(g);
    }
  }

  update(dt, t, playerPos, night) {
    for (const b of this.butterflies) {
      const u = b.userData;
      const s = u.seed, k = t * u.speed;
      const dx = b.position.x - playerPos.x, dz = b.position.z - playerPos.z;
      const far = dx * dx + dz * dz > 120 * 120;
      b.visible = !far && night < 0.6;
      if (!b.visible) continue;
      const x = u.home.x + Math.sin(k + s) * 6 + Math.sin(k * 2.3 + s * 2) * 2;
      const z = u.home.z + Math.cos(k * 0.8 + s) * 6 + Math.cos(k * 1.7 + s) * 2;
      const y = Math.max(this.terrain.heightAt(x, z), 0) + 0.8 + Math.sin(k * 3 + s) * 0.5;
      const nx = x - b.position.x, nz = z - b.position.z;
      b.position.set(x, y, z);
      if (nx * nx + nz * nz > 1e-6) b.rotation.y = Math.atan2(nx, nz);
      const f = Math.sin(t * 18 + s) * 1.1;
      u.l.rotation.z = f; u.r.rotation.z = -f;
    }
    for (const b of this.birds) {
      const u = b.userData;
      u.ang += u.sp * dt;
      const x = u.c.x + Math.cos(u.ang) * u.rad, z = u.c.z + Math.sin(u.ang) * u.rad;
      b.position.set(x, u.h + Math.sin(u.ang * 3) * 2, z);
      b.lookAt(u.c.x + Math.cos(u.ang + u.sp) * u.rad, b.position.y, u.c.z + Math.sin(u.ang + u.sp) * u.rad);
      const f = Math.sin(t * 5 + u.ang * 10) * 0.5;
      u.l.rotation.z = f; u.r.rotation.z = -f;
    }
  }
}
