// enemies.js — gang/enemy cars that pull alongside and shoot at you. You can
// ram them off the road (big points). Bullets cause a hit if they connect (and
// count toward the police collision streak, same as a crash).
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeEnemy, makeBullet } from './assets.js';

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
    // come up from behind in a side lane
    const onc = this.road.oncomingLanes || 0;
    c.lane = onc + Math.floor(Math.random() * (CFG.NUM_LANES - onc));
    c.x = this.road.laneX(c.lane);
    c.z = CFG.VISIBLE_BEHIND * 0.6 + 6;     // behind, will close into view
    c.targetX = c.x;
    c.fireTimer = 1.2 + Math.random();
    c.hp = 1; c.knocked = false; c.alive = true;
    c.mesh.scale.set(1, 1, 1);
    c.mesh.position.set(c.x, 0, c.z);
    return c;
  }

  _fire(c, player) {
    let b = this.bullets.find((x) => !x.mesh.visible);
    if (!b) { const mesh = makeBullet(); this.group.add(mesh); b = { mesh }; this.bullets.push(b); }
    b.mesh.visible = true;
    b.x = c.x; b.z = c.z - 1.5; b.y = 0.8;
    // aim toward the player's current position
    const dz = (0 - b.z);
    const dist = Math.max(2, Math.abs(dz));
    b.vx = (player.x - b.x) / dist * CFG.BULLET_SPEED * 0.4;
    b.vz = -CFG.BULLET_SPEED;              // travels forward toward player (z->0)
    b.mesh.position.set(b.x, b.y, b.z);
    b.live = true;
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
      // close to alongside the player, then pace them
      const desiredZ = CFG.ENEMY_PACE_DIST;
      c.z += (desiredZ - c.z) * Math.min(1, dt * 0.8);
      // weave toward a lane next to the player (not exactly on them)
      c.targetX += (player.x + (c.x < player.x ? -CFG.LANE_WIDTH : CFG.LANE_WIDTH) - c.targetX) * Math.min(1, dt * 0.6);
      c.x += (c.targetX - c.x) * Math.min(1, dt * 2);
      c.mesh.position.set(c.x, 0, c.z);

      // shooting
      c.fireTimer -= dt;
      if (c.fireTimer <= 0 && Math.abs(c.z) < 30) {
        this._fire(c, player);
        c.fireTimer = CFG.ENEMY_FIRE_INTERVAL * (0.7 + Math.random() * 0.6);
        onEvent?.('shoot', c);
      }

      // pulse the red accent
      if (c.mesh.userData.enemyAccent) c.mesh.userData.enemyAccent.material.emissiveIntensity = 0.4 + Math.sin(performance.now() * 0.01) * 0.3;
    }

    // ---- bullets ----
    for (const b of this.bullets) {
      if (!b.mesh.visible) continue;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      // hit player?
      if (b.live && Math.abs(b.z) < CFG.CAR_HALF_L && Math.abs(b.x - player.x) < CFG.CAR_HALF_W + 0.3) {
        b.live = false; b.mesh.visible = false;
        if (!player.isInvuln() && !(player.hasInvincible && player.hasInvincible())) onEvent?.('bulletHit', b);
      }
      if (b.z > CFG.VISIBLE_BEHIND + 4 || b.z < -CFG.VISIBLE_AHEAD) { b.mesh.visible = false; }
    }
  }

  // player rammed an enemy car alongside? check & knock it off. Returns hit enemy.
  checkRam(player) {
    for (const c of this.cars) {
      if (!c.mesh.visible || c.knocked) continue;
      if (Math.abs(c.z) < (CFG.CAR_HALF_L + 1.6) && Math.abs(c.x - player.x) < (CFG.CAR_HALF_W + 0.9)) {
        c.knocked = true; c.alive = false;
        const side = (player.x < c.x) ? 1 : -1;
        c.kvx = side * (8 + Math.random() * 6); c.kvy = 4 + Math.random() * 3; c.kspin = (Math.random() - 0.5) * 14;
        return c;
      }
    }
    return null;
  }
}
