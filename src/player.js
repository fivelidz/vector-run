// player.js — player car: lateral movement, forward speed, and the signature
// impact → spin → transparent-flash → recover state machine.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeCar, buildModel } from './assets.js';

export const PStates = { DRIVE: 'drive', SPIN: 'spin', WRECKED: 'wrecked' };

export class Player {
  constructor(scene, color) {
    this.scene = scene;
    // procedural car — renders reliably & coloured from the chase camera
    this.mesh = makeCar(color, 'car');
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);

    // cache ONLY the body materials for the i-frame flash. Skip MeshBasicMaterial
    // (used by the shadow blob & headlight beams) so flashing can't turn those
    // into solid black/white planes over the car.
    this._mats = [];
    const keep = (m) => m && m.isMeshStandardMaterial;
    this.mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const tag = (c) => { if (keep(c)) { c.transparent = true; if (c.color) c._origColor = c.color.clone(); this._mats.push(c); } };
      if (Array.isArray(o.material)) {
        o.material = o.material.map((m) => { const c = m.clone(); tag(c); return c; });
      } else {
        o.material = o.material.clone(); tag(o.material);
      }
    });

    this.reset();
  }

  reset() {
    this.x = 0;             // lateral position (metres)
    this.targetX = 0;       // desired lateral position (steering target)
    this.vx = 0;            // (target-x) delta, used for visual lean only
    this.targetLane = Math.floor(CFG.NUM_LANES / 2);
    this.minLaneX = -100;   // drivable bounds (updated per frame from road/section)
    this.maxLaneX = 100;

    this.speed = CFG.BASE_SPEED;
    this.targetSpeed = CFG.BASE_SPEED;
    this.distance = 0;

    this.state = PStates.DRIVE;
    this.spin = 0;          // current yaw (rad)
    this.spinVel = 0;       // angular velocity
    this.invuln = 0;        // i-frames timer
    this.caughtTimer = 0;   // time spent below CAUGHT_SPEED
    this._flashT = 0;

    // power-up effects (reset each run)
    this.fx = { invincible: 0, nitro: 0, magnet: 0 };
    this.shield = false;   // one-hit shield
    this._wasGlowing = false;

    // jump state
    this.y = 0;             // vertical offset (metres above road)
    this.vy = 0;            // vertical velocity
    this.airborne = false;
    this.jumpCooldown = 0;
    this._squash = 0;       // landing squash amount (0..1)

    this.mesh.rotation.y = 0;
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.set(1, 1, 1);
    this._setOpacity(1);
    this._setEmissive(0);
  }

  setLaneCount(n) { this.maxLane = n; }

  // ---- steering ----
  // A snap swipe/tap moves the TARGET to the adjacent lane centre; the spring
  // then carries the car there smoothly (no teleport).
  steerSnap(dir, road) {
    if (this.state !== PStates.DRIVE) return;
    const n = this.maxLane ?? CFG.NUM_LANES;
    const onc = road?.oncomingLanes || 0;
    const cur = this._nearestLane(road);
    const next = Math.max(onc, Math.min(n - 1, cur + dir));
    this.targetX = road.laneX(next);
    this.targetLane = next;
  }

  // nearest lane index for a given x. Oncoming lanes are settle-able UNLESS a
  // physical median barrier blocks them.
  _nearestLane(road) {
    const n = this.maxLane ?? CFG.NUM_LANES;
    const start = road.medianActive ? (road.oncomingLanes || 0) : 0;
    let best = start, bd = Infinity;
    for (let i = start; i < n; i++) {
      const d = Math.abs(this.x - road.laneX(i));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---- power-ups ----
  grantPowerup(type) {
    if (type === 'invincible') this.fx.invincible = CFG.PU_INVINCIBLE_TIME;
    else if (type === 'nitro') this.fx.nitro = CFG.PU_NITRO_TIME;
    else if (type === 'magnet') this.fx.magnet = CFG.PU_MAGNET_TIME;
    else if (type === 'shield') this.shield = true;
  }
  hasInvincible() { return this.fx.invincible > 0; }
  hasMagnet() { return this.fx.magnet > 0; }
  _tickPowerups(dt) {
    for (const k of ['invincible', 'nitro', 'magnet']) if (this.fx[k] > 0) this.fx[k] = Math.max(0, this.fx[k] - dt);
  }

  // ---- jump ----
  // Returns true if a jump actually started (so caller can play FX/audio).
  jump() {
    if (this.state !== PStates.DRIVE) return false;   // no jumping mid-spin/wreck
    if (this.airborne || this.jumpCooldown > 0) return false;
    this.airborne = true;
    this.vy = CFG.JUMP_VELOCITY;
    return true;
  }

  // ramp launch: a bigger jump regardless of cooldown (no double-launch if airborne high)
  launch() {
    if (this.state === PStates.WRECKED) return false;
    if (this.airborne && this.y > 1.0) return false;
    this.airborne = true;
    this.vy = CFG.JUMP_VELOCITY * 1.5; // higher & longer than a normal jump
    this.jumpCooldown = 0;
    return true;
  }

  // current height of the car's underside above the road (for clear-checks)
  bottomHeight() { return this.y; }

  // ---- the collision response ----
  impact(kind, sideSign, closing) {
    if (this.invuln > 0 || this.state === PStates.WRECKED) return false;
    // invincibility power-up: smash through everything, no penalty
    if (this.fx.invincible > 0) return false;
    // shield: absorb one hit, then it's consumed (brief i-frames, no spin)
    if (this.shield && kind !== 'light') {
      this.shield = false;
      this.invuln = CFG.INVULN_TIME * 0.8;
      return false;
    }
    let slow = CFG.IMPACT_SLOWDOWN_HEAVY;
    let spinAmt = CFG.SPIN_IMPULSE;
    if (kind === 'light') { slow = CFG.IMPACT_SLOWDOWN_LIGHT; spinAmt = CFG.SPIN_IMPULSE * 0.25; }
    else if (kind === 'headon') { slow = CFG.IMPACT_SLOWDOWN_HEADON; spinAmt = CFG.SPIN_IMPULSE * 1.5; }


    this.speed *= slow;
    this.spinVel = spinAmt * (sideSign || (Math.random() < 0.5 ? -1 : 1)) * (0.7 + Math.random() * 0.6);
    if (kind !== 'light') {
      this.state = PStates.SPIN;
      this.invuln = CFG.INVULN_TIME;
    }
    return true;
  }

  rammed() {
    // police ram: spin + slow but shorter invuln so pressure stays
    if (this.invuln > 0) return;
    this.speed *= 0.5;
    this.spinVel = CFG.SPIN_IMPULSE * (Math.random() < 0.5 ? -1 : 1);
    this.state = PStates.SPIN;
    this.invuln = CFG.INVULN_TIME * 0.7;
  }

  wreck() { this.state = PStates.WRECKED; this.spinVel = CFG.SPIN_IMPULSE * 1.8; }

  speed01() { return Math.min(1, (this.speed) / CFG.MAX_SPEED); }

  update(dt, input, road, opts) {
    // ---- forward speed target from distance ramp ----
    const ramp = Math.min(1, this.distance / CFG.RAMP_DISTANCE);
    let base = CFG.BASE_SPEED + (CFG.MAX_SPEED - CFG.BASE_SPEED) * ramp;

    this._tickPowerups(dt);

    if (this.state === PStates.WRECKED) {
      this.speed += (-this.speed) * Math.min(1, dt * 1.5); // coast to stop
    } else {
      // speed builds automatically with distance (no boost button).
      if (input.brake) base *= CFG.BRAKE_MULT;   // optional braking only
      this.targetSpeed = base;
      const rate = this.speed < this.targetSpeed ? CFG.RECOVER_RATE : 2.5;
      this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * rate);
    }
    this.speed = Math.max(0, this.speed);
    this.distance += this.speed * dt;

    // ---- caught check ----
    if (this.state !== PStates.WRECKED) {
      if (this.speed < CFG.CAUGHT_SPEED && this.distance > 30) {
        this.caughtTimer += dt;
        if (this.caughtTimer > CFG.CAUGHT_TIME) { this.wreck(); opts?.onWreck?.('WRECKED'); }
      } else this.caughtTimer = Math.max(0, this.caughtTimer - dt * 2);
    }

    // ---- compute drivable bounds ----
    // A physical median BARRIER blocks crossing to the oncoming side. A painted
    // centre line does NOT — the player may drive into oncoming lanes (risky!).
    const nLanes = this.maxLane ?? CFG.NUM_LANES;
    const onc = road.oncomingLanes || 0;
    const firstAllowed = road.medianActive ? onc : 0; // barrier => forward side only
    let minX = road.laneX(firstAllowed) - CFG.LANE_WIDTH * 0.45;
    let maxX = road.laneX(nLanes - 1) + CFG.LANE_WIDTH * 0.45;
    minX = Math.max(minX, -road.drivableHalf);
    maxX = Math.min(maxX, road.drivableHalf);
    this.minLaneX = minX; this.maxLaneX = maxX;

    // ---- continuous steering with release-snap (vector-runner feel) ----
    // Holding a direction moves the car continuously across ALL lanes (no lock).
    // When you LET GO, a SUBTLE magnet eases it to the nearest lane centre.
    if (this.state === PStates.DRIVE) {
      const steer = input.steer || 0;           // -1..1 analog (hold = sustained)
      const steering = Math.abs(steer) > 0.08;

      if (steering) {
        // move the target continuously — never blocked, spans the whole road
        this.targetX += steer * CFG.STEER_SPEED * dt;
        this._releaseSettle = false;
      } else {
        // released: gently settle to nearest lane centre (subtle aim-assist)
        const cx = road.laneX(this._nearestLane(road));
        this.targetX += (cx - this.targetX) * Math.min(1, CFG.LANE_MAGNET * dt);
      }
      this.targetX = Math.max(minX, Math.min(maxX, this.targetX));

      // critically-damped spring: smooth approach to target
      const t = 1 - Math.exp(-CFG.STEER_SMOOTH * dt);
      this.x += (this.targetX - this.x) * t;
      this.vx = (this.targetX - this.x); // for visual lean only

      if (this.x < minX) this.x = minX;
      if (this.x > maxX) this.x = maxX;
    }

    // ---- spin physics (gentle wobble + quick recover) ----
    if (this.state === PStates.SPIN) {
      this.spin += this.spinVel * dt;
      this.spinVel -= this.spinVel * Math.min(1, CFG.SPIN_DAMP * dt);
      // ease yaw back toward straight as it settles
      this.spin += (0 - this.spin) * Math.min(1, dt * 4);
      if (Math.abs(this.spinVel) < 0.5 && Math.abs(this.spin) < 0.08) {
        this.spin = 0; this.spinVel = 0; this.state = PStates.DRIVE;
        this.targetX = this.x; // resume steering from where we are (no snap)
      }
      // very small sideways nudge only
      this.x += Math.sin(this.spin) * this.speed * dt * 0.05;
      this.x = Math.max(this.minLaneX, Math.min(this.maxLaneX, this.x));
    } else if (this.state === PStates.WRECKED) {
      this.spin += this.spinVel * dt;
      this.spinVel -= this.spinVel * Math.min(1, dt * 1.2);
    }

    // ---- jump physics ----
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
    if (this.airborne) {
      this.vy -= CFG.JUMP_GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        // landed
        this.y = 0; this.vy = 0; this.airborne = false;
        this.jumpCooldown = CFG.JUMP_COOLDOWN;
        this._squash = 1;                 // trigger landing squash
        opts?.onLand?.(this.x);
      }
    }
    // squash & stretch: stretch up while rising, squash on landing
    if (this._squash > 0) this._squash = Math.max(0, this._squash - dt * 6);
    let sx = 1, sy = 1, sz = 1;
    if (this.airborne) {
      const stretch = Math.max(-0.18, Math.min(0.22, this.vy * 0.018));
      sy = 1 + stretch; sx = sz = 1 - stretch * 0.5;
    } else if (this._squash > 0) {
      sy = 1 - this._squash * 0.22; sx = sz = 1 + this._squash * 0.14;
    }
    this.mesh.scale.set(sx, sy, sz);

    // ---- invuln flash ----
    if (this.invuln > 0) {
      this.invuln -= dt;
      this._flashT += dt;
      const on = Math.sin(this._flashT * 28) > 0;
      this._setOpacity(on ? 0.35 : 0.8);
      this._setEmissive(on ? 0.6 : 0.1);
      if (this.invuln <= 0) { this._setOpacity(1); this._setEmissive(0); }
    } else if (this.fx.invincible > 0) {
      // INVINCIBLE: the whole car cycles through bright rainbow colours + glows
      this._flashT += dt;
      this._setOpacity(1);
      const hue = (this._flashT * 0.9) % 1;
      this._setColorHSL(hue, 0.95, 0.55);
      this._setEmissive(0.5 + Math.sin(this._flashT * 16) * 0.4);
      this._wasGlowing = true;
    } else if (this._wasGlowing) {
      this._restoreColor();
      this._setEmissive(0);
      this._wasGlowing = false;
    }

    // ---- apply transform ----
    this.mesh.position.x = this.x;
    this.mesh.position.y = this.y;
    // steering yaw + body roll proportional to how far we're leaning toward target
    const steerAmt = Math.max(-1, Math.min(1, this.vx * 0.35));
    const yaw = (this.state === PStates.SPIN || this.state === PStates.WRECKED)
      ? this.spin
      : steerAmt * 0.22;              // nose turns toward travel direction
    this.mesh.rotation.y = yaw;
    this.mesh.rotation.z = -steerAmt * 0.12 + (this.state === PStates.SPIN ? Math.sin(this._flashT * 10) * 0.05 : 0);
    this.mesh.rotation.x = this.airborne ? -this.vy * 0.012 : 0;
  }

  _setOpacity(o) { for (const m of this._mats) m.opacity = o; }
  _setEmissive(i) { for (const m of this._mats) if (m.emissive) m.emissiveIntensity = (m.userData?.baseEmis ?? 0) + i; }
  _setColorHSL(h, s, l) { for (const m of this._mats) if (m.color) m.color.setHSL(h, s, l); }
  _restoreColor() { for (const m of this._mats) if (m.color && m._origColor) m.color.copy(m._origColor); }

  isInvuln() { return this.invuln > 0; }
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
