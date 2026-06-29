// enemies.js — gang/enemy cars that pull alongside and shoot at you. You can
// ram them off the road (big points). Bullets cause a hit if they connect (and
// count toward the police collision streak, same as a crash).
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeEnemy, makeGrenade } from './assets.js';

export class Enemies {
  constructor(scene, road, traffic) {
    this.scene = scene;
    this.road = road;
    this.traffic = traffic;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];
    this.bullets = [];
    this.reset();
  }

  reset() {
    for (const c of this.cars) c.mesh.visible = false;
    for (const b of this.bullets) b.mesh.visible = false;
    this.cars.length = 0; this.bullets.length = 0;
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
    c.knocked = false; c.alive = true;
    c.mesh.scale.set(1, 1, 1);
    c.mesh.position.set(c.x, 0, c.z);
    return c;
  }

  // lob a slow grenade backward toward the player (arcing, dodgeable)
  _fire(c, player) {
    let g = this.bullets.find((x) => !x.mesh.visible);
    if (!g) { const mesh = makeGrenade(); this.group.add(mesh); g = { mesh }; this.bullets.push(g); }
    g.mesh.visible = true;
    g.x = c.x; g.z = c.z + 1.5; g.y = 1.0;
    g.vx = (player.x - c.x) * 0.25;         // slight lead toward player lane
    g.vz = CFG.GRENADE_SPEED;               // travels BACKWARD toward player (z grows)
    g.vy = 5.5;                              // arc up then fall
    g.mesh.position.set(g.x, g.y, g.z);
    g.live = true;
  }

  update(dt, player, active, onEvent) {
    // spawn cadence — only when police are chasing (escalation) or rarely otherwise
    this._spawnTimer -= dt;
    const liveCars = this.cars.filter((c) => c.mesh.visible && c.alive).length;
    if (this._spawnTimer <= 0 && liveCars < CFG.ENEMY_MAX && (active || Math.random() < 0.3)) {
      this._spawnEnemy(player);
      this._spawnTimer = CFG.ENEMY_INTERVAL * (0.6 + Math.random() * 0.8);
    }

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
      // drive AHEAD of the player (negative z = in front) and weave to their lane
      const desiredZ = -CFG.ENEMY_LEAD_DIST;
      c.z += (desiredZ - c.z) * Math.min(1, dt * 0.7);
      c.targetX += (player.x - c.targetX) * Math.min(1, dt * 0.5);
      c.x += (c.targetX - c.x) * Math.min(1, dt * 1.8);
      c.mesh.position.set(c.x, 0, c.z);

      // lob a grenade back at the player once they're ahead & in range
      c.fireTimer -= dt;
      if (c.fireTimer <= 0 && c.z < -3 && c.z > -50) {
        this._fire(c, player);
        c.fireTimer = CFG.ENEMY_FIRE_INTERVAL * (0.8 + Math.random() * 0.6);
        onEvent?.('shoot', c);
      }
      if (c.mesh.userData.enemyAccent) c.mesh.userData.enemyAccent.material.emissiveIntensity = 0.4 + Math.sin(performance.now() * 0.01) * 0.3;
    }

    // ---- grenades (arc through the air toward the player) ----
    for (const g of this.bullets) {
      if (!g.mesh.visible) continue;
      g.x += g.vx * dt; g.z += g.vz * dt; g.vy -= 9 * dt; g.y += g.vy * dt;
      if (g.y < 0.25) { g.y = 0.25; g.vy = 0; }
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 6; g.mesh.rotation.z += dt * 4;
      // hit player? (grenade near ground level & overlapping)
      if (g.live && Math.abs(g.z) < CFG.CAR_HALF_L + 0.5 && Math.abs(g.x - player.x) < CFG.CAR_HALF_W + 0.4 && g.y < 1.4) {
        g.live = false; g.mesh.visible = false;
        if (!player.isInvuln() && !(player.hasInvincible && player.hasInvincible())) onEvent?.('grenadeHit', g);
      }
      if (g.z > CFG.VISIBLE_BEHIND + 4) { g.mesh.visible = false; }
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
