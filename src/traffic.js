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
  rock:    { w: 1.7, l: 1.7, kind: 'heavy', mesh: 'rock' },     // LARGE desert boulder — full impact, a real hazard
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
    this.haltSpawns = false;
    this.turnZ = null;           // junction z where NPCs turn off (transitions)
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
        // body, cabin AND roof all use the exact same body colour
        for (let i = 0; i < tint.length; i++) tint[i].material.color.copy(base);
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
    e.x = (opts.x != null) ? opts.x : this.road.laneX(laneIdx);
    e.oncoming = !!opts.oncoming;
    e.speed = opts.speed ?? 0; // forward world speed of this entity (same dir)
    e.notified = false;        // near-miss flagged
    e.passed = false;
    e.hit = false;             // collision resolved flag (reset on reuse!)
    e.collected = false;       // coin collected flag (reset on reuse!)
    e.cleared = false;         // jumped-over flag (reset on reuse!)
    e.knocked = false; e.knockY = 0; e.knockVX = 0; e.knockVY = 0; e.knockSpin = 0;
    e.turning = false; e.turnYaw = 0; e.turnDir = 0; e.changingTo = null;
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

  // ---- pre-load the UPCOMING road layout, strictly BEYOND an approaching
  // intersection, without touching anything nearer than it. This is what makes
  // the new environment already present by the time the player reaches the
  // junction — the CURRENT road (between the player and the intersection) is
  // completely untouched; this uses its own cursor + open-lane key so it can
  // never corrupt the main near-player sweep's state.
  preloadBeyond(newSection, boundaryZ) {
    const farZ = -CFG.VISIBLE_AHEAD;
    if (this._preRowZ === undefined || this._preRowZ > boundaryZ) {
      this._preRowZ = boundaryZ - 12; // start just beyond the junction
      this._preOpenLane = undefined;
    }
    const onc = newSection.oncomingLanes || 0;
    let guard = 0;
    while (this._preRowZ > farZ && guard++ < 4) { // small budget per frame
      this._spawnRow(newSection, this._preRowZ, onc, '_preOpenLane');
      const d = this.difficulty;
      const gap = (CFG.ROW_GAP_MAX - (CFG.ROW_GAP_MAX - CFG.ROW_GAP_MIN) * d) * (0.85 + Math.random() * 0.4);
      this._preRowZ -= gap;
    }
  }

  // Called once the player actually crosses the junction: hand the main sweep
  // off to continue from wherever the pre-loader had reached, so the two merge
  // into one continuous stretch with no gap and no duplicate rows.
  adoptPreload() {
    if (this._preRowZ !== undefined) {
      this._nextRowZ = Math.min(this._nextRowZ ?? this._preRowZ, this._preRowZ);
      this._openLane = this._preOpenLane;
    }
    this._preRowZ = undefined; this._preOpenLane = undefined;
  }

  // One-time cleanup when a transition is TRIGGERED: remove any traffic that
  // already exists beyond the intersection's starting point — it was spawned
  // under the OLD rules and wouldn't fit the new layout (e.g. wrong-direction
  // oncoming cars). Only clears the far region; the current road is untouched.
  clearBeyond(z) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.z < z && (e.type === 'car' || e.type === 'truck')) {
        e.mesh.visible = false; this.pools[e.poolKey].push(e); this.active.splice(i, 1);
      }
    }
  }

  // Called when the road layout (oncoming/median) changes. Despawn far-ahead
  // traffic (it would be in now-wrong-direction lanes) and pause spawns briefly
  // so the new layout starts clean — no cars driving the wrong way.
  // Instantly populate the ENTIRE visible-ahead stretch with rows, instead of
  // waiting for the slow per-frame trickle to catch up. Without this, unhalting
  // spawns (or clearAll) left the road ahead looking empty/"not loaded" for
  // several seconds after every transition/merge while rows filled in one by one.
  fillAheadNow(section) {
    this.haltSpawns = false;
    const farZ = -CFG.VISIBLE_AHEAD;
    // the row-sweep runs NEAR -> FAR (z decreasing each iteration), so it must
    // START near the player to sweep the whole visible stretch in one go —
    // starting at the far edge only produced a single row (the opposite bug).
    this._nextRowZ = -20;
    const onc = section.oncomingLanes || 0;
    let guard = 0;
    while (this._nextRowZ > farZ && guard++ < 40) {
      this._spawnRow(section, this._nextRowZ, onc);
      const d = this.difficulty;
      const sp = this.speed01 ?? 0;
      let gap = (CFG.ROW_GAP_MAX - (CFG.ROW_GAP_MAX - CFG.ROW_GAP_MIN) * d) * (0.85 + Math.random() * 0.4);
      gap *= 1 + sp * 0.9;
      this._nextRowZ -= gap;
    }
    // also pre-stream the oncoming lanes so they aren't empty either
    for (let lane = 0; lane < onc; lane++) {
      this.laneNextSpawn[lane] = -20; // same near->far sweep fix as above
      let g2 = 0;
      while (this.laneNextSpawn[lane] > farZ && g2++ < 20) {
        const z = this.laneNextSpawn[lane];
        const sp2 = CFG.ONCOMING_SPEED[0] + Math.random() * (CFG.ONCOMING_SPEED[1] - CFG.ONCOMING_SPEED[0]);
        if (Math.random() < 0.75) this.spawnEntity('car', lane, z, { oncoming: true, speed: sp2 });
        this.laneNextSpawn[lane] = z - (22 + Math.random() * 26);
      }
    }
  }

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
    // during a layout transition, stop spawning so the road empties naturally.
    // Also clamp the per-lane spawn cursors — they kept advancing during the
    // halt, so when spawns resumed the first oncoming cars appeared MID-VIEW
    // (the "teleport in" bug). Pinning them to the horizon fixes that.
    if (this.haltSpawns) {
      this._nextRowZ = -CFG.VISIBLE_AHEAD;
      this._openLane = undefined;
      this.laneNextSpawn.fill(-CFG.VISIBLE_AHEAD);
      return;
    }
    const farZ = -CFG.VISIBLE_AHEAD;
    const onc = section.oncomingLanes || 0;

    // --- forward-lane rows ---
    if (this._nextRowZ === undefined) this._nextRowZ = -60;
    while (this._nextRowZ > farZ) {
      this._spawnRow(section, this._nextRowZ, onc);
      // row spacing: denser with difficulty BUT sparser at high player speed —
      // at speed you need reaction room, so fewer cars on the road.
      const d = this.difficulty;
      const sp = this.speed01 ?? 0;
      let gap = (CFG.ROW_GAP_MAX - (CFG.ROW_GAP_MAX - CFG.ROW_GAP_MIN) * d) * (0.85 + Math.random() * 0.4);
      gap *= 1 + sp * 0.9; // up to ~2x spacing at max speed
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

  // laneKey lets an INDEPENDENT sweep (the pre-loader below) track its own
  // guaranteed-open-lane continuity without touching the main sweep's state.
  _spawnRow(section, z, onc, laneKey = '_openLane') {
    const n = section.lanes;
    const fwdLanes = [];
    for (let i = onc; i < n; i++) if (!section.blockedLanes?.includes(i)) fwdLanes.push(i);
    if (!fwdLanes.length) return;

    // choose this row's guaranteed-open lane, adjacent to previous open lane
    if (this[laneKey] === undefined || !fwdLanes.includes(this[laneKey])) {
      this[laneKey] = fwdLanes[(Math.random() * fwdLanes.length) | 0];
    } else {
      const step = (Math.random() < 0.5 ? -1 : 1);
      const cand = this[laneKey] + step;
      if (fwdLanes.includes(cand)) this[laneKey] = cand;        // drift the path
      // else keep same open lane (still reachable)
    }
    const openLane = this[laneKey];

    // fill the other forward lanes with a probability that rises with difficulty
    const d = this.difficulty;
    const spd = this.speed01 ?? 0;
    const fillP = (CFG.ROW_FILL_BASE + (CFG.ROW_FILL_MAX - CFG.ROW_FILL_BASE) * d)
      * (this.thin ?? 1)
      * (1 - spd * 0.45); // fewer cars per row at high speed
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

    // desert shoulder: SPARSE rocks off to the sides (beyond the lanes). You can
    // drive onto the sand to dodge traffic, but must avoid the occasional rock.
    // RARELY throw a rock onto the right dirt run (lanes 3-4) so the open side
    // isn't a totally free ride — a mild hazard to watch for.
    if (this.desert && Math.random() < 0.09) {
      const dirtX = this.road.laneX(3) + Math.random() * this.road.laneW * 1.4;
      this.spawnEntity('rock', 3, z, { x: dirtX });
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
      // desert: mostly sparse cars/trucks on the road (rocks are on the shoulder,
      // spawned separately in _spawnRow), fewer obstacles in-lane.
      if (r < 0.15) { this.spawnEntity('truck', lane, z, { speed: sameSp * 0.6 }); return; }
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
      if (e.type === 'car' && !e.oncoming && !e.knocked && !e.turning) {
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
          if (e.mesh.userData.headMat) e.mesh.userData.headMat.emissiveIntensity = (Math.sin(performance.now() * 0.012) > 0) ? 2.0 : 0.5; // blinker pulse
        }

        // RAMP ahead in my lane? indicate & change lanes instead of phasing through
        if (e.changingTo == null) {
          for (const r of this.active) {
            if (r.type !== 'ramp' || r.lane !== e.lane) continue;
            const gap = r.z - e.z;
            if (gap < 0 && gap > -35) {
              const onc = this.road.oncomingLanes || 0;
              const options = [];
              if (e.lane + 1 <= CFG.NUM_LANES - 1) options.push(e.lane + 1);
              if (e.lane - 1 >= onc) options.push(e.lane - 1);
              if (options.length) e.changingTo = options[(Math.random() * options.length) | 0];
              break;
            }
          }
        }
      }
      // execute a lane change (indicator blinking, smooth slide over)
      if (e.changingTo != null && !e.knocked && !e.turning) {
        const tx = this.road.laneX(e.changingTo);
        e.x += (tx - e.x) * Math.min(1, dt * 1.6);
        e.mesh.position.x = e.x;
        if (e.mesh.userData.headMat) e.mesh.userData.headMat.emissiveIntensity = (Math.sin(performance.now() * 0.016) > 0) ? 2.2 : 0.4;
        if (Math.abs(tx - e.x) < 0.15) {
          e.lane = e.changingTo; e.changingTo = null;
          if (e.mesh.userData.headMat) e.mesh.userData.headMat.emissiveIntensity = 1.0;
        }
      }

      // during a layout transition, cars that reach the junction turn off to
      // their NEAREST side (left lanes exit left, right lanes exit right) and
      // leave along the cross road — smooth, natural exits.
      if (this.turnZ != null && !e.turning && !e.knocked &&
          (e.type === 'car' || e.type === 'truck') &&
          Math.abs(e.z - this.turnZ) < 5) {
        e.turning = true;
        e.turnDir = e.x < 0 ? -1 : 1;          // exit toward the nearer side
        e.turnSpeed = Math.max(8, e.speed);     // keep their pace through the turn
      }
      if (e.turning) {
        // stay AT the junction in world space (full scroll comp) while easing out
        e.z += playerSpeed * dt;
        // smooth yaw toward the side road, speed ramps sideways as yaw completes
        const targetYaw = e.turnDir < 0 ? Math.PI / 2 : -Math.PI / 2;
        e.turnYaw = e.turnYaw + (targetYaw - (e.turnYaw || 0)) * Math.min(1, dt * 3);
        e.mesh.rotation.y = e.turnYaw;
        const turnFrac = Math.min(1, Math.abs(e.turnYaw) / (Math.PI / 2));
        e.x += e.turnDir * e.turnSpeed * turnFrac * dt;
        e.mesh.position.set(e.x, 0, e.z);
        if (Math.abs(e.x) > this.road.halfRoad + 16) { // fully off: despawn
          e.mesh.visible = false; this.pools[e.poolKey].push(e); this.active.splice(i, 1);
          continue;
        }
        continue; // skip normal motion while turning
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
