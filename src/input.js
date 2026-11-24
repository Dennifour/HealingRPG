// Keyboard, mouse and touch input

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.lookDX = 0; this.lookDY = 0;
    this.zoom = 0;
    this.move = { x: 0, y: 0 }; // touch joystick
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.enabled = true;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // mouse drag look
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookDX += e.movementX; this.lookDY += e.movementY; return; }
      if (!dragging) return;
      this.lookDX += e.clientX - lx; this.lookDY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (this.touch) this.setupTouch();
  }

  setupTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    document.body.classList.add('touch');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 50;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.tbtn, .panel, #dialog, button')) continue;
        if (t.clientX < window.innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = `${sx - 60}px`; stick.style.top = `${sy - 60}px`; stick.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
          this.move.x = dx / R; this.move.y = dy / R;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === lookId) {
          this.lookDX += (t.clientX - lx) * 1.4; this.lookDY += (t.clientY - ly) * 1.4;
          lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.move.x = this.move.y = 0; knob.style.transform = ''; stick.classList.remove('on'); }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    const bind = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys.add(code); this.pressed.add(code); });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys.delete(code); });
    };
    bind('btn-jump', 'Space');
    bind('btn-act', 'KeyE');
    bind('btn-hint', 'KeyQ');
    bind('btn-run', 'ShiftLeft');
  }

  axis() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.move.x; y += this.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  hitAny(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.lookDX = 0; this.lookDY = 0; this.zoom = 0; }
}
