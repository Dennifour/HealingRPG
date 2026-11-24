import * as THREE from 'three';
import { mulberry32, smoothstep } from './noise.js';
import { ZONES, LAKE, PLATEAU, POND } from './config.js';
import { patchWorldMaterial, mergeGeos, paint, FX } from './materials.js';
import { pathDistance } from './terrain.js';

const rnd = mulberry32(1234);
const R = (a = 0, b = 1) => a + (b - a) * rnd();

// ---------- geometry builders ----------
function blob(r, detail, color, x, y, z, sx = 1, sy = 1, sz = 1, sway = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const k = 1 + (Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7)) * 0.12;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color, { jitter: 0.08, sway });
}
function trunk(r0, r1, h, color, segs = 6, lean = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, segs, 3);
  g.translate(0, h / 2, 0);
  if (lean) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.pow(p.getY(i) / h, 2) * lean);
  }
  return paint(g, color, { jitter: 0.05, sway: 0 });
}

function roundTree(leaf = '#5fa040', leaf2 = '#88c255') {
  const parts = [trunk(0.38, 0.22, 3.6, '#7a5a3c')];
  parts.push(blob(1.9, 1, leaf, 0, 4.6, 0, 1.1, 0.95, 1.1));
  parts.push(blob(1.4, 1, leaf2, 1.1, 5.2, 0.5));
  parts.push(blob(1.3, 1, leaf, -1.0, 4.3, -0.6));
  parts.push(blob(1.1, 1, leaf2, 0.2, 6.0, -0.4));
  return mergeGeos(parts);
}
function blossomTree() {
  const parts = [trunk(0.4, 0.2, 3.2, '#6e4c3a', 6, 0.6)];
  parts.push(blob(1.8, 1, '#f3a6c4', 0.6, 4.4, 0, 1.2, 0.85, 1.1));
  parts.push(blob(1.3, 1, '#ffc6da', 1.7, 4.9, 0.6));
  parts.push(blob(1.2, 1, '#e98bb2', -0.6, 4.2, -0.7));
  parts.push(blob(1.0, 1, '#ffd6e6', 0.8, 5.6, -0.3));
  return mergeGeos(parts);
}
function pineTree() {
  const parts = [trunk(0.3, 0.18, 2.2, '#6a4a32')];
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const r = 2.2 - i * 0.45, h = 2.4 - i * 0.25;
    const g = new THREE.ConeGeometry(r, h, 7, 1);
    g.translate(0, 2.0 + i * 1.35 + h / 2, 0);
    g.rotateY(i * 0.7);
    parts.push(paint(g, i % 2 ? '#3f7a4a' : '#356b42', { top: '#5a9a5e', jitter: 0.06, sway: 0.4 + i * 0.25 }));
  }
  return mergeGeos(parts);
}
function forestTree() {
  const parts = [trunk(0.7, 0.35, 7.5, '#5d4330', 7)];
  parts.push(blob(3.0, 1, '#3f7a3a', 0, 8.6, 0, 1.1, 0.8, 1.1, 0.7));
  parts.push(blob(2.2, 1, '#4f8c40', 1.8, 9.5, 0.8, 1, 1, 1, 0.9));
  parts.push(blob(2.2, 1, '#356c34', -1.8, 8.8, -0.9, 1, 1, 1, 0.9));
  parts.push(blob(1.8, 1, '#5c9a48', 0.3, 10.6, -0.4, 1, 1, 1, 1));
  return mergeGeos(parts);
}
function birchTree() {
  const parts = [trunk(0.22, 0.14, 4.6, '#e8e2d6', 6, 0.3)];
  parts.push(blob(1.3, 1, '#b8cf5a', 0.3, 5.2, 0, 0.9, 1.3, 0.9));
  parts.push(blob(1.0, 1, '#d4d86a', 0.6, 6.2, 0.3));
  parts.push(blob(0.9, 1, '#a6c450', -0.3, 4.8, -0.3));
  return mergeGeos(parts);
}
function bush(color = '#5a9a44') {
  return mergeGeos([
    blob(0.9, 1, color, 0, 0.5, 0, 1.2, 0.8, 1.1, 0.5),
    blob(0.7, 1, '#6aac50', 0.7, 0.45, 0.2, 1, 0.8, 1, 0.5),
    blob(0.6, 1, color, -0.6, 0.4, -0.2, 1, 0.8, 1, 0.5),
  ]);
}
function rockGeo(seed) {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const k = 1 + Math.sin(v.x * 4 + seed) * 0.12 + Math.cos(v.z * 5 + seed) * 0.1;
    p.setXYZ(i, v.x * k * 1.2, v.y * k * 0.75, v.z * k);
  }
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color('#9a968e'), moss = new THREE.Color('#7f9a58');
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const ny = ng.attributes.normal.getY(i);
    c.copy(base).lerp(moss, smoothstep(0.55, 0.9, ny));
    col.set([c.r, c.g, c.b], i * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function makeInstanced(geo, mat, transforms, { cast = true, receive = true, colors = null } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  transforms.forEach((t, i) => {
    e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    q.setFromEuler(e);
    s.set(t.sx ?? t.s, t.sy ?? t.s, t.sz ?? t.s);
    p.set(t.x, t.y, t.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, colors[i]);
  });
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------- world vegetation ----------
export class Vegetation {
  constructor(scene, terrain, colliders, quality) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.quality = quality;
    this.grassChunks = [];
    this.flowerGrow = {};
    this.reserved = [];

    this.treeMat = patchWorldMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }), { wind: 2 });
    this.rockMat = patchWorldMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  }

  reserve(x, z, r) { this.reserved.push({ x, z, r }); }
  isReserved(x, z, pad = 0) {
    for (const o of this.reserved) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + pad) ** 2) return true;
    return false;
  }

  okGround(x, z, { minH = 1.0, maxSlope = 0.82, pathPad = 3.2, pad = 0 } = {}) {
    const h = this.terrain.heightAt(x, z);
    if (h < minH) return false;
    const n = this.terrain.normalAt(x, z);
    if (n.y < maxSlope) return false;
    if (pathDistance(x, z) < pathPad) return false;
    if (this.isReserved(x, z, pad)) return false;
    return true;
  }

  scatter(count, area, opts, fn) {
    let tries = 0, placed = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      let x, z;
      if (area.ring) {
        const a = R(0, Math.PI * 2), r = R(area.ring[0], area.ring[1]);
        x = area.x + Math.cos(a) * r; z = area.z + Math.sin(a) * r;
      } else {
        const d = area.d ?? area.w;
        x = area.x + R(-area.w, area.w); z = area.z + R(-d, d);
      }
      if (!this.okGround(x, z, opts)) continue;
      if (opts.spacing && this.colliders.near(x, z, opts.spacing)) continue;
      fn(x, this.terrain.heightAt(x, z), z);
      placed++;
    }
  }

  build() {
    const T = this.terrain;
    const trees = { round: [], blossom: [], pine: [], forest: [], birch: [], bush: [], rock: [] };
    const addTree = (type, x, y, z, s, colR) => {
      trees[type].push({ x, y: y - 0.2, z, s, ry: R(0, Math.PI * 2) });
      if (colR) this.colliders.add(x, z, colR * s);
    };

    // center hill blossom ring
    this.scatter(16, { x: 0, z: 0, ring: [20, 48] }, { spacing: 7 }, (x, y, z) => addTree('blossom', x, y, z, R(0.9, 1.3), 0.5));
    // meadow
    this.scatter(22, { x: ZONES.meadow.x, z: ZONES.meadow.z, w: 80 }, { spacing: 12 }, (x, y, z) => addTree('round', x, y, z, R(0.9, 1.4), 0.5));
    this.scatter(14, { x: ZONES.meadow.x, z: ZONES.meadow.z, w: 80 }, { spacing: 9 }, (x, y, z) => addTree('birch', x, y, z, R(0.9, 1.3), 0.35));
    // forest — dense
    this.scatter(190, { x: ZONES.forest.x, z: ZONES.forest.z, w: 70 }, { spacing: 4.6 }, (x, y, z) => addTree('forest', x, y, z, R(0.8, 1.35), 0.75));
    this.scatter(70, { x: ZONES.forest.x, z: ZONES.forest.z, w: 80 }, { spacing: 4 }, (x, y, z) => addTree('pine', x, y, z, R(0.9, 1.5), 0.4));
    // lake shore
    this.scatter(34, { x: LAKE.x, z: LAKE.z, ring: [LAKE.r + 4, LAKE.r + 30] }, { spacing: 6 }, (x, y, z) => addTree('birch', x, y, z, R(0.9, 1.4), 0.35));
    this.scatter(14, { x: LAKE.x, z: LAKE.z, ring: [LAKE.r + 10, LAKE.r + 40] }, { spacing: 8 }, (x, y, z) => addTree('round', x, y, z, R(0.9, 1.3), 0.5));
    // highlands
    this.scatter(70, { x: PLATEAU.x, z: PLATEAU.z, ring: [PLATEAU.r + 12, PLATEAU.r + 45] }, { spacing: 5.5 }, (x, y, z) => addTree('pine', x, y, z, R(1.0, 1.7), 0.45));
    this.scatter(26, { x: PLATEAU.x, z: PLATEAU.z, ring: [6, PLATEAU.r - 8] }, { spacing: 7, minH: 20 }, (x, y, z) => addTree('pine', x, y, z, R(0.8, 1.3), 0.45));
    // general filler
    this.scatter(110, { x: 0, z: 0, w: 190 }, { spacing: 9 }, (x, y, z) => {
      const r = rnd();
      addTree(r < 0.45 ? 'round' : r < 0.75 ? 'pine' : 'birch', x, y, z, R(0.85, 1.4), 0.45);
    });
    // bushes
    this.scatter(260, { x: 0, z: 0, w: 190 }, { spacing: 3, pathPad: 2.5 }, (x, y, z) => trees.bush.push({ x, y: y - 0.1, z, s: R(0.6, 1.3), ry: R(0, 6.3) }));
    this.scatter(120, { x: ZONES.forest.x, z: ZONES.forest.z, w: 75 }, { spacing: 2.5, pathPad: 2.5 }, (x, y, z) => trees.bush.push({ x, y: y - 0.1, z, s: R(0.7, 1.4), ry: R(0, 6.3) }));
    // rocks
    this.scatter(130, { x: 0, z: 0, w: 200 }, { minH: -1, maxSlope: 0.5, spacing: 4, pathPad: 2.5 }, (x, y, z) => {
      const s = R(0.6, 2.2);
      trees.rock.push({ x, y: y - s * 0.2, z, s, sy: s * R(0.6, 1.1), ry: R(0, 6.3), rx: R(-0.2, 0.2) });
      if (s > 1.1) this.colliders.add(x, z, s * 1.0);
    });
    // cliff boulders around plateau
    for (let i = 0; i < 46; i++) {
      const a = R(0, Math.PI * 2), r = PLATEAU.r + R(4, 14);
      const x = PLATEAU.x + Math.cos(a) * r, z = PLATEAU.z + Math.sin(a) * r;
      if (this.isReserved(x, z, 3) || pathDistance(x, z) < 4) continue;
      const s = R(1.5, 3.8);
      trees.rock.push({ x, y: T.heightAt(x, z) - s * 0.3, z, s, sy: s * R(0.7, 1.2), ry: R(0, 6.3) });
      this.colliders.add(x, z, s * 0.95);
    }

    const geos = { round: roundTree(), blossom: blossomTree(), pine: pineTree(), forest: forestTree(), birch: birchTree(), bush: bush() };
    for (const k of Object.keys(geos)) {
      if (!trees[k].length) continue;
      this.scene.add(makeInstanced(geos[k], this.treeMat, trees[k], { cast: k !== 'bush' }));
    }
    // rocks with a few shape variations
    const rockVariants = [rockGeo(1), rockGeo(2.5), rockGeo(4)];
    rockVariants.forEach((g, vi) => {
      const list = trees.rock.filter((_, i) => i % 3 === vi);
      if (list.length) this.scene.add(makeInstanced(g, this.rockMat, list));
    });

    this.buildGrass();
    this.buildFlowers();
    this.buildMushrooms();
    this.buildReeds();
  }

  buildGrass() {
    const T = this.terrain;
    // tuft of 3 tapered blades; both windings share an upward normal so they light softly from any side
    const segs = 3, w = 0.11, h = 0.7;
    const pos = [], sway = [], col = [], nor = [], idx = [];
    const base = new THREE.Color('#5d8a3a'), tip = new THREE.Color('#d2e889');
    for (let b = 0; b < 3; b++) {
      const rot = (b / 3) * Math.PI + (b * 0.37);
      const ox = Math.cos(rot * 2.1) * 0.12, oz = Math.sin(rot * 1.7) * 0.12;
      const hh = h * (0.8 + b * 0.15);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const start = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const ww = w * (1 - t * 0.9);
        const bend = t * t * 0.18;
        const c = base.clone().lerp(tip, t);
        const pts = i < segs ? [[-ww, bend], [ww, bend]] : [[0, bend]];
        for (const [lx, lz] of pts) {
          pos.push(ox + lx * cs - lz * sn, t * hh, oz + lx * sn + lz * cs);
          sway.push(t); col.push(c.r, c.g, c.b); nor.push(0, 1, 0);
        }
      }
      for (let i = 0; i < segs - 1; i++) {
        const a = start + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      const last = start + (segs - 1) * 2;
      idx.push(last, last + 1, last + 2, last, last + 2, last + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
    geo.setIndex(idx);

    const mat = patchWorldMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { wind: 1 });
    this.grassMat = mat;

    const total = this.quality === 'low' ? 45000 : 110000;
    const chunk = 32;
    const area = 210;
    const nC = Math.ceil((area * 2) / chunk);
    const perChunk = Math.floor(total / (nC * nC) * 1.6);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const palette = [new THREE.Color('#8fbf55'), new THREE.Color('#a8cc62'), new THREE.Color('#74a84a'), new THREE.Color('#c2d36e')];
    for (let ci = 0; ci < nC; ci++) {
      for (let cj = 0; cj < nC; cj++) {
        const x0 = -area + ci * chunk, z0 = -area + cj * chunk;
        const mats = [], cols = [];
        for (let k = 0; k < perChunk; k++) {
          const x = x0 + rnd() * chunk, z = z0 + rnd() * chunk;
          const hgt = T.heightAt(x, z);
          if (hgt < 0.9) continue;
          const nrm = T.normalAt(x, z);
          if (nrm.y < 0.8) continue;
          const pd = pathDistance(x, z);
          if (pd < 1.6) continue;
          if (this.isReserved(x, z, -1)) continue;
          const dm = Math.hypot(x - ZONES.meadow.x, z - ZONES.meadow.z);
          const df = Math.hypot(x - ZONES.forest.x, z - ZONES.forest.z);
          let dens = 0.55 + smoothstep(85, 30, dm) * 0.45 - smoothstep(80, 40, df) * 0.15;
          if (pd < 3.5) dens *= 0.4;
          if (rnd() > dens) continue;
          let sc = 0.7 + rnd() * 0.7;
          sc *= 1 + smoothstep(80, 30, dm) * 0.35;
          if (hgt > 18) sc *= 0.75;
          q.setFromAxisAngle(up, rnd() * Math.PI * 2);
          s.set(sc, sc * (0.8 + rnd() * 0.6), sc);
          p.set(x, hgt - 0.05, z);
          m.compose(p, q, s);
          mats.push(m.clone());
          c.copy(palette[(rnd() * palette.length) | 0]);
          if (df < 80) c.lerp(new THREE.Color('#5d9a45'), 0.5);
          cols.push(c.clone());
        }
        if (!mats.length) continue;
        const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); mesh.setColorAt(i, cols[i]); });
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.computeBoundingSphere();
        mesh.userData.center = new THREE.Vector2(x0 + chunk / 2, z0 + chunk / 2);
        this.scene.add(mesh);
        this.grassChunks.push(mesh);
      }
    }
  }

  buildFlowers() {
    const T = this.terrain;
    const stemGeo = paint(new THREE.CylinderGeometry(0.018, 0.025, 0.5, 4, 1).translate(0, 0.25, 0), '#4f8a36', { sway: 0.6, swayByHeight: true });
    const head = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const g = new THREE.SphereGeometry(0.075, 6, 4);
      g.scale(1, 0.35, 0.6);
      g.translate(0.07, 0, 0);
      g.rotateY(a);
      head.push(paint(g, '#ffffff', { sway: 0.6 }));
    }
    head.push(paint(new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0.02, 0), '#ffd84a', { sway: 0.6 }));
    const headGeo = mergeGeos(head);
    headGeo.translate(0, 0.5, 0);

    const sets = [
      { zone: 'meadow', n: 2200, colors: ['#ffffff', '#ffe066', '#ff9ec4', '#c7a6ff', '#ffb37a'] },
      { zone: 'center', n: 900, colors: ['#ffb3d1', '#ffffff', '#ffd6e8'] },
      { zone: 'forest', n: 800, colors: ['#7fb2ff', '#a8c8ff', '#e0f0ff'] },
      { zone: 'lake', n: 700, colors: ['#ffffff', '#a6e3ff', '#ffe9a8'] },
      { zone: 'highlands', n: 800, colors: ['#ffffff', '#d6b3ff', '#fff3c4'] },
    ];
    for (const set of sets) {
      const z = ZONES[set.zone];
      const grow = { value: 0.25 };
      this.flowerGrow[set.zone] = grow;
      const stemMat = patchWorldMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { wind: 1, grow });
      const headMat = patchWorldMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 }), { wind: 1, grow });
      const tr = [], cols = [];
      let tries = 0;
      // flowers grow in little clusters
      while (tr.length < set.n && tries < set.n * 10) {
        tries++;
        const a = R(0, Math.PI * 2), r = Math.sqrt(rnd()) * z.r * 0.9;
        const cx = z.x + Math.cos(a) * r, cz = z.z + Math.sin(a) * r;
        if (!this.okGround(cx, cz, { minH: 1.0, maxSlope: 0.85, pathPad: 2.2 })) continue;
        const color = new THREE.Color(set.colors[(rnd() * set.colors.length) | 0]);
        const k = 3 + ((rnd() * 8) | 0);
        for (let i = 0; i < k; i++) {
          const x = cx + R(-1.6, 1.6), zz = cz + R(-1.6, 1.6);
          const y = T.heightAt(x, zz);
          if (y < 1.0) continue;
          tr.push({ x, y: y - 0.02, z: zz, s: R(0.8, 1.4), ry: R(0, 6.3), rx: R(-0.15, 0.15) });
          cols.push(color);
        }
      }
      const stems = makeInstanced(stemGeo, stemMat, tr, { cast: false });
      const heads = makeInstanced(headGeo, headMat, tr, { cast: false, colors: cols });
      this.scene.add(stems, heads);
    }
  }

  buildMushrooms() {
    // glowing mushrooms in the forest, light up at night
    const stem = paint(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6).translate(0, 0.2, 0), '#efe6d6');
    const cap = new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.6, 1); cap.translate(0, 0.38, 0);
    const capG = paint(cap, '#ffffff');
    this.mushMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.6 });
    this.mushMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;');
    };
    const stemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const tr = [], cols = [];
    const palette = ['#9ff3ff', '#c7a6ff', '#9dffc2'];
    this.scatter(140, { x: ZONES.forest.x, z: ZONES.forest.z, w: 75 }, { pathPad: 1.8 }, (x, y, z) => {
      const k = 2 + ((rnd() * 4) | 0);
      const col = new THREE.Color(palette[(rnd() * 3) | 0]);
      for (let i = 0; i < k; i++) {
        const xx = x + R(-0.8, 0.8), zz = z + R(-0.8, 0.8);
        tr.push({ x: xx, y: this.terrain.heightAt(xx, zz) - 0.05, z: zz, s: R(0.6, 1.5), ry: R(0, 6), rz: R(-0.2, 0.2) });
        cols.push(col);
      }
    });
    this.scene.add(makeInstanced(stem, stemMat, tr, { cast: false }));
    this.scene.add(makeInstanced(capG, this.mushMat, tr, { cast: false, colors: cols }));
  }

  buildReeds() {
    // reeds & lily pads around the lake and pond
    const reed = paint(new THREE.CylinderGeometry(0.02, 0.04, 1.6, 3).translate(0, 0.8, 0), '#6f8f3e', { top: '#c2c26a', sway: 0.8, swayByHeight: true });
    const tr = [];
    const T = this.terrain;
    for (let i = 0; i < 1400; i++) {
      const cx = rnd() < 0.85 ? LAKE : { x: POND.x, z: POND.z, r: 12 };
      const a = R(0, Math.PI * 2), r = R(cx.r - 6, cx.r + 10);
      const x = cx.x + Math.cos(a) * r, z = cx.z + Math.sin(a) * r;
      const h = T.heightAt(x, z);
      if (h > 0.9 || h < -0.7) continue;
      if (this.isReserved(x, z, 0)) continue;
      tr.push({ x, y: h, z, s: R(0.7, 1.3), ry: R(0, 6), rx: R(-0.15, 0.15) });
    }
    const mat = patchWorldMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { wind: 1 });
    this.scene.add(makeInstanced(reed, mat, tr, { cast: false }));

    const pad = paint(new THREE.CircleGeometry(0.7, 10, 0.3, Math.PI * 2 - 0.4).rotateX(-Math.PI / 2), '#4f9a4a');
    const pads = [];
    for (let i = 0; i < 160; i++) {
      const a = R(0, Math.PI * 2), r = R(8, LAKE.r - 2);
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      const h = T.heightAt(x, z);
      if (h > -0.6 || this.isReserved(x, z, 1)) continue;
      pads.push({ x, y: 0.04, z, s: R(0.6, 1.4), ry: R(0, 6.3) });
    }
    const padMat = patchWorldMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(makeInstanced(pad, padMat, pads, { cast: false }));
  }

  update(playerPos, night) {
    for (const c of this.grassChunks) {
      const dx = c.userData.center.x - playerPos.x, dz = c.userData.center.y - playerPos.z;
      c.visible = dx * dx + dz * dz < 150 * 150;
    }
    if (this.mushMat) this.mushMat.emissiveIntensity = 0.15 + night * 1.6;
  }
}
