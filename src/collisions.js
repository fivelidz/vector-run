// collisions.js — AABB overlap between player and traffic/obstacles/pickups,
// near-miss detection, and dispatch of impact/near-miss/pickup events.
import { CFG } from './config.js';

export function checkCollisions(player, traffic, handlers) {
  const px = player.x, pz = 0; // player fixed at z=0
  const phw = CFG.CAR_HALF_W, phl = CFG.CAR_HALF_L;

  for (const e of traffic.active) {
    const dz = e.z - pz;
    // only consider entities near the player band
    if (dz > phl + e.l + CFG.NEARMISS_DIST + 4) continue;     // far ahead
    if (dz < -(phl + e.l + CFG.NEARMISS_DIST + 4)) continue;  // far behind

    const dx = Math.abs(e.x - px);
    const overlapX = dx < (phw + e.w);
    const overlapZ = Math.abs(dz) < (phl + e.l);

    // ---- collision ----
    if (overlapX && overlapZ) {
      if (e.type === 'coin') {
        if (!e.collected) { e.collected = true; handlers.onCoin?.(e); }
        continue;
      }
      if (e.type === 'powerup') {
        if (!e.collected) { e.collected = true; handlers.onPowerup?.(e); }
        continue;
      }
      // invincible: smash through cars/obstacles (still trigger knock on NPCs)
      if (player.hasInvincible && player.hasInvincible() && (e.kind === 'heavy' || e.kind === 'knock')) {
        if (!e.hit) { e.hit = true; handlers.onSmash?.(e, (px < e.x) ? -1 : 1); }
        continue;
      }
      if (player.isInvuln()) continue; // ghost through during i-frames

      // ---- jump clears LOW obstacles ----
      // The car clears an obstacle if its underside is above the obstacle's top
      // by JUMP_CLEAR_HEIGHT. Trucks/tall blocks are too high to clear.
      if (player.airborne) {
        const top = CFG.OBSTACLE_TOP[e.type] ?? 1.2;
        if (player.bottomHeight() >= top + CFG.JUMP_CLEAR_HEIGHT) {
          if (!e.cleared) { e.cleared = true; handlers.onClear?.(e); }
          continue; // sailed over it
        }
      }

      const sideSign = (px < e.x) ? -1 : 1; // spin away from contact

      // barrier: SCRAPE — repeatable along its length, no hit-flag, no slowdown
      if (e.type === 'barrier') { handlers.onKnock?.(e, sideSign); continue; }

      if (e.hit) continue;             // already resolved this entity
      e.hit = true;

      // ramp: launches the player into a big jump (no damage)
      if (e.kind === 'ramp') { if (!e.used) { e.used = true; handlers.onRamp?.(e); } continue; }

      // knock-aside obstacles (cones): smash through, +points, no spin
      if (e.kind === 'knock') { handlers.onKnock?.(e, sideSign); continue; }

      let kind = e.kind;
      if (e.oncoming && e.kind === 'heavy') kind = 'headon';
      handlers.onImpact?.(e, kind, sideSign);
      continue;
    }

    // ---- near miss ---- (passed close, alongside, not collected/hit)
    if (!e.notified && e.type !== 'coin') {
      const closeX = dx < (phw + e.w + CFG.NEARMISS_DIST) && dx >= (phw + e.w);
      const alongside = Math.abs(dz) < (phl + e.l);
      if (closeX && alongside) {
        e.notified = true;
        handlers.onNearMiss?.(e);
      }
    }
  }
}
