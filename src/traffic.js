// traffic.js — spawns & moves traffic cars, trucks, obstacles, pickups.
// Pooled meshes. Each entity has a world Z; entities move toward +Z relative to
// the player by (playerSpeed - entitySpeed) * dt. Player is the frame of ref.
import * as THREE from 'three';
import { CFG, PAL } from './config.js';
import { makeCar, makeCone, makeBarrier, makeCoin, makePolice, makeRamp, makePowerup, makeRock, setCarNight, buildModel } from './assets.js';

const PU_COLORS = { invincible: 0xffd23f, nitro: 0xff5d5d, shield: 0x4ea3ff, magnet: 0x9d6dff };

const TYPES = {
  car:     { w: 1.0, l: 2.1, kind: 'heavy', mesh: 'car' },
  truck:   { w: 1.1, l: 3.4, kind: 'heavy', mesh: 'truck' },
  cone:    { w: 0.45, l: 0.45, kind: 'knock', mesh: 'cone' },   // knock-aside, +points
  barrier: { w: 0.5, l: 1.4, kind: 'knock', mesh: 'barrier' },  // destructible, +points
  coin:    { w: 0.6, l: 0.6, kind: 'coin', mesh: 'coin' },
  block:   { w: 1.0, l: 2.1, kind: 'heavy', mesh: 'block' },    // parked cruiser
  ramp:    { w: 1.2, l: 1.6, kind: 'ramp', mesh: 'ramp' },      // launch pad
  powerup: { w: 0.8, l: 0.8, kind: 'powerup', mesh: 'powerup' },// power-up pickup
  rock:    { w: 0.85, l: 0.85, kind: 'knock', mesh: 'rock' },   // desert obstacle (knock)
};

export class Traffic {
  constructor(scene, road) {
    this.scene = scene;
    this.road = road;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.active = [];
    this.pools = { car: [], truck: [], cone: [], barrier: [], coin: [], block: [], ramp: [], powerup: [], rock: [] };
    this.laneNextSpawn = new Array(CFG.NUM_LANES).fill(0); // z threshold per lane
    this.spawnCursor = -CFG.VISIBLE_AHEAD;

    this.difficulty = 0; // 0..1 from director
  }

  reset() {
    for (const e of this.active) { e.mesh.visible = false; this.pools[e.poolKey].push(e); }
    this.active.length = 0;
    this.laneNextSpawn.fill(-40);
    this.spawnCursor = -CFG.VISIBLE_AHEAD;
    this._nextRowZ = -60;        // first row spawns a bit ahead
    this._openLane = undefined;  // guaranteed-open path lane
  }

  _obtain(poolKey, color) {
    let e = this.pools[poolKey].pop();
    if (!e) {
      let mesh;
      // procedural models (reliable orientation, colour, wheels)
      if (poolKey === 'car') mesh = makeCar(0xffffff, 'car');
      else if (poolKey === 'truck') mesh = makeCar(PAL.truck, 'truck');
      else if (poolKey === 'cone') mesh = makeCone();
      else if (poolKey === 'barrier') mesh = makeBarrier();
      else if (poolKey === 'coin') mesh = makeCoin();
      else if (poolKey === 'block') mesh = makePolice();
      else if (poolKey === 'ramp') mesh = makeRamp();
      else if (poolKey === 'rock') mesh = makeRock();
      else if (poolKey === 'powerup') mesh = makePowerup('invincible');
      this.group.add(mesh);
      e = { mesh, poolKey };
    }
    e.mesh.visible = true;
    if (color != null && poolKey === 'car') {
      const tint = e.mesh.userData.tint;
      if (tint && tint.length) {
        const base = new THREE.Color(color);
        // body = base, skirt/cabin = slightly darker shade for two-tone depth
        tint[0].material.color.copy(base);
        for (let i = 1; i < tint.length; i++) {
          tint[i].material.color.copy(base).offsetHSL(0, 0, i === 1 ? -0.14 : -0.05);
        }
      }
    }
    return e;
  }

  spawnEntity(type, laneIdx, z, opts = {}) {
    const t = TYPES[type];
    const poolKey = type === 'car' ? 'car' : type === 'truck' ? 'truck' : type;
    const color = type === 'car' ? PAL.traffic[(Math.random() * PAL.traffic.length) | 0] : null;
    const e = this._obtain(poolKey, color);
    e.type = type;
    e.kind = t.kind;
    e.w = t.w; e.l = t.l;
    e.lane = laneIdx;
    e.z = z;
    e.x = this.road.laneX(laneIdx);
    e.oncoming = !!opts.oncoming;
    e.speed = opts.speed ?? 0; // forward world speed of this entity (same dir)
    e.notified = false;        // near-miss flagged
    e.passed = false;
    e.hit = false;             // collision resolved flag (reset on reuse!)
    e.collected = false;       // coin collected flag (reset on reuse!)
    e.cleared = false;         // jumped-over flag (reset on reuse!)
    e.knocked = false; e.knockY = 0; e.knockVX = 0; e.knockVY = 0; e.knockSpin = 0;
    e.used = false;
    // power-up type + recolour the icon
    if (type === 'powerup') {
      e.puType = opts.puType || 'invincible';
      const col = PU_COLORS[e.puType];
      const { core, ring } = e.mesh.userData;
      if (core) { core.material.color.setHex(col); core.material.emissive.setHex(col); }
      if (ring) { ring.material.color.setHex(col); ring.material.emissive.setHex(col); }
    }
    e.mesh.rotation.set(0, opts.oncoming ? Math.PI : 0, 0);
    e.spin = 0;
    e.mesh.position.set(e.x, 0, z);
    e.mesh.rotation.set(0, e.oncoming ? Math.PI : 0, 0);
    if (this._night && (poolKey === 'car' || poolKey === 'truck' || poolKey === 'block')) setCarNight(e.mesh, true);
    // coins float/spin handled in update
    this.active.push(e);
    return e;
  }

  // Police hazard: roadblock across all lanes but one random gap.
  spawnRoadblock(section, z = -CFG.VISIBLE_AHEAD * 0.95) {
    const lanes = section.lanes;
    const onc = section.oncomingLanes;
    const fwd = lanes - onc;
    // gap is the player's current open lane if possible, else centre — always reachable
    let gap = (this._openLane != null && this._openLane >= onc) ? this._openLane : onc + Math.floor(fwd / 2);
    // clear ANY existing traffic in a band around the roadblock so the gap is clean
    const band = 22;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (Math.abs(e.z - z) < band && (e.type === 'car' || e.type === 'truck' || e.type === 'cone' || e.type === 'barrier')) {
        e.mesh.visible = false; this.pools[e.poolKey].push(e); this.active.splice(i, 1);
      }
    }
    // block all forward lanes except the gap
    for (let lane = onc; lane < lanes; lane++) {
      if (lane === gap) continue;
      this.spawnEntity('block', lane, z);
    }
    // keep the row spawner from immediately stacking traffic onto the block
    this._nextRowZ = Math.min(this._nextRowZ, z - 40);
    return gap;
  }

  setDifficulty(d) { this.difficulty = d; }

  // Called when the road layout (oncoming/median) changes. Despawn far-ahead
  // traffic (it would be in now-wrong-direction lanes) and pause spawns briefly
  // so the new layout starts clean — no cars driving the wrong way.
  // remove ALL active traffic/obstacles (used when applying a new road layout)
  clearAll() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.mesh.visible = false; this.pools[e.poolKey].push(e);
    }
    this.active.length = 0;
    this._nextRowZ = -CFG.VISIBLE_AHEAD;
    this._openLane = undefined;
    this.laneNextSpawn.fill(-CFG.VISIBLE_AHEAD);
  }

  beginTransition(section) {
    // No car clearing (that looked like a "full replacement"). We just reset the
    // row cursor so new-layout rows begin spawning from the far horizon; existing
    // traffic scrolls out naturally for a smooth, continuous handover.
    this._nextRowZ = -CFG.VISIBLE_AHEAD * 0.95;
    this._openLane = undefined;
  }

  setNight(night) {
    this._night = night;
    // apply to all currently-active cars; new spawns pick it up in spawnEntity
    for (const e of this.active) {
      if (e.poolKey === 'car' || e.poolKey === 'truck' || e.poolKey === 'block') setCarNight(e.mesh, night);
    }
  }

  // ---- ROW-BASED SPAWNER with guaranteed passable route ----
  // Forward lanes spawn in rows. Each row leaves at least one OPEN forward lane,
  // and that open lane is always adjacent-reachable from the previous row's open
  // lane (|delta| <= 1) so there is ALWAYS a continuous drivable path.
  // Oncoming lanes spawn independently (they're a constant stream you weave).
  _spawnAhead(section) {
    const farZ = -CFG.VISIBLE_AHEAD;
    const onc = section.oncomingLanes || 0;

    // --- forward-lane rows ---
    if (this._nextRowZ === undefined) this._nextRowZ = -60;
    while (this._nextRowZ > farZ) {
      this._spawnRow(section, this._nextRowZ, onc);
      // row spacing shrinks with difficulty (denser) but never below a safe min
      const d = this.difficulty;
      const gap = (CFG.ROW_GAP_MAX - (CFG.ROW_GAP_MAX - CFG.ROW_GAP_MIN) * d) * (0.85 + Math.random() * 0.4);
      this._nextRowZ -= gap;
    }

    // --- oncoming stream (independent per oncoming lane) ---
    for (let lane = 0; lane < onc; lane++) {
      if (this.laneNextSpawn[lane] > farZ) {
        const z = this.laneNextSpawn[lane];
        const sp = CFG.ONCOMING_SPEED[0] + Math.random() * (CFG.ONCOMING_SPEED[1] - CFG.ONCOMING_SPEED[0]);
        if (Math.random() < 0.75) this.spawnEntity('car', lane, z, { oncoming: true, speed: sp });
        this.laneNextSpawn[lane] = z - (22 + Math.random() * 26);
      }
    }
  }

  _spawnRow(section, z, onc) {
    const n = section.lanes;
    const fwdLanes = [];
    for (let i = onc; i < n; i++) if (!section.blockedLanes?.includes(i)) fwdLanes.push(i);
    if (!fwdLanes.length) return;

    // choose this row's guaranteed-open lane, adjacent to previous open lane
    if (this._openLane === undefined || !fwdLanes.includes(this._openLane)) {
      this._openLane = fwdLanes[(Math.random() * fwdLanes.length) | 0];
    } else {
      const step = (Math.random() < 0.5 ? -1 : 1);
      const cand = this._openLane + step;
      if (fwdLanes.includes(cand)) this._openLane = cand;        // drift the path
      // else keep same open lane (still reachable)
    }
    const openLane = this._openLane;

    // fill the other forward lanes with a probability that rises with difficulty
    const d = this.difficulty;
    const fillP = (CFG.ROW_FILL_BASE + (CFG.ROW_FILL_MAX - CFG.ROW_FILL_BASE) * d) * (this.thin ?? 1);
    // keep the ramp lane clear for a few rows so NPCs don't hit the ramp
    let rampLane = -1;
    if (this._rampLaneRows > 0) { rampLane = this._rampLane; this._rampLaneRows--; }
    for (const lane of fwdLanes) {
      if (lane === openLane || lane === rampLane) continue; // never block these
      if (Math.random() > fillP) continue;
      this._spawnForwardObstacle(section, lane, z);
    }

    // blocked (construction) lanes get a cone/barrier line at this row
    if (section.blockedLanes) {
      for (const lane of section.blockedLanes) {
        if (lane >= onc) this.spawnEntity(Math.random() < 0.6 ? 'cone' : 'barrier', lane, z);
      }
    }

    // open-lane reward: ramp, rare invincibility power-up, or coin
    const rr = Math.random();
    if (rr < 0.08) {
      this.spawnEntity('ramp', openLane, z);
      // warning cones leading up to the ramp (signpost it); keeps the lane open
      this.spawnEntity('cone', openLane, z + 7);
      this.spawnEntity('cone', openLane, z + 13);
      this._rampLane = openLane; // NPC rows keep this open next few rows
      this._rampLaneRows = 3;
    } else if (rr < 0.08 + CFG.PU_SPAWN_CHANCE) {
      this.spawnEntity('powerup', openLane, z, { puType: 'invincible' });
    } else if (section.allowCoins && Math.random() < 0.4) {
      this.spawnEntity('coin', openLane, z);
    }
  }

  _spawnForwardObstacle(section, lane, z) {
    const d = this.difficulty;
    const sameSp = CFG.TRAFFIC_SPEED_SAME[0] + Math.random() * (CFG.TRAFFIC_SPEED_SAME[1] - CFG.TRAFFIC_SPEED_SAME[0]);
    const r = Math.random();
    if (this.desert) {
      // desert area: rocks & the odd truck, fewer cars
      if (r < 0.5) { this.spawnEntity('rock', lane, z); return; }
      if (r < 0.62) { this.spawnEntity('truck', lane, z, { speed: sameSp * 0.6 }); return; }
      this.spawnEntity('car', lane, z, { speed: sameSp });
      return;
    }
    if (r < 0.10 + d * 0.05) { this.spawnEntity('truck', lane, z, { speed: sameSp * 0.6 }); return; }
    if (section.allowObstacles && r < 0.30) { this.spawnEntity(Math.random() < 0.6 ? 'cone' : 'barrier', lane, z); return; }
    this.spawnEntity('car', lane, z, { speed: sameSp });
  }

  update(dt, playerSpeed, section, onEvent) {
    // advance spawn thresholds with the world; spawn ahead
    const adv = playerSpeed * dt;
    for (let i = 0; i < this.laneNextSpawn.length; i++) this.laneNextSpawn[i] += adv;
    this._nextRowZ += adv;
    this._spawnAhead(section);

    const despawnZ = CFG.VISIBLE_BEHIND + 15;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];

      // NPC same-direction cars slow down behind a slower vehicle in their lane
      // (and flash an indicator). Keeps traffic from clipping through trucks.
      if (e.type === 'car' && !e.oncoming && !e.knocked) {
        let aheadSlow = null;
        for (const o of this.active) {
          if (o === e || o.oncoming) continue;
          if ((o.type === 'truck' || o.type === 'car') && o.lane === e.lane) {
            const gap = o.z - e.z; // ahead = more negative; o ahead of e if o.z < e.z
            if (gap < 0 && gap > -10 && o.speed < e.speed) { aheadSlow = o; break; }
          }
        }
        if (aheadSlow) {
          e.speed += (aheadSlow.speed - e.speed) * Math.min(1, dt * 2); // match slower
          if (e.mesh.userData.headlights) e.mesh.userData.headlights.emissiveIntensity = (Math.sin(performance.now() * 0.012) > 0) ? 1.6 : 0.6; // blinker pulse
        }
      }

      // relative motion: world moves +Z by playerSpeed; entity also moves
      let rel = playerSpeed;
      if (e.oncoming) rel += e.speed;       // closes faster
      else rel -= e.speed;                  // same dir, slower closing
      e.z += rel * dt;
      e.mesh.position.z = e.z;

      // knocked-aside obstacle: tumble off the road
      if (e.knocked) {
        e.x += e.knockVX * dt;
        e.knockVY -= 18 * dt;
        e.knockY = (e.knockY ?? 0) + e.knockVY * dt;
        if (e.knockY < 0) { e.knockY = 0; e.knockVY *= -0.4; e.knockVX *= 0.7; }
        e.mesh.position.set(e.x, e.knockY, e.z);
        e.mesh.rotation.x += e.knockSpin * dt;
        e.mesh.rotation.z += e.knockSpin * 0.6 * dt;
      }

      // coin spin & bob
      if (e.type === 'coin') {
        e.mesh.rotation.z += dt * 4;
        e.mesh.position.y = 1.1 + Math.sin((e.z + performance.now() * 0.002)) * 0.15;
      }
      // power-up spin & bob
      if (e.type === 'powerup') {
        e.mesh.rotation.y += dt * 2;
        if (e.mesh.userData.core) e.mesh.userData.core.rotation.y += dt * 3;
        e.mesh.position.y = 1.2 + Math.sin(performance.now() * 0.003 + e.z) * 0.2;
      }

      // despawn behind
      if (e.z > despawnZ) {
        e.mesh.visible = false;
        this.pools[e.poolKey].push(e);
        this.active.splice(i, 1);
      }
    }
  }
}

// weighted spawn choice per lane
function roll(traffic, lane, z, oncoming, section) {
  const d = traffic.difficulty;
  const r = Math.random();
  if (oncoming) {
    // oncoming: mostly cars, fast
    const sp = CFG.ONCOMING_SPEED[0] + Math.random() * (CFG.ONCOMING_SPEED[1] - CFG.ONCOMING_SPEED[0]);
    if (r < 0.15) traffic.spawnEntity('truck', lane, z, { oncoming: true, speed: sp * 0.7 });
    else traffic.spawnEntity('car', lane, z, { oncoming: true, speed: sp });
    return;
  }
  // same direction
  const sameSp = CFG.TRAFFIC_SPEED_SAME[0] + Math.random() * (CFG.TRAFFIC_SPEED_SAME[1] - CFG.TRAFFIC_SPEED_SAME[0]);
  if (section.allowCoins && r < 0.12) { traffic.spawnEntity('coin', lane, z); return; }
  if (r < 0.10 + d * 0.05) { traffic.spawnEntity('truck', lane, z, { speed: sameSp * 0.6 }); return; }
  if (section.allowObstacles && r < 0.18) { traffic.spawnEntity(Math.random() < 0.6 ? 'cone' : 'barrier', lane, z); return; }
  if (r < 0.62) { traffic.spawnEntity('car', lane, z, { speed: sameSp }); return; }
  // else empty gap
}
