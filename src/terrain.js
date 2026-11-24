import * as THREE from 'three';
import { createNoise2D, fbm, smoothstep, lerp, clamp } from './noise.js';
import { WORLD, LAKE, PLATEAU, POND, PATHS, ZONES } from './config.js';
import { patchWorldMaterial } from './materials.js';

const n1 = createNoise2D(7);
const n2 = createNoise2D(21);
const n3 = createNoise2D(99);

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

export function pathDistance(x, z) {
  let d = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      d = Math.min(d, distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
    }
  }
  return d + n3(x * 0.15, z * 0.15) * 0.8;
}

// Analytic height (used to build the grid)
function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = 2.2 + fbm(n1, x * 0.0065, z * 0.0065, 4) * 4.5 + fbm(n2, x * 0.03, z * 0.03, 3) * 0.9;

  // central hill for the great tree
  h += 10.5 * Math.exp(-(((r / 36)) ** 2));

  // meadow: soft rolling, slightly flattened
  const dm = Math.hypot(x - ZONES.meadow.x, z - ZONES.meadow.z);
  const meadow = smoothstep(80, 40, dm);
  h = lerp(h, 2.4 + n2(x * 0.02, z * 0.02) * 1.4, meadow * 0.65);

  // forest: a little more bumpy
  const df = Math.hypot(x - ZONES.forest.x, z - ZONES.forest.z);
  h += smoothstep(85, 40, df) * fbm(n3, x * 0.04, z * 0.04, 3) * 1.6;

  // plateau (cliffs)
  const dp = Math.hypot(x - PLATEAU.x, z - PLATEAU.z) + n1(x * 0.05, z * 0.05) * 5;
  const top = smoothstep(PLATEAU.r + 9, PLATEAU.r - 2, dp);
  h = lerp(h, PLATEAU.height + fbm(n2, x * 0.03, z * 0.03, 3) * 1.5, top);
  const dpk = Math.hypot(x - PLATEAU.peak.x, z - PLATEAU.peak.z);
  h += top * 6.5 * Math.exp(-(((dpk / 13)) ** 2));

  // waterfall pond at foot of plateau
  const dpo = Math.hypot(x - POND.x, z - POND.z);
  h = lerp(h, -2.2, smoothstep(13, 6, dpo));

  // lake
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z) + n1(x * 0.04, z * 0.04) * 4;
  h = lerp(h, -5.5, smoothstep(LAKE.r + 6, LAKE.r - 12, dl));
  // lake islet
  const di = Math.hypot(x - LAKE.islet.x, z - LAKE.islet.z);
  h = Math.max(h, 1.9 - 0.022 * di * di);

  // island coast
  const coastNoise = fbm(n2, x * 0.01, z * 0.01, 3) * 18;
  const coast = smoothstep(WORLD.islandRadius - 25, WORLD.islandRadius + 25, r + coastNoise);
  h = lerp(h, -9, coast);

  // paths: slight flattening/sinking
  const pd = pathDistance(x, z);
  h -= smoothstep(3.2, 0.5, pd) * 0.18;

  return h;
}

export class Terrain {
  constructor() {
    const { size, seg } = WORLD;
    this.size = size;
    this.seg = seg;
    this.cell = size / seg;
    const n = seg + 1;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -size / 2 + i * this.cell;
        const z = -size / 2 + j * this.cell;
        this.heights[j * n + i] = rawHeight(x, z);
      }
    }
  }

  heightAt(x, z) {
    const { size, seg, cell } = this;
    const fx = (x + size / 2) / cell, fz = (z + size / 2) / cell;
    const i = clamp(Math.floor(fx), 0, seg - 1), j = clamp(Math.floor(fz), 0, seg - 1);
    const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
    const n = seg + 1, H = this.heights;
    const h00 = H[j * n + i], h10 = H[j * n + i + 1], h01 = H[(j + 1) * n + i], h11 = H[(j + 1) * n + i + 1];
    // match PlaneGeometry triangulation (a,b,d) / (b,c,d)
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.0;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  buildMesh() {
    const { size, seg } = this;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const n = seg + 1;
    // PlaneGeometry rotated: row j goes from z=-size/2 (after rotation y-> -z). Map exactly using coords.
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const i = Math.round((x + size / 2) / this.cell);
      const j = Math.round((z + size / 2) / this.cell);
      pos.setY(k, this.heights[j * n + i]);
    }
    geo.computeVertexNormals();

    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color('#7fb04a');
    const grassB = new THREE.Color('#a9c45a');
    const meadowC = new THREE.Color('#b8d26a');
    const forestC = new THREE.Color('#4f8a3c');
    const highC = new THREE.Color('#8cb36a');
    const sand = new THREE.Color('#e8d6a4');
    const wetSand = new THREE.Color('#bfa77a');
    const rock = new THREE.Color('#8b8a86');
    const rockDark = new THREE.Color('#6b6a68');
    const dirt = new THREE.Color('#c49a67');
    const under = new THREE.Color('#8a7f62');
    const nrm = geo.attributes.normal;

    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const ny = nrm.getY(k);
      const v = n1(x * 0.05, z * 0.05) * 0.5 + 0.5;
      c.copy(grassA).lerp(grassB, v);
      const dm = Math.hypot(x - ZONES.meadow.x, z - ZONES.meadow.z);
      c.lerp(meadowC, smoothstep(85, 40, dm) * 0.7 * (0.6 + 0.4 * v));
      const df = Math.hypot(x - ZONES.forest.x, z - ZONES.forest.z);
      c.lerp(forestC, smoothstep(90, 45, df) * 0.85);
      if (y > 18) c.lerp(highC, 0.6);
      // paths
      const pd = pathDistance(x, z);
      c.lerp(dirt, smoothstep(2.8, 1.2, pd));
      // beach / underwater
      if (y < 1.4) c.lerp(sand, smoothstep(1.4, 0.6, y));
      if (y < 0.1) c.lerp(wetSand, smoothstep(0.1, -0.6, y));
      if (y < -1.0) c.lerp(under, smoothstep(-1, -4, y));
      // cliffs
      const steep = smoothstep(0.78, 0.55, ny);
      c.lerp(v > 0.5 ? rock : rockDark, steep);
      // subtle noise brightness
      const b = 0.92 + n2(x * 0.2, z * 0.2) * 0.08;
      colors[k * 3] = c.r * b; colors[k * 3 + 1] = c.g * b; colors[k * 3 + 2] = c.b * b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    patchWorldMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  // 8-bit depth texture for the water shader: value = clamp((-h + 2)/12)
  buildDepthTexture() {
    const n = this.seg + 1;
    const data = new Uint8Array(n * n * 4);
    for (let k = 0; k < n * n; k++) {
      const d = clamp((-this.heights[k] + 2) / 12, 0, 1);
      data[k * 4] = Math.round(d * 255);
      data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }
}
