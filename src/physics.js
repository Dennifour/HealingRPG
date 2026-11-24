// Simple circle colliders in a spatial hash, plus cylindrical platforms

export class Colliders {
  constructor(cell = 8) {
    this.cell = cell;
    this.map = new Map();
    this.list = [];
  }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(x, z, r, data = null) {
    const c = { x, z, r, data, active: true };
    this.list.push(c);
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell), j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(c);
    }
    return c;
  }
  query(x, z) {
    return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || [];
  }
  near(x, z, r) {
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell), j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.map.get(this.key(i, j));
      if (!arr) continue;
      for (const c of arr) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) return true;
    }
    return false;
  }
  // push a circle out of all colliders (in-place on pos {x,z})
  resolve(pos, radius) {
    const near = [];
    const r = radius + 4;
    const i0 = Math.floor((pos.x - r) / this.cell), i1 = Math.floor((pos.x + r) / this.cell);
    const j0 = Math.floor((pos.z - r) / this.cell), j1 = Math.floor((pos.z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const arr = this.map.get(this.key(i, j));
      if (arr) for (const c of arr) if (!near.includes(c)) near.push(c);
    }
    for (const c of near) {
      if (!c.active) continue;
      if (c.data && c.data.minY !== undefined && pos.y > c.data.minY) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), m = c.r + radius;
      if (d < m && d > 1e-5) {
        pos.x = c.x + (dx / d) * m;
        pos.z = c.z + (dz / d) * m;
      }
    }
  }
}

export class Platforms {
  constructor() { this.list = []; }
  add(x, z, r, top, data = {}) {
    const p = { x, z, r, top, ...data };
    this.list.push(p);
    return p;
  }
  // highest platform top under (x,z) that the feet are above (with tolerance)
  groundAt(x, z, feetY, tol = 0.45) {
    let best = -Infinity, bp = null;
    for (const p of this.list) {
      if (p.hidden) continue;
      const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d2 < p.r * p.r && feetY >= p.top - tol && p.top > best) { best = p.top; bp = p; }
    }
    return { y: best, platform: bp };
  }
  // block horizontal entry into platform side when below its top
  resolveSides(pos, radius) {
    for (const p of this.list) {
      if (p.hidden || p.noSides) continue;
      if (pos.y >= p.top - 0.45) continue;
      if (pos.y + 1.6 < p.top - (p.height ?? 1.2)) continue;
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const d = Math.hypot(dx, dz), m = p.r + radius;
      if (d < m && d > 1e-5) { pos.x = p.x + (dx / d) * m; pos.z = p.z + (dz / d) * m; }
    }
  }
}
