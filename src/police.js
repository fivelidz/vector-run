// police.js — collision-count pursuit. Police are a *visual* threat that tail
// the player; they do NOT collide with or slow the player (no cascading
// punishment). The run-ending logic is collision-count based:
//   - cops emerge after the 2nd collision
//   - a 3rd collision within COLLISION_WINDOW seconds ends the run (BUSTED)
//   - collisions within COLLISION_COOLDOWN of the previous one don't re-count
import * as THREE from 'three';
import { CFG } from './config.js';
import { makePolice } from './assets.js';

export class Police {
  constructor(scene, road, traffic) {
    this.scene = scene;
    this.road = road;
    this.traffic = traffic;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cruisers = [];
    this.reset();
  }

  reset() {
    for (const c of this.cruisers) c.mesh.visible = false;
    this.cruisers.length = 0;
    this.collisions = 0;        // counted collisions
    this.lastHitTime = -999;    // seconds (game clock)
    this.time = 0;              // game clock
    this.active = false;        // are cops chasing?
    this.stars = 0;            // kept for HUD (derived from collisions)
    this.heat = 0;             // kept for HUD heat bar (time-since-last-hit window)
    this.bust = 0;
    this._spawnTimer = 0;
    this._hazardTimer = 12;
  }

  // Called by main on each *heavy* collision. Returns:
  //   'counted'  -> a fresh collision was counted toward the streak
  //   'wreck'    -> this was the run-ending Nth collision within the window
  //   'ignored'  -> within cooldown of the last hit, not counted
  // A heavy collision raises the wanted level (spawns cops after 2). It NEVER
  // directly ends the run — you only get busted if a cruiser actually catches &
  // stays in contact (which is impossible while you're outrunning them).
  registerCollision() {
    const now = this.time;
    if (now - this.lastHitTime < CFG.COLLISION_COOLDOWN) return 'ignored';
    if (this.collisions > 0 && (now - this.lastHitTime) < CFG.COLLISION_WINDOW) this.collisions += 1;
    else this.collisions = 1;
    this.lastHitTime = now;
    if (this.collisions >= CFG.COLLISIONS_TO_CHASE) this.active = true;
    return 'counted';
  }

  _spawnCruiser() {
    let c = this.cruisers.find((x) => !x.mesh.visible);
    let mesh;
    if (!c) { mesh = makePolice(); this.group.add(mesh); c = { mesh }; this.cruisers.push(c); }
    else mesh = c.mesh;
    mesh.visible = true;
    // spawn just behind the player, in view (between player and camera)
    c.z = CFG.POLICE_TAIL_DIST + 4 + Math.random() * 3;
    c.lane = Math.floor(Math.random() * CFG.NUM_LANES);
    c.x = this.road.laneX(c.lane);
    c.targetX = c.x;
    c.lostTimer = 0;
    c.crashed = false; c.crashY = 0; c.crashVX = 0; c.crashVY = 0; c.crashSpin = 0;
    mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
    mesh.position.set(c.x, 0, c.z);
    return c;
  }

  update(dt, player, sectionDifficulty, onEvent, section) {
    this.time += dt;

    // HUD: stars = how close to bust; heat bar = time pressure within window
    const sinceHit = this.time - this.lastHitTime;
    this.stars = this.active ? Math.min(5, this.collisions + 1) : 0;
    // heat bar shows the danger window: full right after a hit, drains over the window
    if (this.collisions >= 1 && sinceHit < CFG.COLLISION_WINDOW) {
      this.heat = CFG.HEAT_MAX * (1 - sinceHit / CFG.COLLISION_WINDOW);
    } else {
      this.heat = 0;
      // window expired: cops lose interest, reset streak (you escaped!)
      if (this.collisions >= 1 && sinceHit >= CFG.COLLISION_WINDOW) {
        this.collisions = 0;
        if (this.active) { this.active = false; onEvent?.('escaped'); }
      }
    }

    // ---- spawn / despawn: only ONE cruiser chasing (no stacking) ----
    const wantCruisers = this.active ? 1 : 0;
    const liveCount = this.cruisers.filter((c) => c.mesh.visible).length;
    this._spawnTimer -= dt;
    if (liveCount < wantCruisers && this._spawnTimer <= 0) { this._spawnCruiser(); this._spawnTimer = 1.6; onEvent?.('cruiserSpawn'); }
    if (liveCount > wantCruisers) {
      const live = this.cruisers.filter((c) => c.mesh.visible);
      for (let i = wantCruisers; i < live.length; i++) live[i].mesh.visible = false;
    }

    // ---- cruiser AI (Temple-Run pacing) ----
    // The cop MATCHES the player's speed and holds a tail distance that closes
    // when you crash (heat high) and eases out a touch when you're clean — but
    // it never just falls away or lingers off-screen. You can't trivially outrun
    // it; you escape only by staying clean for the whole window.
    const minGap = CFG.CAR_HALF_L * 2 + 0.6;
    // desired tail distance: closer right after a crash, a bit further when calm
    const sinceHit2 = this.time - this.lastHitTime;
    const pressure = Math.max(0, 1 - sinceHit2 / CFG.COLLISION_WINDOW); // 1 just after hit -> 0
    const desiredTail = minGap + (CFG.POLICE_TAIL_DIST - minGap) * (1 - pressure);
    let anyContact = false;
    for (const c of this.cruisers) {
      if (!c.mesh.visible) continue;

      // ---- crashed cruiser: spin off the road (you led it into traffic!) ----
      if (c.crashed) {
        c.crashVX = (c.crashVX || 0);
        c.x += c.crashVX * dt; c.crashY = (c.crashY || 0) + (c.crashVY -= 20 * dt) * dt;
        if (c.crashY < 0) { c.crashY = 0; c.crashVY *= -0.4; c.crashVX *= 0.7; }
        c.z += (player.speed * 0.5) * dt; // falls behind
        c.mesh.position.set(c.x, c.crashY, c.z);
        c.mesh.rotation.x += c.crashSpin * dt; c.mesh.rotation.z += c.crashSpin * 0.7 * dt;
        if (c.z > CFG.VISIBLE_BEHIND + 8) { c.mesh.visible = false; }
        continue;
      }

      // ease the gap toward the desired tail (always keeps pace, no runaway)
      c.z += (desiredTail - c.z) * Math.min(1, dt * 1.6);
      if (c.z < minGap) c.z = minGap;
      c.lostTimer = 0;
      c.targetX += (player.x - c.targetX) * Math.min(1, dt * 1.4);
      c.x += (c.targetX - c.x) * Math.min(1, dt * 2.4);
      c.mesh.position.set(c.x, 0, c.z);

      // ---- collide with NPC traffic: crash the cruiser & shake the chase ----
      if (this.traffic) {
        for (const o of this.traffic.active) {
          if (o.knocked || o.collected) continue;
          if ((o.type === 'car' || o.type === 'truck') &&
              Math.abs(o.z - c.z) < CFG.CAR_HALF_L + 1.0 && Math.abs(o.x - c.x) < CFG.CAR_HALF_W + 0.7) {
            // cop crashes; the NPC gets knocked too
            c.crashed = true;
            const sd = (c.x < o.x) ? -1 : 1;
            c.crashVX = sd * (7 + Math.random() * 5); c.crashVY = 4; c.crashSpin = (Math.random() - 0.5) * 14;
            o.knocked = true; o.knockVX = -sd * (5 + Math.random() * 4); o.knockVY = 3; o.knockSpin = (Math.random() - 0.5) * 10;
            onEvent?.('copCrash', { x: c.x, z: c.z });
            // losing the cop reduces heat so you can escape
            this.collisions = Math.max(0, this.collisions - 1);
            this.bust = Math.max(0, this.bust - 40);
            if (this.collisions < CFG.COLLISIONS_TO_CHASE) this.active = false;
            break;
          }
        }
      }
      if (c.crashed) continue;

      // small nudge wobble on the bumper (life, never pass-through)
      if (c.z <= minGap + 0.3) c.mesh.position.x += Math.sin(this.time * 20) * 0.04;

      // contact = cop on your bumper in your lane while at high pressure
      if (c.z < minGap + 1.0 && Math.abs(c.x - player.x) < CFG.CAR_HALF_W + 0.8 && pressure > 0.5) anyContact = true;

      const lb = c.mesh.userData.lightbar;
      if (lb) {
        const on = Math.sin(this.time * 12) > 0;
        lb.red.material.emissiveIntensity = on ? 1.8 : 0.1;
        lb.blue.material.emissiveIntensity = on ? 0.1 : 1.8;
      }
    }

    // ---- BUST METER: fills only while a cop is in contact (i.e. you're slow
    // enough to be caught). Outrun them and it drains — high speed = never busted.
    if (anyContact && player.state !== 'wrecked') {
      this.bust = Math.min(CFG.BUST_MAX, this.bust + CFG.BUST_FILL_RATE * dt);
      if (this.bust >= CFG.BUST_MAX) onEvent?.('busted');
    } else {
      this.bust = Math.max(0, this.bust - CFG.BUST_DRAIN_RATE * dt);
    }

    // ---- ahead hazards: police roadblocks only when actively chasing & escalated ----
    if (this.traffic && section && this.active && this.collisions >= 2 && player.state !== 'wrecked') {
      this._hazardTimer -= dt;
      if (this._hazardTimer <= 0) {
        this.traffic.spawnRoadblock(section);
        this._hazardTimer = 12 + Math.random() * 8;
        onEvent?.('hazard', 'roadblock');
      }
    }

    return { active: this.active };
  }
}
