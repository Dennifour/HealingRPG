import * as THREE from 'three';
import { ZONES, LAKE, PLATEAU, POND } from './config.js';
import { FX } from './materials.js';
import { StarSeed } from './effects.js';
import { buildBear, buildTurtle, buildOwl, buildCat, buildSheep, buildLumi, buildFence, glowSprite, M } from './models.js';
import { mulberry32 } from './noise.js';

const rnd = mulberry32(2024);
const ZONE_KEYS = ['center', 'meadow', 'lake', 'forest', 'highlands'];
const REGION_KEYS = ['meadow', 'lake', 'forest', 'highlands'];
const LUMI = '루미';

// ------------------------------------------------------------------ layout helpers
function lerp2(a, b, t) { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }

export class Story {
  constructor(game) {
    this.g = game;
    const { world } = game;
    this.world = world;
    this.T = world.terrain;
    this.scene = game.scene;
    this.state = {
      found: [], offered: 0,
      quests: { meadow: 'todo', lake: 'todo', forest: 'todo', highlands: 'todo' },
      sheepPen: 0, lotus: [false, false, false, false],
      metTree: false, visited: [], ended: false, playTime: 0,
    };
    this.seeds = [];
    this.interactables = [];
    this.npcs = [];
    this.zoneRestore = { center: 0.18, meadow: 0, lake: 0, forest: 0, highlands: 0 };
    this.currentZone = null;
    this.hintTimer = 0;
    this.guide = null;
    this.timers = [];
    this.layout();
  }

  // Called before vegetation is generated so we can keep areas clear
  layout() {
    const W = this.world, T = this.T;
    // ---- meadow: bear + pen
    this.penCenter = { x: 26, z: 120 };
    this.bearPos = W.dryNear(14, 114);
    // ---- lake
    this.turtlePos = W.dryNear(86, -14);
    // stepping stones from west shore to islet
    const start = { x: 90, z: -6 }, end = { x: LAKE.islet.x - 6, z: LAKE.islet.z };
    this.stones = [];
    const N = 15;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = lerp2(start, end, t);
      p.z += Math.sin(t * Math.PI * 2) * 7;
      if (T.heightAt(p.x, p.z) > -0.4) continue;
      this.stones.push(p);
    }
    // ---- forest: owl clearing
    this.owlPos = { x: ZONES.forest.x, z: ZONES.forest.z };
    // ---- highlands: cat + floating stairs
    this.catPos = W.dryNear(18, -80);
    this.bellPos = { x: PLATEAU.peak.x, z: PLATEAU.peak.z };

    W.reserveAreas([
      [this.penCenter.x, this.penCenter.z, 9], [this.bearPos.x, this.bearPos.z, 4],
      [this.turtlePos.x, this.turtlePos.z, 5],
      [this.owlPos.x, this.owlPos.z, 16],
      [this.catPos.x, this.catPos.z, 5],
      [this.bellPos.x, this.bellPos.z, 6],
      [0, 0, 16],
      [4, 30, 4],
      [-58, 160, 6], [-110, 48, 7],
    ]);
  }

  build() {
    this.buildNPCs();
    this.buildMeadow();
    this.buildLake();
    this.buildForest();
    this.buildHighlands();
    this.buildSeeds();
    this.lumi = buildLumi();
    this.scene.add(this.lumi);
    this.lumiPos = new THREE.Vector3();
  }

  addInteract(o) { this.interactables.push(o); return o; }

  placeNPC(obj, p, faceTo = { x: 0, z: 0 }) {
    const y = this.T.heightAt(p.x, p.z);
    obj.position.set(p.x, y, p.z);
    obj.rotation.y = Math.atan2(faceTo.x - p.x, faceTo.z - p.z);
    this.scene.add(obj);
    this.npcs.push(obj);
    return obj;
  }

  buildNPCs() {
    const W = this.world;
    this.bear = this.placeNPC(buildBear(), this.bearPos, { x: 0, z: 60 });
    W.colliders.add(this.bearPos.x, this.bearPos.z, 1.0);
    this.turtle = this.placeNPC(buildTurtle(), this.turtlePos, { x: 60, z: -10 });
    W.colliders.add(this.turtlePos.x, this.turtlePos.z, 1.3);
    this.owl = this.placeNPC(buildOwl(), this.owlPos, { x: -100, z: 0 });
    W.colliders.add(this.owlPos.x, this.owlPos.z, 1.0);
    this.cat = this.placeNPC(buildCat(), this.catPos, { x: 0, z: -40 });
    W.colliders.add(this.catPos.x, this.catPos.z, 0.6);

    this.addInteract({ x: 0, z: 2, r: 7.5, label: '하늘나무', action: () => this.talkTree() });
    this.addInteract({ obj: this.bear, x: this.bearPos.x, z: this.bearPos.z, r: 3.6, label: '보리와 대화하기', action: () => this.talkBear() });
    this.addInteract({ obj: this.turtle, x: this.turtlePos.x, z: this.turtlePos.z, r: 3.8, label: '거북 할아버지와 대화하기', action: () => this.talkTurtle() });
    this.addInteract({ obj: this.owl, x: this.owlPos.x, z: this.owlPos.z, r: 3.6, label: '부엉이 솔과 대화하기', action: () => this.talkOwl() });
    this.addInteract({ obj: this.cat, x: this.catPos.x, z: this.catPos.z, r: 3.2, label: '고양이 나비와 대화하기', action: () => this.talkCat() });
    for (const b of W.benches) {
      this.addInteract({ x: b.x, z: b.z, r: 2.4, label: '벤치에 앉아 쉬기', action: () => this.sit(b) });
    }
    // markers above NPCs
    this.markers = {};
    for (const [k, npc] of [['meadow', this.bear], ['lake', this.turtle], ['forest', this.owl], ['highlands', this.cat]]) {
      const s = glowSprite('#ffe27a', 1.4, 0.9);
      s.position.set(0, k === 'forest' ? 3.4 : k === 'lake' ? 2.6 : k === 'meadow' ? 3.5 : 2.4, 0);
      const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
      mark.position.copy(s.position);
      npc.add(s, mark);
      this.markers[k] = { s, mark };
    }
  }

  // ------------------------------------------------------------- meadow: sheep
  buildMeadow() {
    const T = this.T, W = this.world;
    const c = this.penCenter;
    const hw = 5.5, hd = 4.5;
    const corner = (x, z) => new THREE.Vector3(c.x + x, T.heightAt(c.x + x, c.z + z), c.z + z);
    // opening on the west side (towards the bear)
    const pts = [corner(-hw, -1.6), corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd), corner(-hw, 1.6)];
    this.scene.add(buildFence(pts));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.ceil(a.distanceTo(b) / 0.8);
      for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); W.colliders.add(p.x, p.z, 0.25); }
    }
    const homes = [{ x: -48, z: 150 }, { x: 52, z: 168 }, { x: -18, z: 186 }, { x: 70, z: 112 }];
    this.sheep = homes.map((h) => {
      const d = W.dryNear(h.x, h.z, 1);
      const s = buildSheep();
      s.position.set(d.x, d.y, d.z);
      this.scene.add(s);
      return { obj: s, home: new THREE.Vector3(d.x, d.y, d.z), state: 'lost', t: rnd() * 10, target: new THREE.Vector3(d.x, 0, d.z), baa: 2 + rnd() * 4, phase: 0 };
    });
  }

  updateSheep(dt) {
    const P = this.g.player.pos;
    const followers = this.sheep.filter((s) => s.state === 'follow');
    const active = this.state.quests.meadow === 'active';
    for (const s of this.sheep) {
      s.t += dt;
      const o = s.obj;
      let target = null, speed = 1.2;
      if (s.state === 'lost') {
        if (s.t > 4) { s.t = 0; s.target.set(s.home.x + (rnd() - 0.5) * 8, 0, s.home.z + (rnd() - 0.5) * 8); }
        target = s.target;
        const d = Math.hypot(P.x - o.position.x, P.z - o.position.z);
        if (d < 4.5 && active) {
          s.state = 'follow';
          this.g.audio.baa();
          this.g.world.ambient.burst.emit(o.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ffffff', 16, 2, 1);
          this.g.ui.toast('양이 졸졸 따라오기 시작했어요 🐑');
        } else if (d < 14) {
          s.baa -= dt;
          if (s.baa < 0) { s.baa = 4 + rnd() * 5; this.g.audio.baa(); if (!active && this.state.quests.meadow === 'todo' && !this.sheepHinted) (this.sheepHinted = true) && this.g.ui.toast('길 잃은 양이 누군가를 기다리는 것 같아요…'); }
        }
      } else if (s.state === 'follow') {
        const idx = followers.indexOf(s);
        const lead = idx <= 0 ? P : followers[idx - 1].obj.position;
        const dx = o.position.x - lead.x, dz = o.position.z - lead.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.4) { target = new THREE.Vector3(lead.x + (dx / d) * 2.2, 0, lead.z + (dz / d) * 2.2); speed = Math.min(11, 2 + d * 1.6); }
        const dp = Math.hypot(o.position.x - this.penCenter.x, o.position.z - this.penCenter.z);
        if (dp < 7) {
          s.state = 'pen';
          s.target.set(this.penCenter.x + (rnd() - 0.5) * 7, 0, this.penCenter.z + (rnd() - 0.5) * 6);
          this.state.sheepPen++;
          this.g.audio.baa();
          this.g.audio.success();
          this.g.ui.toast(`양을 울타리로 데려왔어요 (${this.state.sheepPen}/4)`);
          if (this.state.sheepPen >= 4) this.finishMeadow();
          this.g.save();
        }
      } else if (s.state === 'pen') {
        if (s.t > 5) { s.t = 0; s.target.set(this.penCenter.x + (rnd() - 0.5) * 8, 0, this.penCenter.z + (rnd() - 0.5) * 6); }
        target = s.target; speed = 1.6;
        if (Math.hypot(o.position.x - this.penCenter.x, o.position.z - this.penCenter.z) > 7) speed = 4;
      }
      let moving = false;
      if (target) {
        const dx = target.x - o.position.x, dz = target.z - o.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const step = Math.min(d, speed * dt);
          const nx = o.position.x + (dx / d) * step, nz = o.position.z + (dz / d) * step;
          if (this.T.heightAt(nx, nz) > -0.3) { o.position.x = nx; o.position.z = nz; moving = true; }
          const ang = Math.atan2(dx, dz);
          let da = ang - o.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
          o.rotation.y += da * Math.min(1, dt * 6);
        }
        if (moving) s.phase += dt * speed * 3;
      }
      o.position.y = Math.max(this.T.heightAt(o.position.x, o.position.z), -0.3);
      const u = o.userData;
      u.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(s.phase + (i % 2) * Math.PI) * 0.6 : 0; });
      u.body.position.y = 0.75 + (moving ? Math.abs(Math.sin(s.phase)) * 0.06 : Math.sin(performance.now() / 600 + s.home.x) * 0.02);
      u.head.rotation.x = moving ? 0 : Math.sin(performance.now() / 900 + s.home.z) * 0.25 + 0.15;
    }
  }

  finishMeadow() {
    this.state.quests.meadow = 'done';
    this.unlockSeed('m0');
    this.timers.push({ t: 1.2, fn: () => this.g.ui.say('보리', ['우와, 다 모였어! 정말 고마워.', '양들 털 속에 이게 반짝이고 있더라고. 별씨앗이라는 거지? 네가 가져가렴.', '울타리 옆에 놓아 두었어!']) });
  }

  // ------------------------------------------------------------- lake: lotus lanterns
  buildLake() {
    const W = this.world;
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#9b9488', flatShading: true, roughness: 0.9 });
    const stoneGeo = new THREE.CylinderGeometry(1.25, 1.45, 1.4, 9);
    this.lotusLanterns = [];
    const lotusIdx = [2, 5, 8, Math.max(9, this.stones.length - 2)].map((i) => Math.min(i, this.stones.length - 1));
    this.stones.forEach((p, i) => {
      const m = new THREE.Mesh(stoneGeo, stoneMat);
      m.position.set(p.x, -0.15, p.z);
      m.rotation.y = rnd() * 3;
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      const plat = W.platforms.add(p.x, p.z, 1.35, 0.55, { height: 2 });
      const li = lotusIdx.indexOf(i);
      if (li >= 0) {
        const lot = this.makeLotus(0.55);
        lot.position.set(p.x, 0.55, p.z);
        this.scene.add(lot);
        const L = { obj: lot, lit: false, i: li };
        this.lotusLanterns.push(L);
        plat.onLand = () => this.lightLotus(L);
      }
    });
    // islet big lotus bud with the seed
    const ip = LAKE.islet;
    this.bigLotus = this.makeLotus(1.6);
    this.bigLotus.position.set(ip.x, this.T.heightAt(ip.x, ip.z) + 0.05, ip.z);
    this.scene.add(this.bigLotus);
    this.addInteract({ x: ip.x, z: ip.z, r: 4, label: '커다란 연꽃 봉오리', action: () => {
      if (this.state.quests.lake !== 'done') this.g.ui.say(LUMI, ['꽃봉오리가 굳게 닫혀 있어요.', '호수의 연꽃 등불 네 개를 모두 밝히면 열릴 것 같아요!']);
    }, cond: () => this.state.quests.lake !== 'done' });
  }

  makeLotus(scale) {
    const g = new THREE.Group();
    const petalMat = new THREE.MeshStandardMaterial({ color: '#f7d6e6', emissive: '#ff9ccc', emissiveIntensity: 0, roughness: 0.5 });
    const petals = [];
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 6 : 8;
      for (let i = 0; i < n; i++) {
        const piv = new THREE.Group();
        piv.rotation.y = (i / n) * Math.PI * 2 + ring * 0.3;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6).scale(0.55, 0.2, 1).translate(0, 0, 0.22), petalMat);
        p.castShadow = true;
        const tilt = new THREE.Group();
        tilt.add(p);
        tilt.rotation.x = -1.2 + ring * 0.2;
        piv.add(tilt);
        g.add(piv);
        petals.push({ tilt, ring });
      }
    }
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14).rotateX(-Math.PI / 2), M('#5aa35a'));
    pad.position.y = 0.01;
    g.add(pad);
    const glow = glowSprite('#ffc6e6', 2.5, 0);
    glow.position.y = 0.25;
    g.add(glow);
    g.scale.setScalar(scale);
    g.userData = { petals, petalMat, glow, open: 0, target: 0 };
    return g;
  }

  lightLotus(L) {
    if (L.lit) return;
    if (this.state.quests.lake !== 'active') {
      if (this.state.quests.lake === 'todo') this.g.ui.toast('연꽃이 무언가를 기다리는 것 같아요. 호숫가의 거북 할아버지에게 가 보세요.');
      return;
    }
    L.lit = true;
    this.state.lotus[L.i] = true;
    L.obj.userData.target = 1;
    this.g.audio.note(74 + L.i * 2);
    this.g.world.ambient.burst.emit(L.obj.position.clone().add(new THREE.Vector3(0, 0.6, 0)), '#ffb6dc', 30, 3, 1.5);
    const n = this.state.lotus.filter(Boolean).length;
    this.g.ui.toast(`연꽃 등불이 밝혀졌어요 (${n}/4)`);
    if (n >= 4) {
      this.state.quests.lake = 'done';
      this.bigLotus.userData.target = 1;
      this.unlockSeed('l0');
      this.g.audio.success();
      this.timers.push({ t: 1.0, fn: () => this.g.ui.say(LUMI, ['와아… 섬 한가운데의 커다란 연꽃이 피어났어요!', '연꽃 안에서 별씨앗이 빛나고 있어요!']) });
    }
    this.g.save();
  }

  updateLotus(dt, elapsed, night) {
    const all = [...this.lotusLanterns.map((l) => l.obj), this.bigLotus];
    for (const o of all) {
      const u = o.userData;
      u.open += (u.target - u.open) * Math.min(1, dt * 1.5);
      for (const p of u.petals) p.tilt.rotation.x = -1.25 + p.ring * 0.25 + u.open * (0.9 - p.ring * 0.35);
      u.petalMat.emissiveIntensity = u.open * (0.5 + night * 1.5);
      u.glow.material.opacity = u.open * (0.35 + night * 0.6) * (0.85 + 0.15 * Math.sin(elapsed * 2 + o.position.x));
    }
  }

  // ------------------------------------------------------------- forest: melody mushrooms
  buildForest() {
    const W = this.world, T = this.T;
    this.melody = [0, 2, 4, 3, 1, 2];
    this.notes = [62, 66, 69, 71, 74];
    const colors = ['#ff8fa3', '#ffc46b', '#8fe388', '#7fc8ff', '#c39bff'];
    this.mushrooms = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const x = this.owlPos.x + Math.cos(a) * 8.5, z = this.owlPos.z + Math.sin(a) * 8.5;
      const y = T.heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 10).translate(0, 0.7, 0), M('#f2ead8'));
      stem.castShadow = true;
      const capMat = new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.15, roughness: 0.5 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 1.35, 0), capMat);
      cap.castShadow = true;
      // spots
      for (let k = 0; k < 6; k++) {
        const sa = rnd() * Math.PI * 2, sr = 0.4 + rnd() * 0.8;
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4).scale(1, 0.3, 1), M('#fffaf0'));
        sp.position.set(Math.cos(sa) * sr, 1.35 + Math.sqrt(Math.max(0, 1 - (sr / 1.5) ** 2)) * 0.82, Math.sin(sa) * sr);
        g.add(sp);
      }
      const glow = glowSprite(colors[i], 4, 0);
      glow.position.y = 2;
      g.add(stem, cap, glow);
      this.scene.add(g);
      const m = { obj: g, capMat, glow, flash: 0, i, cap };
      this.mushrooms.push(m);
      W.platforms.add(x, z, 1.45, y + 2.1, { bounce: 13, height: 2.2, onBounce: () => this.hitMushroom(m) });
    }
    this.melodyProgress = 0;
    this.demo = null;
    this.lastHit = { i: -1, t: 0 };
  }

  playDemo() {
    this.demo = { i: 0, t: 0.8 };
  }

  hitMushroom(m) {
    this.g.audio.note(this.notes[m.i]);
    m.flash = 1;
    m.cap.scale.set(1.15, 0.8, 1.15);
    if (this.state.quests.forest !== 'active' || this.demo) return;
    const now = performance.now() / 1000;
    const want = this.melody[this.melodyProgress];
    if (m.i === this.lastHit.i && now - this.lastHit.t < 2.5 && want !== m.i) { this.lastHit.t = now; return; }
    this.lastHit = { i: m.i, t: now };
    if (m.i === want) {
      this.melodyProgress++;
      this.g.ui.toast(`♪ ${'●'.repeat(this.melodyProgress)}${'○'.repeat(this.melody.length - this.melodyProgress)}`, 1.6);
      if (this.melodyProgress >= this.melody.length) {
        this.state.quests.forest = 'done';
        this.unlockSeed('f0');
        this.g.audio.success();
        this.mushrooms.forEach((mm) => (mm.flash = 1.5));
        this.timers.push({ t: 1.4, fn: () => this.g.ui.say('솔', ['후우… 아름다운 노래였어.', '숲이 자기 노래를 기억해 냈구나. 저 그루터기 위를 보렴. 숲이 주는 선물이란다.']) });
        this.g.save();
      }
    } else {
      this.melodyProgress = m.i === this.melody[0] ? 1 : 0;
      this.g.audio.wrong();
      this.g.ui.toast(this.melodyProgress ? `♪ ${'●'.repeat(1)}${'○'.repeat(this.melody.length - 1)}` : '음… 가락이 조금 달라요. 처음부터 다시!', 1.8);
    }
  }

  updateMushrooms(dt, night) {
    if (this.demo) {
      this.demo.t -= dt;
      if (this.demo.t <= 0) {
        const idx = this.melody[this.demo.i];
        const m = this.mushrooms[idx];
        this.g.audio.note(this.notes[idx]);
        m.flash = 1.2;
        this.demo.i++;
        this.demo.t = 0.75;
        if (this.demo.i >= this.melody.length) { this.demo = null; this.melodyProgress = 0; }
      }
    }
    for (const m of this.mushrooms) {
      m.flash = Math.max(0, m.flash - dt * 1.2);
      m.capMat.emissiveIntensity = 0.12 + night * 0.5 + m.flash * 1.6;
      m.glow.material.opacity = m.flash * 0.8 + night * 0.15;
      m.cap.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));
    }
  }

  // ------------------------------------------------------------- highlands: floating stairs + bell
  buildHighlands() {
    const W = this.world, T = this.T;
    const startA = Math.atan2(this.catPos.z - PLATEAU.z, this.catPos.x - PLATEAU.x) + 0.12;
    const baseH = T.heightAt(PLATEAU.x + Math.cos(startA) * 63, PLATEAU.z + Math.sin(startA) * 63);
    // top height along the end angle
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#b3aa9c', flatShading: true, roughness: 0.9 });
    const mossMat = new THREE.MeshStandardMaterial({ color: '#86b05a', flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#7fd0ff', emissiveIntensity: 1.2, flatShading: true });
    this.floaters = [];
    let h = baseH + 1.3, i = 0;
    let a = startA;
    let topH = 0;
    while (i < 30) {
      const t = Math.min(1, i / 14);
      const r = 63 - t * 9;
      const x = PLATEAU.x + Math.cos(a) * r, z = PLATEAU.z + Math.sin(a) * r;
      const edgeX = PLATEAU.x + Math.cos(a) * (PLATEAU.r - 8), edgeZ = PLATEAU.z + Math.sin(a) * (PLATEAU.r - 8);
      topH = T.heightAt(edgeX, edgeZ);
      const g = new THREE.Group();
      g.position.set(x, h, z);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.scale.set(1.5, 0.6, 1.5);
      rock.position.y = -0.45;
      rock.rotation.y = rnd() * 3;
      rock.castShadow = rock.receiveShadow = true;
      const moss = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.12, 8), mossMat);
      moss.receiveShadow = true;
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), crystalMat);
      cr.scale.set(0.7, 1.6, 0.7);
      cr.position.y = -1.2;
      g.add(rock, moss, cr);
      this.scene.add(g);
      const plat = W.platforms.add(x, z, 1.35, h + 0.06, { height: 1.2 });
      this.floaters.push({ g, plat, base: h, ph: rnd() * 6 });
      i++;
      if (h >= topH - 0.3) break;
      h = Math.min(h + 1.75, topH + 0.2);
      a += 0.085;
    }
    // landing ledge into the plateau
    const la = a + 0.06;
    const lx = PLATEAU.x + Math.cos(la) * 50, lz = PLATEAU.z + Math.sin(la) * 50;
    const ledgeTop = Math.max(topH, T.heightAt(lx, lz)) + 0.1;
    const ledge = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.4, 1.2, 10), rockMat);
    ledge.position.set(lx, ledgeTop - 0.6, lz);
    ledge.castShadow = ledge.receiveShadow = true;
    const ledgeMoss = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.2, 0.12, 10), mossMat);
    ledgeMoss.position.set(lx, ledgeTop, lz);
    this.scene.add(ledge, ledgeMoss);
    W.platforms.add(lx, lz, 3.2, ledgeTop + 0.06, { height: 1.2, noSides: true });

    // wind bell at the peak
    const bx = this.bellPos.x, bz = this.bellPos.z, by = T.heightAt(bx, bz);
    const frame = new THREE.Group();
    frame.position.set(bx, by - 0.1, bz);
    const wood = M('#8a5a3a');
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.4, 8).translate(0, 1.7, 0), wood); post.position.x = s * 1.3; post.castShadow = true; frame.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.35), wood); beam.position.y = 3.4; beam.castShadow = true; frame.add(beam);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.9, 4), M('#c0504d')); roof.position.y = 4.0; roof.rotation.y = Math.PI / 4; roof.castShadow = true; frame.add(roof);
    this.bell = new THREE.Group(); this.bell.position.y = 3.25; frame.add(this.bell);
    const bellMat = new THREE.MeshStandardMaterial({ color: '#e6c36a', metalness: 0.8, roughness: 0.3, emissive: '#ffcf6a', emissiveIntensity: 0 });
    const bellMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 0.9, 16, 1, true).translate(0, -0.55, 0), bellMat);
    bellMesh.material.side = THREE.DoubleSide;
    bellMesh.castShadow = true;
    this.bell.add(bellMesh);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.02).translate(0, -0.55, 0), M('#7fc8ff'));
    ribbon.position.y = -1.0;
    this.bell.add(ribbon);
    this.bellMat = bellMat;
    this.bellSwing = 0;
    this.scene.add(frame);
    W.colliders.add(bx - 1.3, bz, 0.25); W.colliders.add(bx + 1.3, bz, 0.25);
    this.addInteract({ x: bx, z: bz + 0.2, r: 3.2, label: '바람의 풍경 울리기', action: () => this.ringBell() });
  }

  ringBell() {
    this.bellSwing = 1;
    this.g.audio.chime();
    if (this.state.quests.highlands === 'done') return;
    if (this.state.quests.highlands === 'todo') this.state.quests.highlands = 'active';
    this.state.quests.highlands = 'done';
    this.unlockSeed('h0');
    this.g.save();
    const P = this.g.player;
    const pos = new THREE.Vector3(this.bellPos.x + 40, 70, this.bellPos.z + 70);
    P.cinematic = { pos, look: new THREE.Vector3(0, 10, 0), speed: 0.6 };
    P.frozen = true;
    this.timers.push({ t: 1.0, fn: () => this.g.ui.say(LUMI, ['맑은 소리가 온 섬에 울려 퍼져요…', '저기 보세요, 섬 전체가 한눈에 보여요. 하늘나무가 우리를 기다리고 있어요.', '풍경 아래에 별씨앗이 내려앉았어요!'], () => { P.cinematic = null; P.frozen = false; }) });
  }

  updateHighlands(dt, elapsed) {
    for (const f of this.floaters) {
      const off = Math.sin(elapsed * 0.8 + f.ph) * 0.12;
      f.g.position.y = f.base + off;
      f.plat.top = f.base + off + 0.06;
    }
    this.bellSwing = Math.max(0, this.bellSwing - dt * 0.35);
    this.bell.rotation.z = Math.sin(elapsed * 6) * 0.35 * this.bellSwing;
    this.bellMat.emissiveIntensity = this.bellSwing * 1.5 + (this.state.quests.highlands === 'done' ? 0.15 : 0);
  }

  // ------------------------------------------------------------- seeds
  buildSeeds() {
    const W = this.world, T = this.T;
    // rock stairs for two hidden spots
    const stairs = (x, z, n, step) => {
      const g = T.heightAt(x, z);
      let top = g;
      for (let i = 0; i < n; i++) {
        const a = i * 1.1;
        const px = x + Math.cos(a) * (n - 1 - i) * 1.9, pz = z + Math.sin(a) * (n - 1 - i) * 1.9;
        top = T.heightAt(px, pz) + step * (i + 1);
        top = g + step * (i + 1);
        W.rockPillar(px, pz, top, i === n - 1 ? 1.6 : 1.2);
      }
      return { x, z, y: top + 0.06 };
    };
    const mStairs = stairs(-58, 160, 4, 1.6);
    const fStairs = stairs(-110, 48, 4, 1.7);

    const dry = (x, z) => { const d = W.dryNear(x, z, 0.8); return { x: d.x, z: d.z, y: d.y }; };
    const pondSpot = dry(POND.x - 12, POND.z + 8);
    const ip = LAKE.islet;
    const owlTop = T.heightAt(this.owlPos.x, this.owlPos.z) + 3.6;
    const defs = [
      // meadow
      { id: 'm0', zone: 'meadow', quest: true, ...dry(this.penCenter.x - 8, this.penCenter.z - 6) },
      { id: 'm1', zone: 'meadow', ...mStairs },
      { id: 'm2', zone: 'meadow', ...dry(62, 186) },
      // lake
      { id: 'l0', zone: 'lake', quest: true, x: ip.x, z: ip.z, y: T.heightAt(ip.x, ip.z) + 1.2 },
      { id: 'l1', zone: 'lake', ...dry(186, -22) },
      { id: 'l2', zone: 'lake', ...dry(140, 44) },
      // forest
      { id: 'f0', zone: 'forest', quest: true, x: this.owlPos.x, z: this.owlPos.z + 0.01, y: owlTop },
      { id: 'f1', zone: 'forest', ...fStairs },
      { id: 'f2', zone: 'forest', ...dry(-172, -36) },
      // highlands
      { id: 'h0', zone: 'highlands', quest: true, x: this.bellPos.x, z: this.bellPos.z + 2.5, y: T.heightAt(this.bellPos.x, this.bellPos.z + 2.5) },
      { id: 'h1', zone: 'highlands', ...pondSpot },
      { id: 'h2', zone: 'highlands', ...dry(-24, -152) },
    ];
    for (const d of defs) {
      const y = (d.y ?? T.heightAt(d.x, d.z)) + 1.1;
      const s = new StarSeed(this.scene, d.x, y, d.z, { id: d.id, zone: d.zone });
      s.quest = !!d.quest;
      s.locked = !!d.quest;
      s.setActive(!s.locked);
      this.seeds.push(s);
    }
  }

  unlockSeed(id) {
    const s = this.seeds.find((x) => x.id === id);
    if (!s || this.state.found.includes(id)) return;
    s.locked = false;
    s.setActive(true);
    s.group.scale.setScalar(0.01);
    s.appear = 0;
    this.g.world.ambient.burst.emit(s.base, '#ffe28a', 60, 5, 2);
  }

  collectSeed(s) {
    s.collected = true;
    this.state.found.push(s.id);
    this.g.audio.pickup();
    this.g.world.ambient.burst.emit(s.group.position, '#ffe28a', 70, 6, 2);
    const n = this.state.found.length;
    this.g.ui.toast(`<b>★ 별씨앗을 찾았어요!</b> (${n}/12)`);
    this.refreshZoneTargets();
    const z = s.zone;
    const zoneSeeds = this.seeds.filter((x) => x.zone === z);
    if (zoneSeeds.every((x) => this.state.found.includes(x.id))) {
      this.timers.push({ t: 1.2, fn: () => {
        this.g.ui.zoneTitle(ZONES[z].name, '모든 별씨앗을 찾았어요 · 땅에 색이 돌아왔습니다');
        this.g.audio.success();
      } });
    } else if (n === 1) {
      this.timers.push({ t: 1.0, fn: () => this.g.ui.say(LUMI, ['첫 번째 별씨앗이에요! 따뜻하죠?', '씨앗을 모으면 언제든 하늘나무에게 가져가 바칠 수 있어요.', '길을 잃으면 Q를 눌러 저를 불러 주세요. 가까운 빛이 있는 쪽을 알려 드릴게요!']) });
    }
    this.g.save();
  }

  refreshZoneTargets() {
    for (const z of REGION_KEYS) {
      const done = this.state.quests[z] === 'done' ? 1 : 0;
      const hidden = this.seeds.filter((s) => s.zone === z && !s.quest && this.state.found.includes(s.id)).length;
      this.zoneRestore[z] = Math.min(1, done * 0.5 + hidden * 0.25);
    }
    this.zoneRestore.center = 0.18 + 0.82 * (this.state.offered / 12);
  }

  // ------------------------------------------------------------- dialogues
  talkTree() {
    const S = this.state, ui = this.g.ui;
    const carry = S.found.length - S.offered;
    if (!S.metTree) {
      S.metTree = true;
      ui.say('하늘나무', [
        '…작은 여행자여, 와 주었군요.',
        '오래전, 거센 폭풍이 불던 밤에 제 품의 별씨앗 열두 개가 섬 곳곳으로 흩어지고 말았어요.',
        '그 뒤로 섬은 조금씩 빛과 색을 잃어 가고 있답니다.',
        '초원, 호수, 숲, 그리고 구름 고원… 네 땅의 친구들이 씨앗을 지키고 있을 거예요.',
        '서두르지 않아도 괜찮아요. 천천히 걸으며, 섬의 숨결을 느껴 주세요.',
      ], () => {
        ui.say(LUMI, ['저도 함께 갈게요! 네 갈래 길이 각 땅으로 이어져 있어요.', '남쪽은 초원, 동쪽은 호수, 서쪽은 숲, 북쪽은 구름 고원이에요.']);
        this.g.save();
      });
      return;
    }
    if (carry > 0) {
      const before = S.offered;
      S.offered = S.found.length;
      this.g.tree.setProgress(S.offered);
      this.g.audio.offer();
      this.g.world.ambient.burst.emit(new THREE.Vector3(0, this.g.tree.base.y + 4, 3), '#ffd1e6', 90, 7, 4);
      this.refreshZoneTargets();
      this.g.save();
      if (S.offered >= 12) { this.g.startEnding(); return; }
      const lines = [
        ['따스한 빛이 돌아오고 있어요… 고마워요.'],
        ['가지 끝에 꽃이 다시 맺히기 시작했어요.'],
        ['섬의 바람이 한결 부드러워졌네요.'],
        ['당신의 발걸음이 닿은 곳마다 색이 피어나요.'],
      ];
      ui.say('하늘나무', [...lines[before % lines.length], `(${S.offered}/12개의 별씨앗이 하늘나무에 깃들었어요)`]);
      return;
    }
    ui.say('하늘나무', S.offered === 0 ? ['네 땅의 친구들을 찾아가 보세요. 그들이 씨앗의 행방을 알고 있을 거예요.'] : ['천천히, 당신의 속도로 걸어요. 저는 여기서 기다릴게요.']);
  }

  talkBear() {
    const q = this.state.quests.meadow, ui = this.g.ui;
    if (q === 'todo') {
      ui.say('보리', [
        '어이쿠, 손님이네! 나는 이 초원의 양치기 곰, 보리야.',
        '바람이 세게 불던 밤에 우리 양 네 마리가 초원 여기저기로 흩어져 버렸지 뭐야.',
        '양들은 겁이 많지만, 가까이 다가가면 졸졸 따라올 거야.',
        '울타리 안으로 데려다주지 않을래? 입구는 이쪽, 서쪽에 있어.',
      ], () => { this.state.quests.meadow = 'active'; this.g.save(); });
    } else if (q === 'active') {
      const left = 4 - this.state.sheepPen;
      ui.say('보리', [`아직 ${left}마리가 돌아오지 않았어. 하얀 솜뭉치를 찾아봐!`, '울음소리가 들리는 쪽으로 가 보면 있을 거야.']);
    } else {
      ui.say('보리', ['초원에 다시 꽃 냄새가 나는 것 같아.', '가끔 놀러 와. 양털 베개에 누워 낮잠 자기 딱 좋거든.']);
    }
  }

  talkTurtle() {
    const q = this.state.quests.lake, ui = this.g.ui;
    if (q === 'todo') {
      ui.say('거북 할아버지', [
        '허허… 젊은이, 서두를 것 없다네. 나는 이 호수에서 삼백 년을 산 거북이지.',
        '이 호수엔 오래전부터 연꽃 등불이 넷 있었어. 달이 뜨면 함께 빛나곤 했지.',
        '징검돌을 건너며 연꽃에 발을 디디면 다시 불이 켜질 게야.',
        '돌과 돌 사이는 점프(Space)로 건너게. 물에 빠져도 걱정 말게나, 호수는 너그러우니.',
      ], () => { this.state.quests.lake = 'active'; this.g.save(); });
    } else if (q === 'active') {
      const n = this.state.lotus.filter(Boolean).length;
      ui.say('거북 할아버지', [`연꽃 등불이 ${n}개 밝혀졌구먼. 천천히, 천천히.`]);
    } else {
      ui.say('거북 할아버지', ['보게나, 호수가 다시 숨을 쉬는구먼.', '밤이 되면 연꽃과 반딧불이 함께 춤을 춘다네. 꼭 보고 가게.']);
    }
  }

  talkOwl() {
    const q = this.state.quests.forest, ui = this.g.ui;
    if (q === 'todo') {
      ui.say('솔', [
        '후우… 쉿. 숲이 잠들어 있단다.',
        '옛날 이 숲의 버섯들은 노래를 불렀지. 나는 그 가락을 아직 기억하고 있어.',
        '내가 들려주는 순서대로 버섯 위를 통통 뛰어서 따라 불러 보렴.',
        '잘 듣고, 잘 보렴…',
      ], () => { this.state.quests.forest = 'active'; this.playDemo(); this.g.save(); });
    } else if (q === 'active') {
      ui.say('솔', ['다시 한번 들려줄게. 버섯이 빛나는 순서를 잘 보렴.'], () => this.playDemo());
    } else {
      ui.say('솔', ['숲이 다시 노래하는구나.', '밤이 되면 버섯들이 반짝인단다. 그때 숲을 걸어 보렴.']);
    }
  }

  talkCat() {
    const q = this.state.quests.highlands, ui = this.g.ui;
    if (q === 'todo') {
      ui.say('나비', [
        '냐옹, 안녕! 나는 세상을 떠도는 여행 고양이 나비야.',
        '저 고원 꼭대기엔 바람의 풍경이 걸려 있어. 그걸 울리면 섬 전체가 한눈에 보인대!',
        '절벽은 너무 가팔라서 걸어 올라갈 순 없어. 대신 공중에 뜬 돌을 밟고 올라가 봐.',
        '떨어져도 괜찮아. 다시 하면 되니까! 우리 여행은 원래 그런 거야.',
      ], () => { this.state.quests.highlands = 'active'; this.g.save(); });
    } else if (q === 'active') {
      ui.say('나비', ['떠 있는 돌은 내 옆에서부터 시작돼! 한 칸씩, 천천히.']);
    } else {
      ui.say('나비', ['들렸어, 풍경 소리! 정말 멋졌어.', '나도 언젠가 너처럼 섬을 한 바퀴 돌아봐야지.']);
    }
  }

  sit(b) {
    const P = this.g.player;
    if (P.sitting) return;
    P.sitting = b;
    const fx = Math.sin(b.ang), fz = Math.cos(b.ang);
    P.pos.set(b.x + fx * 0.1, b.y + 0.55, b.z + fz * 0.1);
    P.vel.set(0, 0, 0);
    P.facing = b.ang;
    P.yaw = b.ang + Math.PI;
    P.pitch = 0.2;
    this.g.ui.toast(`${b.text}에 앉았어요. 시간이 천천히 흘러갑니다… (움직이면 일어나요)`, 4);
    this.sitLumi = ['바람 소리가 참 좋아요.', '이렇게 잠시 쉬어 가는 것도 여행이에요.', '구름이 천천히 흘러가요…', '눈을 감으면 파도 소리가 들려요.'][Math.floor(rnd() * 4)];
    this.timers.push({ t: 2.5, fn: () => { if (P.sitting) this.g.ui.toast(`루미: ${this.sitLumi}`, 3.5); } });
  }

  // ------------------------------------------------------------- hints
  hint() {
    const P = this.g.player.pos, S = this.state;
    let target = null, label = '';
    const avail = this.seeds.filter((s) => !s.locked && !s.collected);
    let best = 1e9;
    for (const s of avail) {
      const d = Math.hypot(s.base.x - P.x, s.base.z - P.z);
      if (d < best) { best = d; target = s.base; label = '별씨앗의 빛'; }
    }
    if (S.found.length - S.offered >= 3 || (S.found.length > S.offered && !target)) { target = new THREE.Vector3(0, 12, 0); label = '하늘나무'; }
    if (!S.metTree) { target = new THREE.Vector3(0, 12, 0); label = '하늘나무'; }
    // nearest unfinished quest giver if no seed is closer than 60
    const givers = [['meadow', this.bearPos], ['lake', this.turtlePos], ['forest', this.owlPos], ['highlands', this.catPos]];
    if (S.metTree && (!target || best > 70) && label !== '하늘나무') {
      for (const [k, p] of givers) {
        if (S.quests[k] === 'done') continue;
        const d = Math.hypot(p.x - P.x, p.z - P.z);
        if (d < best) { best = d; target = new THREE.Vector3(p.x, 0, p.z); label = ZONES[k].name + '의 친구'; }
      }
    }
    if (!target) { this.g.ui.toast('루미: 모든 빛을 찾은 것 같아요!'); return; }
    this.guide = { target: target.clone(), t: 3.5, acc: 0 };
    const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const ang = Math.atan2(target.x - P.x, -(target.z - P.z));
    const di = (Math.round(ang / (Math.PI / 4)) + 8) % 8;
    this.g.ui.toast(`루미: ${dirs[di]}쪽에서 ${label}이 느껴져요! (약 ${Math.round(Math.hypot(target.x - P.x, target.z - P.z))}m)`);
    this.g.audio.bell(81, 0.08, 0, this.g.audio.sfxBus);
  }

  // ------------------------------------------------------------- objective text
  objective() {
    const S = this.state;
    if (!S.metTree) return '하늘나무에게 다가가 말을 걸어 보세요';
    const carry = S.found.length - S.offered;
    if (carry >= 3) return `별씨앗 ${carry}개를 하늘나무에 바치세요`;
    const z = this.currentZone;
    if (z && REGION_KEYS.includes(z)) {
      const q = S.quests[z];
      const left = this.seeds.filter((s) => s.zone === z && !S.found.includes(s.id)).length;
      if (z === 'meadow' && q !== 'done') return q === 'todo' ? '양치기 곰 보리를 찾아 대화하기' : `길 잃은 양을 울타리로 데려오기 (${S.sheepPen}/4)`;
      if (z === 'lake' && q !== 'done') return q === 'todo' ? '호숫가의 거북 할아버지와 대화하기' : `징검돌을 건너 연꽃 등불 밝히기 (${S.lotus.filter(Boolean).length}/4)`;
      if (z === 'forest' && q !== 'done') return q === 'todo' ? '숲속 공터의 부엉이 솔과 대화하기' : `버섯을 밟아 솔의 가락 따라 하기 (${this.melodyProgress}/${this.melody.length})`;
      if (z === 'highlands' && q !== 'done') return q === 'todo' ? '고원 아래의 고양이 나비와 대화하기' : '떠 있는 돌을 올라 바람의 풍경 울리기';
      if (left > 0) return `${ZONES[z].name}에 숨은 별씨앗 찾기 (남은 ${left}개)`;
    }
    if (carry > 0) return `별씨앗 ${carry}개를 하늘나무에 바치세요`;
    const undone = REGION_KEYS.filter((k) => S.quests[k] !== 'done').map((k) => ZONES[k].name);
    if (undone.length) return `${undone[0]}(으)로 여행을 떠나 보세요`;
    return `남은 별씨앗을 찾아 섬을 둘러보세요 (${S.found.length}/12)`;
  }

  journal() {
    return REGION_KEYS.map((k) => {
      const seeds = this.seeds.filter((s) => s.zone === k);
      const found = seeds.filter((s) => this.state.found.includes(s.id)).length;
      const q = this.state.quests[k];
      const desc = {
        meadow: ['양치기 곰 보리의 길 잃은 양 찾기', `양 ${this.state.sheepPen}/4`],
        lake: ['거북 할아버지의 연꽃 등불 밝히기', `연꽃 ${this.state.lotus.filter(Boolean).length}/4`],
        forest: ['부엉이 솔의 숲의 노래', '버섯을 밟아 가락을 따라 연주'],
        highlands: ['나비와 바람의 풍경', '떠 있는 돌을 올라 풍경 울리기'],
      }[k];
      const st = q === 'done' ? '✔ 완료' : q === 'active' ? `진행 중 · ${desc[1]}` : '아직 만나지 못했어요';
      return { name: ZONES[k].name, found, total: seeds.length, done: found === seeds.length, quest: `${desc[0]} — ${st}` };
    });
  }

  // ------------------------------------------------------------- load
  applyLoaded(s) {
    Object.assign(this.state, s);
    this.state.quests = { ...this.state.quests, ...(s.quests || {}) };
    for (const seed of this.seeds) {
      if (seed.quest && this.state.quests[seed.zone] === 'done') { seed.locked = false; seed.setActive(true); }
      if (this.state.found.includes(seed.id)) { seed.collected = true; seed.setActive(false); }
    }
    if (this.state.quests.meadow === 'done' || this.state.sheepPen > 0) {
      this.sheep.slice(0, this.state.sheepPen).forEach((sh) => {
        sh.state = 'pen';
        sh.obj.position.set(this.penCenter.x + (rnd() - 0.5) * 6, 0, this.penCenter.z + (rnd() - 0.5) * 5);
      });
    }
    this.lotusLanterns.forEach((L) => { if (this.state.lotus[L.i]) { L.lit = true; L.obj.userData.target = 1; L.obj.userData.open = 1; } });
    if (this.state.quests.lake === 'done') { this.bigLotus.userData.target = 1; this.bigLotus.userData.open = 1; }
    if (this.state.quests.forest === 'done') this.melodyProgress = this.melody.length;
    this.g.tree.setProgress(this.state.offered, true);
    this.refreshZoneTargets();
    for (const k of ZONE_KEYS) FX.uZones.value[ZONES[k].id].w = this.zoneRestore[k];
  }

  // ------------------------------------------------------------- update
  update(dt, elapsed) {
    const g = this.g, P = g.player.pos, ui = g.ui, input = g.input;
    const night = g.world.sky.night;
    this.state.playTime += dt;

    // timers
    for (const t of this.timers) { t.t -= dt; if (t.t <= 0 && !t.done && !ui.talking) { t.done = true; t.fn(); } }
    this.timers = this.timers.filter((t) => !t.done);

    // zone detection
    let zone = null, zd = 1e9;
    for (const k of ZONE_KEYS) {
      const z = ZONES[k];
      const d = Math.hypot(P.x - z.x, P.z - z.z) / z.r;
      if (d < 0.62 && d < zd) { zd = d; zone = k; }
    }
    if (zone && zone !== this.currentZone) {
      if (!this.state.visited.includes(zone)) {
        this.state.visited.push(zone);
        const sub = { center: '섬의 심장, 빛을 잃은 거대한 나무', meadow: '바람이 머무는 넓은 초원', lake: '고요한 물결 위의 징검다리', forest: '오래된 노래가 잠든 숲', highlands: '구름에 닿는 높은 땅' }[zone];
        ui.zoneTitle(ZONES[zone].name, sub);
        const first = { meadow: ['초원이에요! 바람이 기분 좋아요.', '저기 밀짚모자를 쓴 곰이 보여요. 무슨 일이 있는 걸까요?'], lake: ['물 냄새가 나요. 호숫가에 누군가 앉아 있어요.'], forest: ['쉿… 숲이 잠들어 있는 것 같아요.', '숲 한가운데 공터로 가 봐요.'], highlands: ['우와, 절벽이 정말 높아요!', '저 아래 고양이가 손을 흔들고 있어요.'] }[zone];
        if (first && this.state.metTree) this.timers.push({ t: 2.2, fn: () => ui.say(LUMI, first) });
      } else if (zone !== 'center') ui.zoneTitle(ZONES[zone].name);
      this.currentZone = zone;
    }
    if (!zone && this.currentZone) this.currentZone = null;

    // restoration animation
    for (const k of ZONE_KEYS) {
      const v = FX.uZones.value[ZONES[k].id];
      v.w += (this.zoneRestore[k] - v.w) * Math.min(1, dt * 0.6);
      const fg = g.world.veg.flowerGrow[k];
      if (fg) fg.value = 0.25 + 0.75 * v.w;
    }

    // seeds
    for (const s of this.seeds) {
      if (s.appear !== undefined && s.appear < 1) { s.appear = Math.min(1, s.appear + dt * 1.5); s.group.scale.setScalar(s.appear); }
      s.update(dt, elapsed);
      if (!s.collected && !s.locked && s.group.visible) {
        const d = s.group.position.distanceTo(P.clone().setY(P.y + 0.9));
        if (d < 1.9) this.collectSeed(s);
        s.beam.visible = Math.hypot(s.base.x - P.x, s.base.z - P.z) > 6;
      }
    }

    this.updateSheep(dt);
    this.updateLotus(dt, elapsed, night);
    this.updateMushrooms(dt, night);
    this.updateHighlands(dt, elapsed);

    // NPC idle + look at player
    for (const n of this.npcs) {
      const h = n.userData.head;
      const d = Math.hypot(P.x - n.position.x, P.z - n.position.z);
      if (h) {
        const want = d < 8 ? Math.atan2(P.x - n.position.x, P.z - n.position.z) - n.rotation.y : 0;
        let w = Math.atan2(Math.sin(want), Math.cos(want));
        w = Math.max(-0.9, Math.min(0.9, w));
        h.rotation.y += (w - h.rotation.y) * Math.min(1, dt * 4);
        h.rotation.z = Math.sin(elapsed * 1.5 + n.position.x) * 0.05;
      }
      if (n.userData.tail) n.userData.tail.rotation.z = Math.sin(elapsed * 2) * 0.3;
      if (n.userData.bodyBob) n.userData.bodyBob.position.y = 1.2 + Math.sin(elapsed * 2) * 0.03;
    }
    for (const [k, m] of Object.entries(this.markers)) {
      const show = this.state.quests[k] !== 'done' && this.state.metTree;
      m.s.visible = m.mark.visible = show;
      m.mark.rotation.y = elapsed * 2;
      m.mark.position.y = m.s.position.y + Math.sin(elapsed * 3) * 0.12;
    }

    // Lumi companion
    const pl = g.player;
    const side = new THREE.Vector3(Math.cos(pl.facing) * 0.9, 0, -Math.sin(pl.facing) * 0.9);
    let want = new THREE.Vector3(P.x, P.y + 2.1 + Math.sin(elapsed * 2.2) * 0.18, P.z).add(side).add(new THREE.Vector3(-Math.sin(pl.facing) * 0.4, 0, -Math.cos(pl.facing) * 0.4));
    if (this.guide) {
      this.guide.t -= dt;
      const dir = this.guide.target.clone().sub(P).setY(0).normalize();
      const k = Math.min(1, (3.5 - this.guide.t) * 0.8);
      want = new THREE.Vector3(P.x + dir.x * 8 * k, P.y + 2.5, P.z + dir.z * 8 * k);
      this.guide.acc += dt;
      if (this.guide.acc > 0.06) {
        this.guide.acc = 0;
        g.world.ambient.burst.emit(this.lumi.position, '#ffe7a0', 3, 0.6, 0.2);
      }
      if (this.guide.t <= 0) this.guide = null;
    }
    this.lumi.position.lerp(want, 1 - Math.exp(-dt * (this.guide ? 3 : 5)));
    const wings = this.lumi.userData.wings;
    wings[0].rotation.y = 0.4 + Math.sin(elapsed * 20) * 0.6;
    wings[1].rotation.y = -0.4 - Math.sin(elapsed * 20) * 0.6;
    this.lumi.lookAt(g.camera.position);

    // interactions
    let best = null, bd = 1e9;
    if (!ui.talking && !pl.sitting && !pl.frozen) {
      for (const it of this.interactables) {
        if (it.cond && !it.cond()) continue;
        const d = Math.hypot(P.x - it.x, P.z - it.z);
        if (d < it.r && d < bd) { bd = d; best = it; }
      }
    }
    if (best && best.label === '하늘나무') {
      const carry = this.state.found.length - this.state.offered;
      best = { ...best, label: carry > 0 ? `별씨앗 ${carry}개 바치기` : '하늘나무와 대화하기' };
    }
    ui.prompt(best ? `<kbd>E</kbd> ${best.label}` : pl.sitting ? '<kbd>이동</kbd> 일어나기' : null);
    if (best && input.hit('KeyE')) {
      const tgt = best.obj ? best.obj.position : { x: best.x, z: best.z };
      pl.faceTowards(tgt.x, tgt.z);
      best.action();
    }
    if (input.hit('KeyQ') && !ui.talking) this.hint();

    ui.setObjective(this.objective());
    ui.setSeeds(this.state.offered, this.state.found.length, 12);
  }

  mapMarkers() {
    const P = this.g.player.pos;
    const S = this.state;
    const m = [{ x: 0, z: 0, color: '#ff9cc8', r: 6, edge: true }];
    const givers = [['meadow', this.bearPos], ['lake', this.turtlePos], ['forest', this.owlPos], ['highlands', this.catPos]];
    for (const [k, p] of givers) m.push({ x: p.x, z: p.z, color: S.quests[k] === 'done' ? '#9fd6a0' : '#ffd84a', r: 4.5, edge: S.quests[k] !== 'done' && S.metTree });
    for (const b of this.world.benches) m.push({ x: b.x, z: b.z, color: '#c89a6a', r: 2.5 });
    for (const s of this.seeds) {
      if (s.collected || s.locked) continue;
      if (Math.hypot(s.base.x - P.x, s.base.z - P.z) < 75) m.push({ x: s.base.x, z: s.base.z, color: '#fff1a0', star: true });
    }
    return m;
  }
}
