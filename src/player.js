import * as THREE from 'three';
import { PLAYER } from './config.js';
import { buildPlayer } from './models.js';
import { clamp } from './noise.js';

const _v = new THREE.Vector3();

export class Player {
  constructor(scene, world, audio) {
    this.world = world;
    this.audio = audio;
    this.model = buildPlayer();
    this.parts = this.model.userData.parts;
    scene.add(this.model);
    this.pos = new THREE.Vector3(4, 0, 30);
    this.pos.y = world.terrain.heightAt(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.facing = Math.PI;
    this.phase = 0;
    this.lastSafe = this.pos.clone();
    this.sitting = null;
    this.frozen = false;
    this.speed = 0;
    this.surface = 'grass';
    this.onPlatform = null;
    this.stepAcc = 0;
    this.airTime = 0;

    // camera rig
    this.yaw = 0; // camera behind player looking at tree
    this.pitch = 0.32;
    this.dist = 9;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.cinematic = null;
  }

  groundAt(x, z, feet) {
    const t = this.world.terrain.heightAt(x, z);
    const p = this.world.platforms.groundAt(x, z, feet);
    return p.y > t ? { y: p.y, platform: p.platform, terrain: t } : { y: t, platform: null, terrain: t };
  }

  canStand(x, z, fromFeet, moveLen) {
    const g = this.groundAt(x, z, fromFeet + (this.grounded ? 0.45 : 0.1));
    if (this.grounded && !g.platform && g.terrain < -1.15) return false; // deep water
    const rise = g.y - fromFeet;
    const allowed = this.grounded ? 0.35 + moveLen * 1.15 : 0.12;
    return rise <= allowed;
  }

  update(dt, input, camera) {
    // ---- camera orbit input
    if (!this.cinematic) {
      this.yaw -= input.lookDX * 0.0045;
      this.pitch = clamp(this.pitch + input.lookDY * 0.0035, -0.15, 1.2);
      this.dist = clamp(this.dist + input.zoom * 0.8, 4, 18);
    }

    const ax = this.frozen || this.sitting ? { x: 0, y: 0 } : input.axis();
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rgtX = Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);
    let mx = fwdX * -ax.y + rgtX * ax.x;
    let mz = fwdZ * -ax.y + rgtZ * ax.x;
    const mag = Math.min(1, Math.hypot(ax.x, ax.y));
    const running = input.down('ShiftLeft') || input.down('ShiftRight') || (input.touch && mag > 0.92);
    let speed = (running ? PLAYER.run : PLAYER.walk) * mag;
    const wading = this.pos.y < -0.05 && !this.onPlatform;
    if (wading) speed *= 0.6;
    if (mag > 0.001) { const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l; }
    const k = 1 - Math.exp(-dt * (this.grounded ? 12 : 4));
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;

    // ---- horizontal move with slope / water checks
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    const len = Math.hypot(dx, dz);
    const p = this.pos;
    if (len > 0) {
      if (this.canStand(p.x + dx, p.z + dz, p.y, len)) { p.x += dx; p.z += dz; }
      else if (this.canStand(p.x + dx, p.z, p.y, Math.abs(dx))) { p.x += dx; this.vel.z *= 0.5; }
      else if (this.canStand(p.x, p.z + dz, p.y, Math.abs(dz))) { p.z += dz; this.vel.x *= 0.5; }
      else { this.vel.x *= 0.2; this.vel.z *= 0.2; }
    }
    const before = { x: p.x, z: p.z };
    this.world.colliders.resolve(p, PLAYER.radius);
    this.world.platforms.resolveSides(p, PLAYER.radius);
    if (!this.canStand(p.x, p.z, p.y, 0.6)) { p.x = before.x; p.z = before.z; }

    // ---- vertical
    if (this.grounded && !this.frozen && !this.sitting && input.hit('Space')) {
      this.vy = PLAYER.jump;
      this.grounded = false;
      this.audio.jump();
      this.world.onJump?.();
    }
    this.vy -= PLAYER.gravity * dt;
    p.y += this.vy * dt;
    const g = this.groundAt(p.x, p.z, p.y + (this.grounded ? 0.45 : 0.05));
    if (p.y <= g.y) {
      const wasAir = !this.grounded;
      const impact = -this.vy;
      p.y = g.y;
      this.vy = 0;
      this.grounded = true;
      if (wasAir && impact > 6) this.audio.land();
      if (g.platform && g.platform.bounce && wasAir) {
        this.vy = g.platform.bounce;
        this.grounded = false;
        g.platform.onBounce?.(g.platform);
      } else if (g.platform && wasAir) g.platform.onLand?.(g.platform);
      this.onPlatform = g.platform;
    } else if (this.grounded && p.y - g.y < 0.5 && this.vy <= 0) {
      p.y = g.y; this.vy = 0; this.onPlatform = g.platform;
    } else {
      this.grounded = false;
    }
    if (this.grounded) this.airTime = 0; else this.airTime += dt;

    if (this.grounded && !this.onPlatform && g.terrain > 0.2) this.lastSafe.copy(p);
    if (this.grounded && this.onPlatform && !this.onPlatform.bounce) this.lastSafe.copy(p);
    if (p.y < -3 || (g.terrain < -1.4 && !this.onPlatform && this.grounded)) {
      // fell into deep water: gently return
      p.copy(this.lastSafe); this.vy = 0; this.vel.set(0, 0, 0);
      this.world.onSplash?.(p);
    }

    this.surface = p.y < 0.02 && !this.onPlatform ? 'water' : this.onPlatform ? 'stone' : 'grass';
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- facing & animation
    if (this.speed > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-dt * 12));
    }
    this.animate(dt);

    this.model.position.copy(p);
    this.model.rotation.y = this.facing;

    this.updateCamera(dt, camera);
  }

  faceTowards(x, z) {
    this.facing = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  animate(dt) {
    const pr = this.parts;
    const s = this.speed;
    const sitting = !!this.sitting;
    if (this.grounded && s > 0.2) {
      const prev = this.phase;
      this.phase += dt * (4 + s * 1.15);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.audio.step(this.surface);
    } else if (!sitting) {
      this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 8);
    }
    const amp = Math.min(1, s / 7);
    const sw = Math.sin(this.phase);
    if (sitting) {
      pr.legs.forEach((l) => { l.rotation.x = -1.4; });
      pr.body.position.y = -0.28;
      pr.arms.forEach((a, i) => { a.rotation.x = -0.5; });
    } else if (!this.grounded) {
      pr.legs[0].rotation.x = -0.6; pr.legs[1].rotation.x = 0.3;
      pr.arms[0].rotation.x = -1.2; pr.arms[1].rotation.x = -1.0;
      pr.body.position.y = 0;
    } else {
      pr.legs[0].rotation.x = sw * 0.8 * amp;
      pr.legs[1].rotation.x = -sw * 0.8 * amp;
      pr.arms[0].rotation.x = -sw * 0.6 * amp - 0.1;
      pr.arms[1].rotation.x = sw * 0.6 * amp;
      pr.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * amp;
    }
    const t = performance.now() / 1000;
    pr.body.rotation.x = this.grounded ? amp * 0.12 : -0.05;
    pr.head.rotation.z = Math.sin(t * 1.3) * 0.03;
    pr.head.position.y = 1.38 + Math.sin(t * 2) * 0.01;
    pr.scarf[0].rotation.x = -0.2 - amp * 0.9 + Math.sin(t * 6) * 0.08 * (0.3 + amp) + (this.grounded ? 0 : -0.5);
    pr.scarf[1].rotation.x = Math.sin(t * 7 + 1) * 0.25 * (0.3 + amp);
    pr.scarf[0].rotation.y = Math.sin(t * 3) * 0.15;
  }

  updateCamera(dt, camera) {
    const T = this.world.terrain;
    if (this.cinematic) {
      const c = this.cinematic;
      const k = 1 - Math.exp(-dt * (c.speed || 1.5));
      this.camPos.lerp(c.pos, k);
      this.camTarget.lerp(c.look, k);
      camera.position.copy(this.camPos);
      camera.lookAt(this.camTarget);
      return;
    }
    const tgt = _v.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const k = 1 - Math.exp(-dt * 10);
    this.camTarget.lerp(tgt, k);
    const cp = Math.cos(this.pitch);
    let dist = this.sitting ? this.dist + 6 : this.dist;
    const want = new THREE.Vector3(
      this.camTarget.x + Math.sin(this.yaw) * cp * dist,
      this.camTarget.y + Math.sin(this.pitch) * dist,
      this.camTarget.z + Math.cos(this.yaw) * cp * dist
    );
    // keep above terrain along the arm
    for (let i = 1; i <= 4; i++) {
      const f = i / 4;
      const x = this.camTarget.x + (want.x - this.camTarget.x) * f;
      const z = this.camTarget.z + (want.z - this.camTarget.z) * f;
      const y = this.camTarget.y + (want.y - this.camTarget.y) * f;
      const h = Math.max(T.heightAt(x, z), 0) + 0.7;
      if (y < h) want.y += (h - y) / f;
    }
    this.camPos.lerp(want, 1 - Math.exp(-dt * 14));
    camera.position.copy(this.camPos);
    camera.lookAt(this.camTarget);
  }

  snapCamera(camera) {
    this.camTarget.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const cp = Math.cos(this.pitch);
    this.camPos.set(this.camTarget.x + Math.sin(this.yaw) * cp * this.dist, this.camTarget.y + Math.sin(this.pitch) * this.dist, this.camTarget.z + Math.cos(this.yaw) * cp * this.dist);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camTarget);
  }

  setLantern(night) {
    this.parts.lanternLight.intensity = night * 6;
    this.parts.lanternGlow.material.opacity = 0.2 + night * 0.6;
    this.parts.lanternGlass.material.emissiveIntensity = 0.6 + night * 2.2;
  }
}
