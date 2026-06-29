// sections.js — road "biome" templates + difficulty director that streams them.
// A section is active for a stretch of distance; it sets lane layout, oncoming
// lanes, median, blocked lanes, and which hazards/pickups can spawn.
import { CFG } from './config.js';

// Each template: function(difficulty) -> config + length range.
const TEMPLATES = {
  open: (d) => ({
    name: 'Open Highway', lanes: 5, oncomingLanes: 0, median: false,
    blockedLanes: [], allowObstacles: true, allowCoins: true,
    minLen: 280, maxLen: 460, weight: 1.0 - d * 0.4,
  }),
  rush: (d) => ({
    name: 'Rush Hour', lanes: 5, oncomingLanes: 0, median: false,
    blockedLanes: [], allowObstacles: false, allowCoins: true,
    dense: true, minLen: 240, maxLen: 420, weight: 0.5 + d * 0.7,
  }),
  twoway: (d) => ({
    name: 'Two-Way', lanes: 5, oncomingLanes: 2, median: false,
    blockedLanes: [], allowObstacles: false, allowCoins: true,
    minLen: 220, maxLen: 380, weight: 0.25 + d * 0.6,
  }),
  median: (d) => ({
    name: 'Median Split', lanes: 5, oncomingLanes: 2, median: true,
    blockedLanes: [], allowObstacles: true, allowCoins: true,
    minLen: 260, maxLen: 400, weight: 0.3 + d * 0.4,
  }),
  construction: (d) => ({
    name: 'Construction', lanes: 5, oncomingLanes: 0, median: false,
    blockedLanes: [d > 0.5 ? 0 : 4], allowObstacles: true, allowCoins: false,
    minLen: 200, maxLen: 320, weight: 0.3 + d * 0.5,
  }),
};

const ORDER = ['open', 'rush', 'twoway', 'median', 'construction'];

export class SectionDirector {
  constructor() { this.reset(); }

  reset() {
    this.difficulty = 0;
    this.current = TEMPLATES.open(0);
    this.current.startDist = 0;
    this.current.len = lerp(this.current.minLen, this.current.maxLen, Math.random());
    this.nextAt = this.current.len;
    this.prevKey = 'open';
  }

  update(distance) {
    this.difficulty = Math.min(1, distance / CFG.DIFF_RAMP_DISTANCE);
    if (distance >= this.nextAt) {
      this._pickNext(distance);
    }
    return this.current;
  }

  _pickNext(distance) {
    const d = this.difficulty;
    // weighted random, avoid repeating same template back-to-back
    const candidates = ORDER.filter((k) => k !== this.prevKey).map((k) => {
      const c = TEMPLATES[k](d);
      return { key: k, cfg: c, w: Math.max(0.05, c.weight) };
    });
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total, chosen = candidates[0];
    for (const c of candidates) { r -= c.w; if (r <= 0) { chosen = c; break; } }

    const cfg = chosen.cfg;
    cfg.startDist = distance;
    cfg.len = lerp(cfg.minLen, cfg.maxLen, Math.random()) * (1 - d * 0.25); // shorter as harder
    this.current = cfg;
    this.prevKey = chosen.key;
    this.nextAt = distance + cfg.len;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
