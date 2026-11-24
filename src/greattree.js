import * as THREE from 'three';
import { patchWorldMaterial } from './materials.js';
import { glowSprite } from './models.js';
import { mulberry32 } from './noise.js';

const rnd = mulberry32(31337);

// The great "Sky Tree" at the island centre. It regains its blossoms one seed at a time.
export class GreatTree {
  constructor(scene, terrain, colliders) {
    this.group = new THREE.Group();
    const y0 = terrain.heightAt(0, 0) - 0.6;
    this.group.position.set(0, y0, 0);
    this.base = new THREE.Vector3(0, y0, 0);
    scene.add(this.group);

    const bark = patchWorldMaterial(new THREE.MeshStandardMaterial({ color: '#8a6a52', roughness: 0.95, flatShading: true }));
    // trunk: deformed cylinder with flare and twist
    const H = 17;
    const tg = new THREE.CylinderGeometry(1.4, 2.4, H, 16, 24);
    const p = tg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + H / 2;
      const t = y / H;
      let x = p.getX(i), z = p.getZ(i);
      const ang = Math.atan2(z, x);
      const flare = 1 + Math.pow(1 - t, 6) * 1.6;
      const ridge = 1 + Math.sin(ang * 7 + t * 6) * 0.08;
      const tw = t * 1.2;
      const r = flare * ridge;
      const nx = (x * Math.cos(tw) - z * Math.sin(tw)) * r, nz = (x * Math.sin(tw) + z * Math.cos(tw)) * r;
      p.setXYZ(i, nx + Math.sin(t * 3) * 0.5, y, nz);
    }
    tg.computeVertexNormals();
    const trunk = new THREE.Mesh(tg, bark);
    trunk.castShadow = trunk.receiveShadow = true;
    this.group.add(trunk);

    // roots
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.3;
      const len = 6 + rnd() * 4;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 1.5, 2.2, Math.sin(a) * 1.5),
        new THREE.Vector3(Math.cos(a) * 3.5, 1.0, Math.sin(a) * 3.5),
        new THREE.Vector3(Math.cos(a) * len, -0.2, Math.sin(a) * len),
        new THREE.Vector3(Math.cos(a) * (len + 2), -1.2, Math.sin(a) * (len + 2)),
      ]);
      const rg = new THREE.TubeGeometry(c, 14, 0.55, 7);
      // taper
      const rp = rg.attributes.position;
      const m = new THREE.Mesh(rg, bark);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }

    // branches & canopy clusters
    this.clusters = [];
    const leafGeo = new THREE.IcosahedronGeometry(1, 2);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(lp, i);
      const k = 1 + Math.sin(v.x * 5) * Math.cos(v.y * 4 + v.z * 3) * 0.12;
      lp.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    leafGeo.computeVertexNormals();
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.3;
      const ring = i % 3;
      const r = 5 + ring * 2.5 + rnd() * 1.5;
      const h = H - 1 + (2 - ring) * 2.2 + rnd() * 1.5;
      const end = new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r);
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, H - 3 - ring, 0),
        new THREE.Vector3(Math.cos(a) * r * 0.4, H - 1 + ring * 0.4, Math.sin(a) * r * 0.4),
        end,
      ]);
      const b = new THREE.Mesh(new THREE.TubeGeometry(c, 10, 0.4 - ring * 0.06, 6), bark);
      b.castShadow = true;
      this.group.add(b);

      const mat = patchWorldMaterial(new THREE.MeshStandardMaterial({ color: '#8f9a8a', roughness: 0.8, flatShading: true, emissive: '#ff8fc0', emissiveIntensity: 0 }));
      const cl = new THREE.Group();
      cl.position.copy(end);
      const s = 2.6 + rnd() * 1.4;
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(leafGeo, mat);
        m.position.set((rnd() - 0.5) * s, (rnd() - 0.3) * s * 0.6, (rnd() - 0.5) * s);
        m.scale.setScalar(s * (0.6 + rnd() * 0.4));
        m.castShadow = true;
        cl.add(m);
      }
      // hanging light orbs
      const orbs = [];
      for (let k = 0; k < 3; k++) {
        const o = glowSprite(k % 2 ? '#ffd6ec' : '#fff2b0', 1.4, 0);
        o.position.set((rnd() - 0.5) * s * 1.6, -s * 0.8 - rnd() * 1.2, (rnd() - 0.5) * s * 1.6);
        cl.add(o); orbs.push(o);
      }
      cl.scale.setScalar(0.55);
      this.group.add(cl);
      this.clusters.push({ group: cl, mat, orbs, bloom: 0, target: 0, color: new THREE.Color(i % 3 === 0 ? '#ffc2dc' : i % 3 === 1 ? '#f6a8cc' : '#ffd9ea') });
    }
    // central crown
    const crownMat = patchWorldMaterial(new THREE.MeshStandardMaterial({ color: '#8f9a8a', flatShading: true, emissive: '#ffb6d8', emissiveIntensity: 0 }));
    this.crown = new THREE.Mesh(leafGeo, crownMat);
    this.crown.position.set(0, H + 4, 0);
    this.crown.scale.set(6, 4, 6);
    this.crown.castShadow = true;
    this.group.add(this.crown);
    this.crownMat = crownMat;

    // heart light at the trunk base (where seeds are offered)
    this.heart = glowSprite('#ffe3a0', 4, 0.4);
    this.heart.position.set(0, 3.2, 2.6);
    this.group.add(this.heart);
    this.light = new THREE.PointLight('#ffc6e0', 0, 40, 1.4);
    this.light.position.set(0, H, 0);
    this.group.add(this.light);

    colliders.add(0, 0, 3.6);
    this.progress = 0;
    this.pulse = 0;
    this._grey = new THREE.Color('#8f9a8a');
  }

  setProgress(n, instant = false) {
    this.progress = n;
    this.clusters.forEach((c, i) => { c.target = i < n ? 1 : 0; if (instant) c.bloom = c.target; });
    this.pulse = 1;
  }

  update(dt, elapsed, night) {
    this.pulse = Math.max(0, this.pulse - dt * 0.5);
    let total = 0;
    for (const c of this.clusters) {
      c.bloom += (c.target - c.bloom) * Math.min(1, dt * 1.2);
      total += c.bloom;
      c.group.scale.setScalar(0.55 + c.bloom * 0.45 + Math.sin(elapsed * 1.2 + c.group.position.x) * 0.01);
      c.mat.color.copy(this._grey).lerp(c.color, c.bloom);
      c.mat.emissiveIntensity = c.bloom * (0.12 + night * 0.5);
      for (const o of c.orbs) o.material.opacity = c.bloom * (0.35 + night * 0.6) * (0.8 + 0.2 * Math.sin(elapsed * 2 + o.position.x * 3));
    }
    const f = total / this.clusters.length;
    this.crownMat.color.copy(this._grey).lerp(new THREE.Color('#ffc9e0'), f);
    this.crownMat.emissiveIntensity = f * (0.1 + night * 0.45);
    this.light.intensity = f * (2 + night * 30);
    this.heart.material.opacity = 0.35 + Math.sin(elapsed * 2) * 0.12 + this.pulse * 0.6;
    this.heart.scale.setScalar(4 + this.pulse * 6);
  }
}
