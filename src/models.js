import * as THREE from 'three';

const matCache = new Map();
export function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return matCache.get(key);
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

function eyes(parent, y, z, spread, r = 0.045) {
  const em = M('#1b1b24', { roughness: 0.2 });
  const hl = M('#ffffff', { emissive: 0xffffff, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const e = mesh(sph(r, 10, 8), em, s * spread, y, z, parent);
    e.castShadow = false;
    mesh(sph(r * 0.35, 6, 4), hl, s * spread + r * 0.3, y + r * 0.35, z + r * 0.7, parent).castShadow = false;
  }
  const blush = M('#ff9aa8', { transparent: true, opacity: 0.55 });
  for (const s of [-1, 1]) {
    const b = mesh(sph(r * 1.1, 8, 6), blush, s * (spread + r * 1.8), y - r * 1.6, z - r * 0.6, parent);
    b.scale.set(1, 0.55, 0.4); b.castShadow = false;
  }
}

// ------------------------------------------------- player
export function buildPlayer() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = {};

  const cloak = mesh(new THREE.CylinderGeometry(0.26, 0.5, 0.85, 16, 1), M('#3e74a8'), 0, 0.72, 0, body);
  mesh(new THREE.TorusGeometry(0.47, 0.04, 6, 20).rotateX(Math.PI / 2), M('#f2d08a'), 0, 0.31, 0, body);
  // legs
  parts.legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.34, 0);
    mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 8).translate(0, -0.15, 0), M('#3a3247'), 0, 0, 0, leg);
    mesh(sph(0.1, 10, 8).scale(1, 0.7, 1.4), M('#7a4e32'), 0, -0.3, 0.04, leg);
    body.add(leg);
    parts.legs.push(leg);
  }
  // arms
  parts.arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.33, 1.02, 0);
    mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8).translate(0, -0.2, 0), M('#3e74a8'), 0, 0, 0, arm);
    mesh(sph(0.075), M('#ffe0c4'), 0, -0.42, 0, arm);
    arm.rotation.z = s * 0.15;
    body.add(arm);
    parts.arms.push(arm);
  }
  // head
  const head = new THREE.Group();
  head.position.set(0, 1.38, 0);
  body.add(head);
  parts.head = head;
  mesh(sph(0.33, 24, 18), M('#ffe2c8', { roughness: 0.6 }), 0, 0, 0, head);
  const hair = mesh(new THREE.SphereGeometry(0.35, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), M('#5a3a2a'), 0, 0.02, -0.02, head);
  hair.rotation.x = -0.35;
  eyes(head, 0.0, 0.29, 0.11);
  // hat
  mesh(new THREE.CylinderGeometry(0.58, 0.6, 0.04, 28), M('#e9be62'), 0, 0.22, 0, head).rotation.x = -0.08;
  mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.26, 20), M('#e9be62'), 0, 0.35, -0.02, head);
  mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 20), M('#d9534f'), 0, 0.26, -0.02, head);
  const leaf = mesh(sph(0.07, 8, 6).scale(1.8, 0.4, 0.9), M('#7cc35a'), 0.22, 0.32, 0.12, head);
  leaf.rotation.z = 0.5;
  // scarf
  mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 20).rotateX(Math.PI / 2), M('#e8604c'), 0, 1.13, 0, body);
  const tail = new THREE.Group();
  tail.position.set(0.12, 1.12, -0.2);
  body.add(tail);
  const t1 = mesh(new THREE.BoxGeometry(0.12, 0.04, 0.35).translate(0, 0, -0.17), M('#e8604c'), 0, 0, 0, tail);
  const tail2 = new THREE.Group(); tail2.position.z = -0.33; tail.add(tail2);
  mesh(new THREE.BoxGeometry(0.11, 0.035, 0.3).translate(0, 0, -0.14), M('#e8604c'), 0, 0, 0, tail2);
  parts.scarf = [tail, tail2];
  // backpack
  mesh(new THREE.BoxGeometry(0.42, 0.45, 0.22), M('#9a6b43'), 0, 0.88, -0.32, body);
  mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 10).rotateZ(Math.PI / 2), M('#c9a46e'), 0, 1.14, -0.33, body);
  // lantern in right hand
  const lantern = new THREE.Group();
  lantern.position.set(0, -0.5, 0.06);
  parts.arms[0].add(lantern);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.03, 8), M('#4a3a2a'), 0, 0.09, 0, lantern);
  mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.03, 8), M('#4a3a2a'), 0, -0.1, 0, lantern);
  const lglass = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.17, 8), new THREE.MeshStandardMaterial({ color: '#ffe8a0', emissive: '#ffc85a', emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }), 0, 0, 0, lantern);
  lglass.castShadow = false;
  const lg = glowSprite('#ffcf70', 0.9, 0.5);
  lantern.add(lg);
  const light = new THREE.PointLight('#ffc36b', 0, 14, 1.6);
  light.castShadow = false;
  lantern.add(light);
  parts.lanternLight = light;
  parts.lanternGlow = lg;
  parts.lanternGlass = lglass;
  parts.body = body;
  root.userData.parts = parts;
  return root;
}

// ------------------------------------------------- NPCs
export function buildBear() {
  const g = new THREE.Group();
  const fur = M('#a8724a'), light = M('#e8c49a');
  const b = mesh(sph(0.85, 20, 16), fur, 0, 0.95, 0, g); b.scale.set(1, 1.05, 0.9);
  mesh(sph(0.55, 16, 12).scale(1, 1, 0.5), light, 0, 0.9, 0.55, g);
  const head = new THREE.Group(); head.position.set(0, 2.0, 0.1); g.add(head);
  mesh(sph(0.6, 20, 16), fur, 0, 0, 0, head);
  mesh(sph(0.26, 12, 10).scale(1, 0.8, 0.8), light, 0, -0.12, 0.5, head);
  mesh(sph(0.08, 8, 6), M('#2a1a14'), 0, -0.05, 0.71, head);
  for (const s of [-1, 1]) { mesh(sph(0.2, 10, 8), fur, s * 0.42, 0.45, -0.05, head); mesh(sph(0.11, 8, 6), light, s * 0.42, 0.45, 0.05, head); }
  eyes(head, 0.1, 0.52, 0.2, 0.06);
  mesh(new THREE.CylinderGeometry(0.75, 0.78, 0.05, 24), M('#e9c46a'), 0, 0.5, 0, head);
  mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.3, 18), M('#e9c46a'), 0, 0.65, 0, head);
  mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.08, 18), M('#5a8f4a'), 0, 0.55, 0, head);
  for (const s of [-1, 1]) mesh(sph(0.26, 10, 8), fur, s * 0.45, 0.25, 0.1, g);
  // crook
  const crook = new THREE.Group(); crook.position.set(0.85, 1.0, 0.25); g.add(crook);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), M('#7a5a3a'), 0, 0.3, 0, crook);
  mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12, Math.PI), M('#7a5a3a'), -0.18, 1.4, 0, crook);
  g.userData.head = head;
  return g;
}

export function buildTurtle() {
  const g = new THREE.Group();
  const skin = M('#9ccf8a'), shell = M('#5f8f6a');
  const sh = mesh(new THREE.SphereGeometry(1.1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 0.5, 0, g);
  sh.scale.set(1, 0.85, 1.15);
  // shell pattern
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 6), M('#86b07a'), Math.cos(a) * 0.62, 1.05, Math.sin(a) * 0.72, g);
    p.lookAt(0, 3, 0); p.rotateX(Math.PI / 2);
  }
  mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 6), M('#86b07a'), 0, 1.4, 0, g);
  mesh(new THREE.CylinderGeometry(1.12, 1.15, 0.16, 24).scale(1, 1, 1.15), M('#c9b88a'), 0, 0.5, 0, g);
  const head = new THREE.Group(); head.position.set(0, 0.85, 1.35); g.add(head);
  mesh(sph(0.42, 16, 12), skin, 0, 0, 0, head);
  eyes(head, 0.08, 0.36, 0.16, 0.055);
  // eyebrows (old)
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), M('#f4f4f0'), s * 0.17, 0.2, 0.37, head).rotation.z = s * -0.25;
  mesh(sph(0.16, 10, 8).scale(1, 1.4, 0.8), M('#f4f4f0'), 0, -0.3, 0.3, head);
  for (const [x, z] of [[-0.8, 0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]]) mesh(sph(0.28, 10, 8).scale(1, 0.7, 1.2), skin, x, 0.32, z, g);
  // little straw hat
  mesh(new THREE.ConeGeometry(0.5, 0.25, 18), M('#e3c27a'), 0, 0.42, -0.02, head);
  g.userData.head = head;
  return g;
}

export function buildOwl() {
  const g = new THREE.Group();
  // stump
  mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.2, 14), M('#7a5a3c'), 0, 0.6, 0, g);
  mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 14), M('#c9a477'), 0, 1.21, 0, g);
  const owl = new THREE.Group(); owl.position.y = 1.2; g.add(owl);
  const feather = M('#8a6a9a'), belly = M('#e8dcc8');
  mesh(sph(0.55, 18, 14).scale(1, 1.2, 0.95), feather, 0, 0.62, 0, owl);
  mesh(sph(0.38, 14, 10).scale(1, 1.2, 0.5), belly, 0, 0.5, 0.3, owl);
  const head = new THREE.Group(); head.position.set(0, 1.2, 0); owl.add(head);
  mesh(sph(0.48, 18, 14), feather, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    mesh(new THREE.CircleGeometry(0.2, 16), M('#f4ead6'), s * 0.19, 0.05, 0.45, head).rotation.y = s * 0.25;
    const tuft = mesh(new THREE.ConeGeometry(0.1, 0.3, 6), feather, s * 0.28, 0.45, 0, head); tuft.rotation.z = -s * 0.4;
  }
  eyes(head, 0.06, 0.47, 0.19, 0.075);
  mesh(new THREE.ConeGeometry(0.06, 0.14, 6).rotateX(Math.PI / 2 + 0.6), M('#f0b04a'), 0, -0.08, 0.5, head);
  for (const s of [-1, 1]) { const w = mesh(sph(0.3, 10, 8).scale(0.4, 1, 0.9), feather, s * 0.55, 0.6, -0.05, owl); w.rotation.z = s * 0.2; }
  // tiny scholar glasses + book
  mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), M('#c0504d'), 0.0, 0.08, 0.45, owl);
  g.userData.head = head;
  g.userData.bodyBob = owl;
  return g;
}

export function buildCat() {
  const g = new THREE.Group();
  const fur = M('#f0a860'), white = M('#fff6ec');
  mesh(sph(0.45, 16, 12).scale(1, 1.15, 0.95), fur, 0, 0.55, 0, g);
  mesh(sph(0.3, 12, 10).scale(1, 1.1, 0.6), white, 0, 0.5, 0.28, g);
  const head = new THREE.Group(); head.position.set(0, 1.25, 0.05); g.add(head);
  mesh(sph(0.42, 18, 14).scale(1.08, 0.95, 1), fur, 0, 0, 0, head);
  mesh(sph(0.2, 12, 8).scale(1.3, 0.8, 0.7), white, 0, -0.12, 0.3, head);
  mesh(sph(0.04, 6, 4), M('#e07a8a'), 0, -0.05, 0.43, head);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.15, 0.3, 4), fur, s * 0.26, 0.38, 0, head); ear.rotation.z = -s * 0.3;
    // whiskers
    for (const k of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.35, 3), M('#ffffff'), s * 0.32, -0.1 + k * 0.03, 0.3, head); w.rotation.z = Math.PI / 2 + k * 0.1; w.castShadow = false; }
  }
  eyes(head, 0.04, 0.37, 0.15, 0.06);
  // tail
  const tail = new THREE.Group(); tail.position.set(0, 0.35, -0.38); g.add(tail);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.3, -0.3), new THREE.Vector3(0.1, 0.8, -0.35), new THREE.Vector3(0.25, 1.0, -0.15)]);
  mesh(new THREE.TubeGeometry(curve, 16, 0.07, 8), fur, 0, 0, 0, tail);
  // traveller scarf + backpack
  mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 18).rotateX(Math.PI / 2), M('#5a9ad0'), 0, 0.95, 0, g);
  mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), M('#7a8a4a'), 0, 0.65, -0.38, g);
  mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.55, 10).rotateZ(Math.PI / 2), M('#c45a5a'), 0, 0.98, -0.4, g);
  for (const s of [-1, 1]) mesh(sph(0.12, 8, 6), white, s * 0.2, 0.1, 0.15, g);
  g.userData.head = head;
  g.userData.tail = tail;
  return g;
}

export function buildSheep() {
  const g = new THREE.Group();
  const wool = M('#fbf7f0', { roughness: 0.95 }), face = M('#3a3036');
  const body = new THREE.Group(); body.position.y = 0.75; g.add(body);
  const puffs = [[0, 0, 0, 0.55], [0.35, 0.1, 0.25, 0.35], [-0.35, 0.1, 0.25, 0.35], [0.3, 0.15, -0.3, 0.38], [-0.3, 0.15, -0.3, 0.38], [0, 0.35, 0, 0.4], [0, 0.1, 0.45, 0.33], [0, 0.1, -0.5, 0.35]];
  for (const [x, y, z, r] of puffs) mesh(sph(r, 12, 10), wool, x, y, z, body);
  const head = new THREE.Group(); head.position.set(0, 0.25, 0.7); body.add(head);
  mesh(sph(0.24, 12, 10).scale(0.9, 1, 1.1), face, 0, 0, 0.05, head);
  mesh(sph(0.2, 10, 8), wool, 0, 0.18, -0.05, head);
  for (const s of [-1, 1]) { const e = mesh(sph(0.09, 8, 6).scale(1.5, 0.5, 0.8), face, s * 0.25, 0.02, -0.02, head); e.rotation.z = s * 0.4; }
  eyes(head, 0.04, 0.24, 0.09, 0.035);
  const legs = [];
  for (const [x, z] of [[-0.25, 0.3], [0.25, 0.3], [-0.25, -0.3], [0.25, -0.3]]) {
    const l = new THREE.Group(); l.position.set(x, 0.42, z); g.add(l);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6).translate(0, -0.21, 0), face, 0, 0, 0, l);
    legs.push(l);
  }
  g.userData.head = head; g.userData.legs = legs; g.userData.body = body;
  return g;
}

export function buildLumi() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(sph(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#ffe9a6', emissiveIntensity: 3 }));
  g.add(core);
  g.add(glowSprite('#ffe7a0', 1.6, 0.85));
  g.add(glowSprite('#9fdcff', 3.2, 0.25));
  const wingMat = new THREE.MeshBasicMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12).scale(1.4, 0.8, 1), wingMat);
    w.position.set(s * 0.2, 0.05, -0.02);
    w.rotation.y = s * 0.4;
    g.add(w); wings.push(w);
  }
  g.userData.wings = wings;
  return g;
}

export function buildBench() {
  const g = new THREE.Group();
  const wood = M('#a8774a'), dark = M('#5a4030');
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(2.2, 0.08, 0.16), wood, 0, 0.5, -0.18 + i * 0.18, g);
  for (let i = 0; i < 2; i++) mesh(new THREE.BoxGeometry(2.2, 0.14, 0.06), wood, 0, 0.8 + i * 0.2, -0.32, g).rotation.x = -0.15;
  for (const s of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.08, 0.5, 0.5), dark, s * 0.95, 0.25, -0.05, g);
    mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), dark, s * 0.95, 0.75, -0.33, g);
  }
  return g;
}

export function buildLampPost() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 6), M('#4a3a30'), 0, 1.1, 0, g);
  mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), M('#4a3a30'), 0.2, 2.15, 0, g);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff0c0', emissive: '#ffc060', emissiveIntensity: 0.2 });
  const lamp = mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMat, 0.42, 1.92, 0, g);
  lamp.castShadow = false;
  mesh(new THREE.ConeGeometry(0.22, 0.16, 8), M('#4a3a30'), 0.42, 2.12, 0, g);
  const glow = glowSprite('#ffcf80', 1.8, 0);
  glow.position.set(0.42, 1.92, 0);
  g.add(glow);
  g.userData = { lampMat, glow };
  return g;
}

export function buildFence(points, close = false) {
  const g = new THREE.Group();
  const wood = M('#b98a5a');
  const pts = close ? [...points, points[0]] : points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 2));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const p = a.clone().lerp(b, k / n);
      mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), wood, p.x, p.y + 0.5, p.z, g);
    }
    for (const h of [0.45, 0.8]) {
      const rail = mesh(new THREE.BoxGeometry(0.06, 0.08, len), wood, (a.x + b.x) / 2, (a.y + b.y) / 2 + h, (a.z + b.z) / 2, g);
      rail.lookAt(b.x, (a.y + b.y) / 2 + h + (b.y - a.y) / 2, b.z);
    }
  }
  return g;
}
