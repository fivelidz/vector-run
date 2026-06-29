// config.js — all tunable game constants live here.
// Units: world is in "metres". Z is forward (player drives toward -Z visually,
// but we keep player near z=0 and move the world toward +Z = simpler math).
// We use: car stays at fixed z; road & traffic move toward camera (+Z).

export const CFG = {
  // ---- Road / lanes ----
  LANE_WIDTH: 3.4,          // metres per lane
  NUM_LANES: 5,             // total drivable lanes in widest section
  ROAD_SHOULDER: 1.6,       // shoulder width each side
  SEGMENT_LEN: 20,          // length of one road segment (for scrolling tiles)
  VISIBLE_AHEAD: 220,       // how far ahead we spawn/draw
  VISIBLE_BEHIND: 40,       // how far behind before despawn

  // ---- Speed (metres / second) ----
  BASE_SPEED: 28,           // starting forward speed
  MAX_SPEED: 95,            // top speed from distance ramp
  RAMP_DISTANCE: 4500,      // metres to reach MAX_SPEED
  BOOST_MULT: 1.45,         // boost speed multiplier
  BOOST_HEAT: 14,           // heat/sec while boosting
  BRAKE_MULT: 0.55,         // brake target multiplier

  // ---- Lateral steering (target-X spring model, vector-runner feel) ----
  // Live-tunable steering (adjust via Settings sliders; persisted to save).
  // Drifty feel = lower grip, lower steerAccel. Twitchy = higher both.
  TUNE: {
    steerMaxVel: 11,        // max lateral speed (m/s) at full steer
    steerAccel: 6.0,        // how fast you reach that speed (lower = floatier)
    grip: 4.5,              // how fast lateral velocity bleeds off (lower = more drift)
    laneMagnet: 2.2,        // release aim-assist strength toward nearest lane
  },
  GRIP: 1.0,
  // legacy
  STEER_ACCEL: 46, STEER_MAX: 13, STEER_DAMP: 7, LANE_CENTER_PULL: 8,
  LANE_SNAP_PULSE: 9.5, LANE_SNAP_TIME: 0.14, FREE_STEER_ACCEL: 46, FREE_STEER_MAX: 13,

  // ---- Collisions / spin (toned down — more vector-runner, less spin-out) ----
  CAR_HALF_W: 0.72,         // player car half-width (collision)
  CAR_HALF_L: 1.5,          // player car half-length
  IMPACT_SLOWDOWN_HEAVY: 0.55,    // less harsh than before (was .32)
  IMPACT_SLOWDOWN_LIGHT: 0.88,
  IMPACT_SLOWDOWN_HEADON: 0.4,
  SPIN_IMPULSE: 3.2,        // much smaller wobble, not full multi-spin (was 9)
  SPIN_DAMP: 4.2,           // decays faster
  INVULN_TIME: 1.0,         // i-frames after a heavy hit
  RECOVER_RATE: 1.6,        // rebuild speed faster (less stuck-slow)
  CAUGHT_SPEED: 10,         // below this for too long => wrecked
  CAUGHT_TIME: 2.6,         // seconds below CAUGHT_SPEED before wreck

  // ---- Jump ----
  JUMP_VELOCITY: 11.5,      // initial upward velocity (m/s)
  JUMP_GRAVITY: 30,         // downward accel while airborne (m/s^2)
  JUMP_PEAK: 2.2,           // approx apex height (derived; used for clear-check)
  JUMP_CLEAR_HEIGHT: 0.35,  // car bottom must exceed obstacle top by this to clear
  JUMP_COOLDOWN: 0.18,      // brief lockout after landing (s)
  JUMP_AIR_STEER: 0.85,     // steering effectiveness while airborne (frac)
  OBSTACLE_TOP: {           // approximate top height (m) of each obstacle type
    cone: 0.95, barrier: 1.0, car: 1.55, truck: 2.7, block: 1.8, coin: 1.4, ramp: 1.3,
  },

  // ---- Near miss ----
  NEARMISS_DIST: 1.3,       // extra metres beyond collision box = "close!"
  NEARMISS_SCORE: 25,
  NEARMISS_HEAT: 2.5,

  // ---- Police (collision-count pursuit; cops never collide/slow you) ----
  COLLISIONS_TO_CHASE: 2,   // crashes before police start chasing
  COLLISION_WINDOW: 45,     // seconds: streak resets / cops lose you after this
  COLLISION_COOLDOWN: 0.7,  // debounce so one crash counts once (not per-frame)
  POLICE_TAIL_DIST: 9,      // metres behind player (in view, ahead of camera)
  POLICE_CLOSE_RATE: 0.8,   // how fast they ease to the tail position
  POLICE_MAX_SPEED: 62,     // cop top speed — outrun them by going faster than this
  HEAT_MAX: 100,            // kept for HUD bar scale
  STAR_THRESHOLDS: [1, 2, 3, 4, 5], // HUD stars derive from collisions
  BUST_MAX: 100,
  BUST_FILL_RATE: 45,       // bust meter fill/sec while a cop is on your bumper
  BUST_DRAIN_RATE: 35,      // bust meter drain/sec when you've shaken them off

  // ---- Traffic spawning (row-based, guaranteed passable) ----
  ROW_GAP_MIN: 24,          // min metres between forward rows (hard, late game)
  ROW_GAP_MAX: 48,          // max metres between forward rows (easy, early)
  ROW_FILL_BASE: 0.45,      // chance a non-open forward lane is filled (early)
  ROW_FILL_MAX: 0.78,       // chance a non-open forward lane is filled (late)
  TRAFFIC_SPEED_SAME: [16, 24],   // same-direction traffic speed range
  ONCOMING_SPEED: [30, 42],       // oncoming closing speed (relative feel)
  // legacy
  TRAFFIC_GAP_MIN: 14,
  TRAFFIC_GAP_MAX: 46,

  // ---- Enemy (gang) cars ----
  ENEMY_FIRST_DELAY: 25,    // seconds before enemies can first appear
  ENEMY_INTERVAL: 16,       // seconds between enemy spawns
  ENEMY_MAX: 2,             // max enemy cars at once
  ENEMY_LEAD_DIST: 10,      // metres they drive AHEAD of the player to attack
  ENEMY_FIRE_INTERVAL: 2.6, // seconds between grenade lobs
  GRENADE_SPEED: 9,         // grenade backward speed (slow & dodgeable)
  GRENADE_FUSE: 2.5,        // seconds a landed grenade sits before auto-detonating
  ENEMY_NPC_THIN: 0.45,     // multiply NPC fill chance while enemies are present

  // ---- Power-ups ----
  PU_INVINCIBLE_TIME: 7.0,  // seconds of smash-through invincibility
  PU_SPAWN_CHANCE: 0.045,   // rare — chance an open lane gets the invincibility pickup

  // ---- Scoring ----
  SCORE_PER_M: 1.0,
  COIN_VALUE: 5,

  // ---- Camera ----
  HEADLIGHT_INTENSITY: 3.0, // player real SpotLight strength at night
  CAM_HEIGHT: 5.0,
  CAM_BACK: 13.5,
  CAM_LOOK_AHEAD: 18,
  CAM_FOV_BASE: 60,
  CAM_FOV_SPEED: 16,        // extra FOV degrees at max speed
  SHAKE_DECAY: 7,

  // ---- Difficulty director ----
  DIFF_RAMP_DISTANCE: 6000, // metres to reach max difficulty tier
};

// Cartoony palette
export const PAL = {
  road:       0x6f7588,
  roadLine:   0xf4d35e,
  roadEdge:   0xe8e8ec,
  shoulder:   0x2a2f3d,
  grass:      0x3f7d4f,
  grassAlt:   0x4a8a5a,
  median:     0x9aa0ad,
  sky:        0x9fd3ff,
  fog:        0xbfe0ff,
  player:     0xffd23f,
  traffic:    [0x4ea3ff, 0xff7d5d, 0x7d5dff, 0x5dff9b, 0xff5dc4, 0xffae42, 0x42d4ff],
  truck:      0xd8d8e0,
  police:     0x1c2233,
  cone:       0xff7a1a,
  barrier:    0xff5d5d,
  coin:       0xffd23f,
};

// Car roster (cosmetic). id, name, color, cost.
export const CARS = [
  { id: 'classic', name: 'Drifter',   color: 0xffd23f, cost: 0 },
  { id: 'blue',    name: 'Bolt',      color: 0x4ea3ff, cost: 200 },
  { id: 'red',     name: 'Inferno',   color: 0xff4d4d, cost: 350 },
  { id: 'green',   name: 'Viper',     color: 0x5dff9b, cost: 500 },
  { id: 'purple',  name: 'Phantom',   color: 0x9d6dff, cost: 800 },
  { id: 'mono',    name: 'Stealth',   color: 0x2b3040, cost: 1200 },
];
