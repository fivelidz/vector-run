// enemies.js — gang/enemy cars that pull alongside and shoot at you. You can
// ram them off the road (big points). Bullets cause a hit if they connect (and
// count toward the police collision streak, same as a crash).
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeEnemy, makeGrenade } from './assets.js';

export class Enemies {
  constructor(scene, road, traffic, police) {
    this.scene = scene;
    this.road = road;
    this.traffic = traffic;
    this.police = police;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];
    this.bullets = [];
    this.reset();
  }

  reset() {
    // hide but KEEP the pooled meshes (clearing the arrays leaked meshes into
    // the scene on every retry — _spawnEnemy reuses hidden entries)
    for (const c of this.cars) { c.mesh.visible = false; c.alive = false; c.knocked = false; }
    for (const b of this.bullets) { b.mesh.visible = false; b.live = false; }
    this._spawnTimer = CFG.ENEMY_FIRST_DELAY;
  }

  _spawnEnemy(player) {
    let c = this.cars.find((x) => !x.mesh.visible);
    if (!c) { const mesh = makeEnemy(); this.group.add(mesh); c = { mesh }; this.cars.push(c); }
    c.mesh.visible = true;
    // approach from BEHIND, then drive AHEAD of the player to attack
    const onc = this.road.oncomingLanes || 0;
    c.lane = onc + Math.floor(Math.random() * (CFG.NUM_LANES - onc));
    c.x = this.road.laneX(c.lane);
    c.z = CFG.VISIBLE_BEHIND * 0.5;          // start behind, will move ahead
    c.targetX = c.x;
    c.fireTimer = 2.0 + Math.random() * 1.5;
    c.knocked = false; c.alive = true; c.age = 0;
    c.slot = this.cars.filter((x) => x !== c && x.mesh.visible && x.alive).length; // unique lead slot
    c.ky = 0; c.kvx = 0; c.kvy = 0; c.kspin = 0; c.airborne = false; c.cy = 0; c.vy = 0; c._behind = 0;
    c.mesh.scale.set(1, 1, 1);
    c.mesh.rotation.set(0, 0, 0);      // reset any tumble from a previous life
    c.mesh.position.set(c.x, 0, c.z);
    return c;
  }

  // Drop a grenade out the back of the enemy. It bounces once onto the road,
  // then just SITS on the tarmac — the world scrolls it back toward the player
  // at the exact relative speed a parked object moves (like a normal car ahead
  // that you catch up to). Rolls, blinks, explodes on contact/fuse.
  _fire(c, player) {
    let g = this.bullets.find((x) => !x.mesh.visible);
    if (!g) { const mesh = makeGrenade(); this.group.add(mesh); g = { mesh }; this.bullets.push(g); }
    g.mesh.visible = true;
    g.x = c.x; g.z = c.z + 2.2; g.y = 0.6;   // pops out just behind the enemy car
    g.vy = 2.0;                              // gentle hop, NOT a high toss
    g.live = true; g.landed = false; g.fuse = CFG.GRENADE_FUSE + 4; // longer so it can reach you
    g.mesh.scale.setScalar(1);
    g.mesh.rotation.set(0, 0, 0);
    g.mesh.position.set(g.x, g.y, g.z);
  }

  update(dt, player, active, onEvent) {
    // spawn cadence — only when police are chasing (escalation) or rarely otherwise
    this._spawnTimer -= dt;
    const liveCars = this.cars.filter((c) => c.mesh.visible && c.alive).length;
    if (this._spawnTimer <= 0 && liveCars < CFG.ENEMY_MAX && (active || Math.random() < 0.3)) {
      this._spawnEnemy(player);
      this._spawnTimer = CFG.ENEMY_INTERVAL * (0.6 + Math.random() * 0.8);
    }

    // rank live enemies by age (oldest first) so ranks are stable & distinct
    const live = this.cars.filter((c) => c.mesh.visible && c.alive && !c.knocked)
      .sort((a, b) => (b.age || 0) - (a.age || 0));
    live.forEach((c, i) => { c.rank = i; });

    // ---- enemy cars ----
    for (const c of this.cars) {
      if (!c.mesh.visible) continue;
      if (c.knocked) {
        // tumbling off the road after being rammed
        c.x += c.kvx * dt; c.ky = (c.ky ?? 0) + (c.kvy -= 22 * dt) * dt;
        if (c.ky < 0) { c.ky = 0; c.kvy *= -0.4; c.kvx *= 0.7; }
        c.z += player.speed * dt; // falls behind
        c.mesh.position.set(c.x, c.ky, c.z);
        c.mesh.rotation.x += c.kspin * dt; c.mesh.rotation.z += c.kspin * 0.6 * dt;
        if (c.z > CFG.VISIBLE_BEHIND + 10) c.mesh.visible = false;
        continue;
      }
      c.age = (c.age || 0) + dt;
      const rank = c.rank ?? 0; // 0 = OLDEST (tracks the player closest)

      // if an enemy gets STUCK behind the player (couldn't be rammed) for a while,
      // it gives up chasing from behind and surges forward again to re-attack.
      if (c.z > CFG.CAR_HALF_L + 1) { c._behind = (c._behind || 0) + dt; }
      else c._behind = 0;
      if (c._behind > CFG.ENEMY_STUCK_TIME) { c.age = 0; c._behind = 0; } // reset -> lead again

      // fatigue: they get ahead for a while, then drift back so you can ram them
      const driftBack = Math.max(0, (c.age - CFG.ENEMY_FATIGUE_TIME) * 2.0);
      // the oldest (rank 0) leads closest; later ranks sit progressively further
      const desiredZ = -CFG.ENEMY_LEAD_DIST - rank * 8 + Math.min(CFG.ENEMY_LEAD_DIST + 8, driftBack);
      c.z += (desiredZ - c.z) * Math.min(1, dt * 0.7);

      // DISTINCT LANES: oldest takes the player's lane; others take separate
      // adjacent lanes so they never bunch up on top of each other. BUT while
      // an enemy is still behind/alongside (not safely ahead yet), it stays OUT
      // of the player's lane — even the rank-0 leader — so the overtake itself
      // doesn't clip the player; it only slots into the lead lane once past.
      const safelyAhead = c.z < -(CFG.CAR_HALF_L * 2 + 3);
      const laneOffs = [0, CFG.LANE_WIDTH, -CFG.LANE_WIDTH, CFG.LANE_WIDTH * 2];
      let effRank = rank;
      if (!safelyAhead && rank === 0) effRank = 1; // overtake to the side first
      let want = player.x + (laneOffs[effRank] ?? CFG.LANE_WIDTH * (effRank - 1));
      const maxX = this.road.halfRoad - CFG.LANE_WIDTH * 0.5;
      want = Math.max(-maxX, Math.min(maxX, want));
      c.targetX += (want - c.targetX) * Math.min(1, dt * 0.6);
      c.x += (c.targetX - c.x) * Math.min(1, dt * 2.0);

      // hard separation — push apart along X (into different lanes) if overlapping
      for (const o of this.cars) {
        if (o === c || !o.mesh.visible || o.knocked) continue;
        if (Math.abs(c.z - o.z) < CFG.CAR_HALF_L * 2.2 && Math.abs(c.x - o.x) < CFG.LANE_WIDTH * 0.9) {
          const push = Math.sign((c.x - o.x) || (c.age - o.age) || 1);
          c.x += push * 0.15; c.targetX += push * 0.15; // shove sideways to split lanes
        }
      }
      // ---- enemy launches off ramps too ----
      if (c.airborne) {
        c.vy -= 30 * dt; c.cy = (c.cy || 0) + c.vy * dt;
        if (c.cy <= 0) { c.cy = 0; c.airborne = false; }
        c.mesh.rotation.x = -c.vy * 0.012;
      } else {
        c.cy = 0; c.mesh.rotation.x = 0;
        if (this.traffic) {
          for (const r of this.traffic.active) {
            if (r.type === 'ramp' && Math.abs(r.z - c.z) < CFG.CAR_HALF_L && Math.abs(r.x - c.x) < CFG.CAR_HALF_W + 0.5) {
              c.airborne = true; c.vy = 12; break;
            }
          }
        }
      }
      c.mesh.position.set(c.x, c.cy || 0, c.z);

      // lob a grenade back at the player once they're ahead & in range
      c.fireTimer -= dt;
      if (c.fireTimer <= 0 && c.z < -3 && c.z > -50) {
        this._fire(c, player);
        c.fireTimer = CFG.ENEMY_FIRE_INTERVAL * (0.8 + Math.random() * 0.6);
        onEvent?.('shoot', c);
      }
      if (c.mesh.userData.enemyAccent) c.mesh.userData.enemyAccent.material.emissiveIntensity = 0.4 + Math.sin(performance.now() * 0.01) * 0.3;

      // enemy plows through NPC traffic & police as it weaves to the front
      if (this.traffic) {
        for (const o of this.traffic.active) {
          if (o.knocked || o.collected) continue;
          if ((o.type === 'car' || o.type === 'truck') &&
              Math.abs(o.z - c.z) < CFG.CAR_HALF_L + 1.2 && Math.abs(o.x - c.x) < CFG.CAR_HALF_W + 0.8) {
            o.knocked = true; const sd = (c.x < o.x) ? 1 : -1;
            o.knockVX = sd * (6 + Math.random() * 5); o.knockVY = 3 + Math.random() * 3; o.knockSpin = (Math.random() - 0.5) * 12;
            onEvent?.('enemyHitNPC', { x: o.x, z: o.z });
          }
        }
      }
      if (this.police) {
        for (const pc of this.police.cruisers) {
          if (!pc.mesh.visible) continue;
          if (Math.abs(pc.z - c.z) < CFG.CAR_HALF_L + 1.2 && Math.abs(pc.x - c.x) < CFG.CAR_HALF_W + 0.8) {
            pc.mesh.visible = false; // enemy takes out the cruiser
            onEvent?.('enemyHitCop', { x: pc.x, z: pc.z });
          }
        }
      }
    }

    // ---- grenades: arc toward a landing spot ahead of the player, then sit &
    // BLINK on the road (scrolling with the world) and EXPLODE when the player
    // drives over them or the fuse ends. Land-and-explode, dodgeable.
    for (const g of this.bullets) {
      if (!g.mesh.visible) continue;
      const tip = g.mesh.userData.tip;

      // ALWAYS scroll with the world (like a parked object the player catches up
      // to) — this makes it roll back toward the player at a natural speed.
      g.z += player.speed * dt;
      g.mesh.rotation.x -= player.speed * dt * 0.4; // roll animation

      if (!g.landed) {
        // gentle bounce onto the road, then settle
        g.vy -= 14 * dt; g.y += g.vy * dt;
        if (g.y <= 0.3) { g.y = 0.3; if (g.vy < -1.5) { g.vy *= -0.4; } else { g.landed = true; g.vy = 0; } }
        g.mesh.position.set(g.x, g.y, g.z);
      } else {
        g.mesh.position.set(g.x, 0.3, g.z);
        g.fuse -= dt;
        const blink = Math.sin(this.time * (14 + (1 - Math.max(0, g.fuse) / (CFG.GRENADE_FUSE + 4)) * 30)) > 0;
        if (tip) tip.material.emissiveIntensity = blink ? 2.4 : 0.2;
      }

      // explode when the player reaches the grenade, or the fuse expires
      const overIt = Math.abs(g.z) < CFG.CAR_HALF_L + 0.9 && Math.abs(g.x - player.x) < CFG.CAR_HALF_W + 0.9;
      if (g.live && (overIt || g.fuse <= 0)) {
        g.live = false; g.mesh.visible = false; g.mesh.scale.setScalar(1);
        onEvent?.('explode', { x: g.x, z: g.z, hit: overIt });
      }
      if (g.z > CFG.VISIBLE_BEHIND + 6) { g.mesh.visible = false; g.live = false; }
    }
  }

  // player rammed an enemy car alongside? check & knock it off. Returns hit enemy.
  checkRam(player) {
    for (const c of this.cars) {
      if (!c.mesh.visible || c.knocked) continue;
      // they drive ahead — catch up to ram them off the road
      if (Math.abs(c.z) < (CFG.CAR_HALF_L + 1.8) && Math.abs(c.x - player.x) < (CFG.CAR_HALF_W + 1.0)) {
        c.knocked = true; c.alive = false;
        const side = (player.x < c.x) ? 1 : -1;
        c.kvx = side * (8 + Math.random() * 6); c.kvy = 4 + Math.random() * 3; c.kspin = (Math.random() - 0.5) * 14;
        return c;
      }
    }
    return null;
  }
}
