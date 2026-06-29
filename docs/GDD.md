# Vector Run — Game Design Document

> A 3D cartoony infinite-runner where you weave a getaway car through freeway
> traffic at ever-increasing speed, outrunning the police.

---

## 1. High Concept

**Vector Run** is a 3D endless runner in the spirit of geometry-dodging games
(Geometry Dash, Subway Surfers, Smashy Road), but on a **freeway**. The player
is always zooming *forward*. They steer a getaway car left/right across lanes,
dodging oncoming and same-direction traffic, road obstacles, and median strips,
while a police presence builds behind them. The goal is **distance** — go as far
as you can before you're caught or wrecked.

The aesthetic is **low-poly cartoony** (think *Crossy Road* meets *Art of Rally*),
NOT photorealistic. Bright, saturated, chunky shapes, soft shadows.

### Pillars
1. **Flow & speed** — constant forward motion, the world rushing at you.
2. **Readable danger** — you can always see what's coming and react.
3. **Juicy feedback** — impacts feel chunky: slow-down, spin, transparent flash.
4. **Escalating tension** — police heat rises; near-misses are rewarded.

---

## 2. Core Loop

```
SPAWN → accelerate forward → dodge traffic & obstacles → near-miss = score+heat
   → hit something = slow down + spin + flash (vulnerable) → recover or get caught
   → speed ramps up → road sections change → eventually wrecked/busted → score → retry
```

Each run:
- Distance increases score continuously (1 pt / meter).
- Near-misses add bonus + style multiplier.
- Coins/cash pickups optional (currency for unlocks).
- Police "wanted" meter fills from reckless driving & time; at max → cruisers
  spawn and chase. Getting hit while chased = busted faster.

---

## 3. Mechanics

### 3.1 Movement
- Car auto-drives forward. Forward speed `v` starts at `BASE_SPEED` and ramps
  with distance up to `MAX_SPEED`.
- Player controls **lateral** position only (steer left/right).
- Two control schemes (both active):
  - **Lane-snap** (default, mobile-friendly): swipe / arrow keys move one lane
    at a time, car eases between lane centers.
  - **Free-steer** (analog): drag finger / hold A-D for continuous lateral
    velocity. Toggle in settings.
- Lateral movement has acceleration + damping for a weighty feel.

### 3.2 Speed & ramp
- `speed = lerp(BASE, MAX, clamp(distance / RAMP_DISTANCE))`.
- Speed also modulated by **impact state** (see collisions) and a small
  player boost (tap boost button → short burst, costs nothing but raises heat).

### 3.3 Collisions ("the spin")
The signature feel. When the player car hits an obstacle/traffic:
1. **Impact** — speed drops sharply (`speed *= IMPACT_SLOWDOWN`, e.g. ×0.35).
2. **Spin** — car yaws (spins) by an impulse proportional to impact angle &
   speed; visually rotates 1–3 times while sliding.
3. **Transparent flash** — car material flashes: alternating opacity + emissive
   tint (i-frames / "ghosted" look) for `INVULN_TIME` (~1.2 s). During this the
   car can pass through traffic (so you don't instantly chain-die).
4. **Recovery** — spin damps out, car re-aligns to forward, speed rebuilds.
5. **Caught state** — if speed is dragged below `CAUGHT_SPEED` for too long
   (repeated hits, or police ramming), the run ends ("Busted!" / "Wrecked!").

Light obstacles (cones, debris) = small slowdown, no full spin.
Heavy (cars, barriers, walls) = full spin.
Head-on with oncoming traffic = biggest spin.

### 3.4 Jump
A core dodge option. Trigger via **swipe-up**, the **JUMP button** (HUD center),
or **Space** / keyboard. The car launches into a parabolic arc (~2.2 m apex,
~0.75 s airtime) with squash-and-stretch and takeoff/landing dust + camera dip.

- While airborne you can **clear LOW obstacles**: cones, barriers, **spike strips**,
  and even same-direction traffic cars — if your underside is above their top by
  `JUMP_CLEAR_HEIGHT`. Sailing over something gives an **"AIR!" style bonus**.
- **Tall obstacles can't be cleared**: trucks/buses and parked police blocks are
  too high — you'll still hit them. So jump is powerful but not a panacea.
- You can't jump while spinning/wrecked or already airborne; short landing
  cooldown. Steering still works (slightly reduced) in the air.
- Per `config.js`: `JUMP_VELOCITY`, `JUMP_GRAVITY`, `JUMP_CLEAR_HEIGHT`,
  `OBSTACLE_TOP` (per-type clear heights).

### 3.5 Near-miss
- Passing within `NEARMISS_DIST` of a hazard without touching →
  "Close!" popup, +score, +style multiplier, small +heat.
- Encourages threading the needle instead of playing safe.

### 3.5 Police / Wanted system
- **Heat meter** (0–100) fills from: time survived, boosting, near-misses,
  reckless lane-weaving, driving in oncoming lanes.
- Heat thresholds = **Wanted stars** (1–5):
  - ★ patrol notices you (siren SFX, lights in mirror/behind).
  - ★★ one cruiser spawns behind, tries to catch up & ram.
  - ★★★ two cruisers + roadblocks appear ahead occasionally.
  - ★★★★ spike strips, helicopter spotlight, faster cruisers.
  - ★★★★★ heavy: SWAT van rammers, frequent roadblocks.
- Cruisers are AI cars that pursue from behind and try to pit/ram you. Ramming
  causes a spin + adds "bust" progress.
- **Cooldown**: not hitting anything & not boosting for a while slowly lowers
  heat (you "lose them"). This creates a risk/reward rhythm.
- **Busted** when a bust meter fills (from sustained contact while at high heat).

### 3.6 Road sections (procedural "biomes")
The freeway is assembled from **section templates** that stream in. Each defines
lane layout, traffic rules, obstacle palette, and scenery. Transitions blend.

| Section | Description | Hazards |
|---|---|---|
| **Open Highway** | 4 lanes, same direction, sparse | slow trucks, cars |
| **Rush Hour** | 4–5 lanes, dense same-direction traffic | tight gaps |
| **Two-Way** | divided: 2 forward + 2 **oncoming** lanes | head-on cars (deadly) |
| **Median Split** | central concrete median strip you can't cross | forces lane choice |
| **Construction** | lane closed, cones, barriers, diggers, plates | narrow path |
| **Toll / Booths** | pillars between lanes, must pick a gate | pillar walls |
| **Bridge** | guardrails on edges, no shoulder | falling off = wreck |
| **Night City** | neon, headlights, reduced visibility | same + dazzle |
| **Roadworks Detour** | crosses to oncoming side temporarily | head-on + cones |
| **Police Checkpoint** | (high heat) roadblock of cruisers across lanes | must dodge gap |

Sections get harder/faster as distance grows (difficulty director picks templates
weighted by current difficulty tier).

### 3.7 Obstacles (full list)
- **Traffic cars** (sedans, hatchbacks) — same-dir (slower) & oncoming (fast).
- **Trucks / semis** — long, block 1 lane, slow.
- **Buses** — long, same.
- **Police cruisers** — AI pursuers.
- **Cones** — light, tiny slowdown, knock aside.
- **Barriers / jersey walls** — heavy, full stop-ish.
- **Median strip** — continuous wall, impassable, defines drivable region.
- **Oil slick** — no slowdown but reduces steering grip (slippery) briefly.
- **Spike strip** (police) — instant big slow + heavy spin.
- **Roadblock** — line of cars/cruisers with one gap.
- **Construction plate / pothole** — bump, tiny slow.
- **Debris / tire** — light.
- **Toll pillars** — heavy, thin.

### 3.8 Pickups
- **Coins / cash** — currency, line them up to bait risky lanes.
- **Nitro** — temporary speed + invuln, fun reward.
- **Repair** — resets impact/heat slightly (rare).
- **Shield** — one free hit.

---

## 4. Controls

| Action | Touch | Keyboard |
|---|---|---|
| Steer left | swipe/drag left, or tap left half | ← / A |
| Steer right | swipe/drag right, or tap right half | → / D |
| Boost | hold boost button (bottom-right) | Shift / W |
| Brake (small) | hold brake button | ↓ / S |
| Pause | top-right button | Esc / P |

- Lane-snap: discrete swipe.
- Free-steer: continuous drag/hold.
- Tilt steering: optional (devicemotion), off by default.

---

## 5. Camera
- Chase camera behind & slightly above the car, looking forward down the road.
- Slight FOV widening with speed (sense of acceleration).
- Screen shake on impact. Subtle sway on hard steer.
- During spin, camera stays stable-ish (doesn't spin with car) so player keeps
  orientation; a vignette + desaturation pulses during invuln.

---

## 5b. Terrain Themes (evolving environments)

Separate from road **layout** sections, the world's **look** evolves over
distance through cosmetic **themes** (`terrain.js`). Each theme is a full
environment: sky color, fog color + distance, ground & road colors, sun/ambient
lighting, day/night flag, and a **roadside prop palette**. Themes cycle every
~1200 m and **crossfade smoothly** (all colors lerp over the last ~260 m) so the
transition is seamless rather than a hard cut.

| # | Theme | Look | Props |
|---|---|---|---|
| 1 | **Day Plains** | blue sky, green fields | lamps, trees, signs |
| 2 | **Sunset Desert** | orange sky, sandy ground, warm light | cacti, rocks |
| 3 | **Night City** | dark sky, dim ambient, neon | buildings (lit windows), billboards, lamps |
| 4 | **Deep Forest** | rich greens, misty fog | layered pines, trees, rocks |
| 5 | **Snowfield** | white ground, pale sky, cool light | pines, rocks |
| 6 | **Dusk Highway** | purple/pink twilight | buildings, lamps, trees |

Then it loops. Night themes brighten lamp/window/billboard emissives. Difficulty
and speed keep ramping independently, so deeper themes are also harder & faster.
Adding a new theme = one entry in the `THEMES` array.

## 6. Visual Style
- **Low-poly cartoony.** Flat-ish shading with a single key directional light +
  soft ambient + hemisphere. Cars are chunky, rounded, saturated colors.
- Toon-ish: optional rim light / slight outline.
- Environment: flat ground planes, simple hills/buildings as billboards or low
  boxes streaming past, lamp posts, signs, trees as low-poly.
- Color-coded danger: oncoming cars have a subtle red headlight tint; police =
  blue/red flashing; safe pickups = gold/green glow.
- **Meshy-generated GLB models** for hero assets (player car, a few traffic cars,
  truck, cruiser, cones, barrier). Fallback: procedural box-cars (so the game
  runs even with zero downloaded assets).

---

## 7. Audio
- Engine drone (pitch tracks speed), via WebAudio oscillator/synth (no asset dep).
- Crash thud + metallic scrape on impact.
- Tyre screech on hard steer / oil.
- Police siren loop when wanted ≥1 (panned, rising with proximity).
- Near-miss whoosh.
- Pickup chime.
- Light synth music loop (optional, toggle).
- All synthesized in WebAudio so it works offline with no files; sample files
  can be dropped into `assets/audio/` later and will be used if present.

---

## 8. HUD / UI
- **Top-left**: distance (m) + score.
- **Top-center**: wanted stars (★) + heat bar.
- **Top-right**: pause.
- **Bottom-right**: boost button. **Bottom-left**: brake.
- **Speed**: subtle speedometer arc bottom-center.
- **Combo/style**: floating multiplier near car on near-miss streak.
- **Game over card**: "WRECKED" / "BUSTED", distance, best, coins, Retry / Menu.
- **Main menu**: title, Play, car select (unlocks), settings.
- Big, thumb-reachable, landscape-first; also works portrait.

---

## 9. Progression / Meta (light)
- Currency: coins from runs.
- Unlock cosmetic cars (color/shape swaps) — pure cosmetic, no pay-to-win.
- Daily best distance, persistent via localStorage.
- Difficulty rises within a run; no separate levels (it's endless).

---

## 10. Technical Architecture

- **Engine:** Three.js (WebGL), runs in any modern mobile browser. No build step;
  ES modules via import map from a vendored Three.js (works offline).
- **No server needed** — static files. Can be wrapped in a WebView/Capacitor later
  for the phone, or just opened in Chrome on the Redmi.
- **Module layout** (`src/`):
  - `main.js` — bootstrap, game state machine, RAF loop.
  - `config.js` — all tunable constants.
  - `engine.js` — renderer, scene, camera, lights, post.
  - `input.js` — touch + keyboard + tilt → intent.
  - `road.js` — endless road, lanes, section streaming, scenery.
  - `sections.js` — section/biome templates & difficulty director.
  - `player.js` — player car physics, spin/impact state machine.
  - `traffic.js` — traffic + obstacle spawning & movement (object pools).
  - `police.js` — wanted/heat system + cruiser AI.
  - `collisions.js` — AABB checks, impact resolution.
  - `fx.js` — particles, flash/ghost, screen shake, popups.
  - `audio.js` — WebAudio synth engine, siren, sfx.
  - `hud.js` — DOM HUD + overlays.
  - `assets.js` — GLB loader w/ procedural fallback, model registry.
  - `save.js` — localStorage best/coins/settings.
- **Object pooling** for traffic/particles (mobile perf).
- **Fixed-ish timestep** physics with accumulator; render interpolated.
- Target **60fps** on mid phones; degrade particle counts on low FPS.

---

## 11. Asset Plan (Meshy)
Generate cartoony low-poly GLBs:
1. `player_car` — sleek cartoon getaway sports car, glossy, rounded.
2. `traffic_sedan` — generic cartoon sedan.
3. `traffic_hatchback` — small cartoon hatchback.
4. `truck` — cartoon box truck / semi cab+trailer.
5. `police_cruiser` — cartoon police car, light bar.
6. `cone` — traffic cone.
7. `barrier` — jersey/road barrier.
All prompted "low-poly, cartoon, clean, single object, neutral background".
Pipeline mirrors `bannerlord_guns/scripts/meshy_ammo.py`. Procedural fallbacks
guarantee the game is playable immediately, models swap in when downloaded.

---

## 12. Milestones
- **M1 (Greybox playable):** road scroll, box player car, lane steer, box traffic,
  collision→spin→flash, distance HUD, game over. ← *first workable state*
- **M2 (Systems):** sections/biomes, oncoming + median, police heat + cruisers,
  near-miss, pickups, audio.
- **M3 (Juice & art):** Meshy models, particles, screen shake, menus, unlocks,
  scenery, night mode.
- **M4 (Polish/perf):** tuning, mobile perf, settings, testing on device.

---

## 13. Risks
- Mobile WebGL perf → keep poly/particle budgets low, pool everything.
- Meshy turnaround/credits → procedural fallback ensures no blocker.
- Touch steering feel → ship both lane-snap & free-steer, tune.
