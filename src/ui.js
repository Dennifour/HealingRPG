import { WORLD } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.dialogEl = $('dialog');
    this.dName = $('dialog-name');
    this.dText = $('dialog-text');
    this.promptEl = $('prompt');
    this.toastEl = $('toast');
    this.zoneEl = $('zone-title');
    this.objEl = $('objective');
    this.seedEl = $('seed-count');
    this.carryEl = $('seed-carry');
    this.journalEl = $('journal');
    this.mapCanvas = $('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.dialog = null;
    this.toastQ = [];
    this.toastT = 0;
    this.zoneT = 0;
    this.dialogEl.addEventListener('click', () => this.advance());
    this.dialogEl.addEventListener('touchstart', (e) => { e.preventDefault(); this.advance(); }, { passive: false });
  }

  // ---------------- dialog
  say(name, lines, onDone) {
    if (typeof lines === 'string') lines = [lines];
    this.dialog = { name, lines, i: 0, shown: 0, onDone, t: 0 };
    this.dialogEl.classList.add('show');
    this.dName.textContent = name;
    this.dName.style.display = name ? '' : 'none';
    this.dText.textContent = '';
  }
  get talking() { return !!this.dialog; }
  advance() {
    const d = this.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.shown < line.length) { d.shown = line.length; this.dText.textContent = line; return; }
    d.i++; d.shown = 0; d.t = 0;
    if (d.i >= d.lines.length) {
      this.dialog = null;
      this.dialogEl.classList.remove('show');
      d.onDone && d.onDone();
    }
  }
  updateDialog(dt) {
    const d = this.dialog;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.shown < line.length) {
      d.t += dt;
      const before = Math.floor(d.shown);
      d.shown = Math.min(line.length, d.shown + dt * 38);
      if (Math.floor(d.shown) !== before && before % 3 === 0) this.audio.blip();
      this.dText.textContent = line.slice(0, Math.floor(d.shown));
    }
    this.dialogEl.classList.toggle('done', d.shown >= line.length);
  }

  // ---------------- small bits
  prompt(text) {
    if (text) { this.promptEl.innerHTML = text; this.promptEl.classList.add('show'); }
    else this.promptEl.classList.remove('show');
  }
  toast(text, dur = 3.2) {
    if (this.toastQ.some((t) => t.text === text)) return;
    this.toastQ.push({ text, dur });
    if (this.toastQ.length > 2) this.toastQ.shift();
  }
  zoneTitle(name, sub = '') {
    this.zoneEl.innerHTML = `<div class="zt-name">${name}</div>${sub ? `<div class="zt-sub">${sub}</div>` : ''}`;
    this.zoneEl.classList.remove('show');
    void this.zoneEl.offsetWidth;
    this.zoneEl.classList.add('show');
    this.zoneT = 4.5;
  }
  setObjective(text) {
    if (this.objEl.textContent === text) return;
    this.objEl.textContent = text;
    this.objEl.classList.remove('flash'); void this.objEl.offsetWidth; this.objEl.classList.add('flash');
  }
  setSeeds(offered, found, total) {
    this.seedEl.textContent = `${found} / ${total}`;
    const carry = found - offered;
    this.carryEl.textContent = carry > 0 ? `품에 ${carry}개 · 하늘나무에 바치세요` : `하늘나무에 바친 씨앗 ${offered}`;
  }

  update(dt) {
    this.updateDialog(dt);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    } else if (this.toastQ.length) {
      const t = this.toastQ.shift();
      this.toastEl.innerHTML = t.text;
      this.toastEl.classList.add('show');
      this.toastT = t.dur;
    }
    if (this.zoneT > 0) { this.zoneT -= dt; if (this.zoneT <= 0) this.zoneEl.classList.remove('show'); }
  }

  // ---------------- journal
  toggleJournal(state, force) {
    const open = force !== undefined ? force : !this.journalEl.classList.contains('show');
    if (open) this.renderJournal(state);
    this.journalEl.classList.toggle('show', open);
    return open;
  }
  get journalOpen() { return this.journalEl.classList.contains('show'); }
  renderJournal(state) {
    const body = $('journal-body');
    body.innerHTML = state.map((r) => `
      <div class="j-region ${r.done ? 'done' : ''}">
        <div class="j-head"><span class="j-name">${r.name}</span><span class="j-seeds">${'★'.repeat(r.found)}${'☆'.repeat(r.total - r.found)}</span></div>
        <div class="j-quest">${r.quest}</div>
      </div>`).join('');
  }

  // ---------------- minimap
  bakeMap(terrain) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const half = 230;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -half + (i / S) * half * 2, z = -half + (j / S) * half * 2;
      const h = terrain.heightAt(x, z);
      let r, gg, b;
      if (h < -1) { const d = Math.min(1, -h / 8); r = 90 - d * 40; gg = 160 - d * 50; b = 190 - d * 30; }
      else if (h < 0.1) { r = 140; gg = 200; b = 205; }
      else if (h < 1.2) { r = 236; gg = 222; b = 176; }
      else { const t = Math.min(1, h / 32); r = 140 + t * 60; gg = 186 + t * 20; b = 110 + t * 70; }
      const shade = 0.85 + 0.15 * Math.sin(h * 0.9);
      const k = (j * S + i) * 4;
      img.data[k] = r * shade; img.data[k + 1] = gg * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapImg = c;
    this.mapHalf = half;
  }
  drawMap(player, facing, markers) {
    const ctx = this.mapCtx, W = this.mapCanvas.width;
    const half = this.mapHalf;
    const view = 110; // world units visible radius
    const scale = W / (view * 2);
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#4d86a6'; ctx.fillRect(0, 0, W, W);
    const imgScale = this.mapImg.width / (half * 2);
    const sx = (player.x - view + half) * imgScale, sz = (player.z - view + half) * imgScale;
    ctx.drawImage(this.mapImg, sx, sz, view * 2 * imgScale, view * 2 * imgScale, 0, 0, W, W);
    const toMap = (x, z) => [W / 2 + (x - player.x) * scale, W / 2 + (z - player.z) * scale];
    for (const m of markers) {
      let [mx, my] = toMap(m.x, m.z);
      const dx = mx - W / 2, dy = my - W / 2, d = Math.hypot(dx, dy), lim = W / 2 - 10;
      if (d > lim) { if (!m.edge) continue; mx = W / 2 + (dx / d) * lim; my = W / 2 + (dy / d) * lim; }
      ctx.fillStyle = m.color; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (m.star) {
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 2.6 : 6; ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r); }
        ctx.closePath();
      } else ctx.arc(mx, my, m.r || 4, 0, Math.PI * 2);
      ctx.stroke(); ctx.fill();
    }
    // player arrow
    ctx.translate(W / 2, W / 2);
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b3a55'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 14);
  }
}
