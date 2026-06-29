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
      // window expired with < bust collisions: cops lose interest, reset streak
      if (this.collisions >= 1 && sinceHit >= CFG.COLLISION_WINDOW) {
        this.collisions = 0;
        this.active = false;
      }
    }

    // ---- spawn / despawn cruisers (visual only) ----
    const wantCruisers = this.active ? Math.min(3, this.collisions) : 0;
    const liveCount = this.cruisers.filter((c) => c.mesh.visible).length;
    this._spawnTimer -= dt;
    if (liveCount < wantCruisers && this._spawnTimer <= 0) { this._spawnCruiser(); this._spawnTimer = 1.6; }
    if (liveCount > wantCruisers) {
      const live = this.cruisers.filter((c) => c.mesh.visible);
      for (let i = wantCruisers; i < live.length; i++) live[i].mesh.visible = false;
    }

    // ---- cruiser AI: tail the player, slower, NEVER collide/overtake ----
    // Police have a top speed. The faster the player drives, the further the
    // cops fall back (and eventually lose you). Police close in when you slow.
    // relative closing speed (m/s): positive = cops gain, negative = cops drop back
    const closing = (CFG.POLICE_MAX_SPEED - player.speed);
    let anyContact = false;
    for (const c of this.cruisers) {
      if (!c.mesh.visible) continue;
      // integrate the gap directly with the speed difference (feels physical)
      c.z -= closing * dt;                       // closing>0 -> z decreases (gain)
      c.z += (CFG.POLICE_TAIL_DIST - c.z) * Math.min(1, dt * CFG.POLICE_CLOSE_RATE * 0.4);
      if (c.z < CFG.CAR_HALF_L + 0.4) c.z = CFG.CAR_HALF_L + 0.4; // ride your bumper
      if (c.z > CFG.VISIBLE_BEHIND) { c.lostTimer = (c.lostTimer || 0) + dt; if (c.lostTimer > 2.5) { c.mesh.visible = false; continue; } }
      else c.lostTimer = 0;
      c.targetX += (player.x - c.targetX) * Math.min(1, dt * 1.2);
      c.x += (c.targetX - c.x) * Math.min(1, dt * 2.2);
      c.mesh.position.set(c.x, 0, c.z);

      // contact = cop riding your bumper in your lane (only possible when slow)
      if (c.z < CFG.CAR_HALF_L + 1.5 && Math.abs(c.x - player.x) < CFG.CAR_HALF_W + 0.8) anyContact = true;

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
