import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { Story } from './quests.js';
import { GreatTree } from './greattree.js';
import { Creatures } from './creatures.js';
import { FX } from './materials.js';

const SAVE_KEY = 'starlight-isle-save-v1';
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
const params = new URLSearchParams(location.search);
const quality = params.get('q') || (isMobile ? 'low' : 'high');

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uTime; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.97), 0.6);
      float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.012;
      gl_FragColor = c;
    }`,
};

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.userData = { quality };
    this.pixelRatio = Math.min(window.devicePixelRatio, quality === 'low' ? 1.25 : 1.75);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1600);

    this.audio = new AudioEngine();
    this.ui = new UI(this.audio);
    this.input = new Input(canvas);

    this.setLoading('섬을 그리는 중…', 0.15);
  }

  setLoading(text, p) {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
  }

  async init() {
    const tick = () => new Promise((r) => setTimeout(r, 16));
    await tick();
    this.world = new World(this.scene, this.renderer, quality);
    this.setLoading('나무를 심는 중…', 0.4); await tick();
    this.story = new Story(this);
    this.world.buildDecor();
    this.setLoading('친구들을 깨우는 중…', 0.7); await tick();
    this.tree = new GreatTree(this.scene, this.world.terrain, this.world.colliders);
    this.player = new Player(this.scene, this.world, this.audio);
    this.story.build();
    this.creatures = new Creatures(this.scene, this.world.terrain);
    this.world.onSplash = (p) => { this.audio.step('water'); this.ui.toast('첨벙! 물이 깊어서 돌아왔어요.', 2); };
    this.ui.bakeMap(this.world.terrain);
    this.setLoading('빛을 모으는 중…', 0.9); await tick();

    this.setupComposer();
    this.story.refreshZoneTargets();
    this.world.sky.applyTime(0, this.player.pos);

    // compile shaders up front to avoid hitching
    this.player.snapCamera(this.camera);
    this.renderer.compile(this.scene, this.camera);

    window.addEventListener('resize', () => this.resize());
    this.bindUI();
    this.mode = 'title';
    this.titleT = 0;
    this.elapsed = 0;
    this.clock = new THREE.Clock();
    this.endingT = -1;
    document.getElementById('loading').classList.add('hide');
    document.getElementById('title').classList.add('show');
    if (this.hasSave()) document.getElementById('btn-continue').style.display = '';
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setupComposer() {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'low' ? 0 : 4 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.65, 0.86);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.world.ambient.resize(this.pixelRatio);
  }

  bindUI() {
    document.getElementById('btn-start').addEventListener('click', () => this.start(false));
    document.getElementById('btn-continue').addEventListener('click', () => this.start(true));
    const snd = document.getElementById('btn-sound');
    snd.addEventListener('click', () => {
      this.audio.setEnabled(!this.audio.enabled);
      snd.textContent = this.audio.enabled ? '♪' : '♪̸';
      snd.classList.toggle('off', !this.audio.enabled);
    });
    document.getElementById('btn-journal').addEventListener('click', () => this.ui.toggleJournal(this.story.journal()));
    document.getElementById('journal-close').addEventListener('click', () => this.ui.toggleJournal(null, false));
    document.getElementById('btn-continue-travel').addEventListener('click', () => {
      document.getElementById('ending').classList.remove('show');
      document.getElementById('hud').classList.add('show');
      this.player.cinematic = null;
      this.player.frozen = false;
      FX.uGlobal.value = 1;
      this.mode = 'play';
    });
    document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help').classList.toggle('show'));
    document.getElementById('help').addEventListener('click', () => document.getElementById('help').classList.remove('show'));
  }

  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  save() {
    try {
      const s = { ...this.story.state, pos: this.player.pos.toArray(), time: this.world.sky.time };
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch { /* storage unavailable */ }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.story.applyLoaded(s);
      if (s.pos) { this.player.pos.fromArray(s.pos); this.player.lastSafe.copy(this.player.pos); }
      if (typeof s.time === 'number') this.world.sky.time = s.time;
      return true;
    } catch { return false; }
  }

  start(cont) {
    this.audio.start();
    document.getElementById('title').classList.remove('show');
    document.getElementById('hud').classList.add('show');
    this.mode = 'intro';
    this.introT = 0;
    if (cont && this.load()) {
      this.mode = 'play';
      this.player.snapCamera(this.camera);
      this.ui.toast('다시 만나서 반가워요, 여행자님!');
      return;
    }
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    // intro: camera glides from the sky down to the player
    this.player.cinematic = { pos: new THREE.Vector3(20, 22, 48), look: new THREE.Vector3(0, 14, 0), speed: 0.9 };
    this.player.frozen = true;
    this.player.camPos.set(70, 60, 120);
    this.player.camTarget.set(0, 14, 0);
    this.ui.zoneTitle('별빛 섬', '빛을 잃은 하늘나무의 이야기');
    setTimeout(() => {
      this.ui.say('루미', [
        '…여행자님, 일어났군요! 저는 빛의 요정 루미예요.',
        '여기는 별빛 섬. 섬 한가운데의 하늘나무가 빛을 잃어서, 섬 전체가 잿빛으로 바래 가고 있어요.',
        '하늘나무에게 가서 이야기를 들어 봐요. 바로 앞에 있어요!',
      ], () => {
        this.player.cinematic = null;
        this.player.frozen = false;
        this.mode = 'play';
        this.ui.toast('<b>WASD</b> 이동 · <b>드래그</b> 시점 · <b>Space</b> 점프 · <b>Shift</b> 달리기 · <b>E</b> 상호작용 · <b>Q</b> 루미의 힌트 · <b>J</b> 여행 일지', 7);
      });
    }, 3800);
  }

  startEnding() {
    this.story.state.ended = true;
    this.save();
    this.mode = 'ending';
    this.endingT = 0;
    const P = this.player;
    P.frozen = true;
    P.cinematic = { pos: new THREE.Vector3(30, 26, 40), look: new THREE.Vector3(0, 18, 0), speed: 0.5 };
    this.audio.level = 1;
    this.audio.success();
    this.ui.say('하늘나무', [
      '…아아, 모든 별씨앗이 돌아왔어요.',
      '느껴지나요? 섬의 숨결이, 바람의 노래가, 물빛의 반짝임이.',
      '당신이 천천히 걸어 준 모든 길 위에 다시 색이 피어났어요.',
      '고마워요, 작은 여행자. 이 섬은 언제까지나 당신을 기억할 거예요.',
    ], () => {
      setTimeout(() => {
        const m = Math.floor(this.story.state.playTime / 60), s = Math.floor(this.story.state.playTime % 60);
        document.getElementById('end-time').textContent = `여행 시간 ${m}분 ${s}초`;
        document.getElementById('ending').classList.add('show');
        document.getElementById('hud').classList.remove('show');
      }, 2500);
    });
  }

  updateEnding(dt) {
    this.endingT += dt;
    const t = this.endingT;
    FX.uGlobal.value = Math.min(1, FX.uGlobal.value + dt * 0.12);
    const sky = this.world.sky;
    // drift to night for the aurora
    const targetTime = 0.92;
    let d = targetTime - sky.time; if (d < -0.5) d += 1; if (d > 0.5) d -= 1;
    sky.time = (sky.time + d * Math.min(1, dt * 0.25) + 1) % 1;
    sky.aurora = Math.min(1, sky.aurora + dt * 0.08);
    const a = t * 0.08;
    this.player.cinematic.pos.set(Math.sin(a) * 48, 24 + Math.sin(t * 0.1) * 6, Math.cos(a) * 48);
    if (Math.random() < dt * 3) {
      const p = new THREE.Vector3((Math.random() - 0.5) * 40, 18 + Math.random() * 10, (Math.random() - 0.5) * 40);
      this.world.ambient.burst.emit(p, ['#ffd1e6', '#fff1a6', '#b8f0ff'][Math.floor(Math.random() * 3)], 40, 5, 1);
    }
  }

  frame() {
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const dt = rawDt;
    this.elapsed += dt;
    const input = this.input;
    const P = this.player;

    // global inputs
    if (this.ui.talking && (input.hitAny('KeyE', 'Space', 'Enter'))) { this.ui.advance(); input.pressed.clear(); }
    if (this.mode === 'play' && (input.hitAny('KeyJ', 'Tab'))) this.ui.toggleJournal(this.story.journal());
    if (input.hit('Escape')) { this.ui.toggleJournal(null, false); document.getElementById('help').classList.remove('show'); }

    const blocked = this.ui.talking || this.ui.journalOpen || this.mode !== 'play';
    if (blocked) { input.pressed.delete('Space'); input.pressed.delete('KeyE'); input.pressed.delete('KeyQ'); }

    if (this.mode === 'title') {
      this.titleT += dt;
      const a = this.titleT * 0.04;
      P.cinematic = { pos: new THREE.Vector3(Math.sin(a) * 130, 55, Math.cos(a) * 130), look: new THREE.Vector3(0, 8, 0), speed: 20 };
    }
    const wasSitting = P.sitting;
    if (P.sitting) { const ax = input.axis(); if (Math.abs(ax.x) + Math.abs(ax.y) > 0.2 || input.hit('Space')) { P.sitting = null; P.pos.y += 0.1; this.ui.toast('기지개를 쭉 켰어요.', 2); } }

    const frozenBefore = P.frozen;
    if (blocked && this.mode === 'play') P.frozen = true;
    P.update(dt, input, this.camera);
    if (blocked && this.mode === 'play') P.frozen = frozenBefore;

    const timeScale = P.sitting ? 25 : 1;
    this.world.update(dt, this.elapsed, P.pos, timeScale);
    const night = this.world.sky.night;
    P.setLantern(night);
    this.tree.update(dt, this.elapsed, night);
    if (this.mode !== 'title') this.story.update(dt, this.elapsed);
    else this.story.updateLotus(dt, this.elapsed, night);
    if (this.mode === 'ending') this.updateEnding(dt);
    this.creatures.update(dt, this.elapsed, P.pos, night);
    this.world.ambient.update(dt, this.elapsed, P.pos, night, Math.max(0, (this.story.state.offered - 3) / 9) * 0.7);
    this.ui.update(dt);

    // audio
    const nearWater = Math.max(0, 1 - Math.max(0, this.world.terrain.heightAt(P.pos.x, P.pos.z)) / 2.5);
    this.audio.level = Math.max(this.audio.level, this.story.state.offered / 12);
    this.audio.update(dt, { night, nearWater, altitude: P.pos.y, sitting: !!P.sitting });

    // HUD
    if (this.mode !== 'title' && Math.floor(this.elapsed * 15) !== this._mapTick) {
      this._mapTick = Math.floor(this.elapsed * 15);
      this.ui.drawMap(P.pos, P.facing, this.story.mapMarkers());
    }

    this.grade.uniforms.uTime.value = this.elapsed % 10;
    this.bloom.strength = 0.38 + night * 0.35;
    this.composer.render();
    input.endFrame();
    if (Math.floor(this.elapsed) % 20 === 0 && this.mode === 'play' && Math.floor(this.elapsed) !== this._saveTick) { this._saveTick = Math.floor(this.elapsed); this.save(); }
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading-text');
  if (el) el.textContent = '불러오기에 실패했어요: ' + e.message;
});
