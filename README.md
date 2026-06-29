# Vector Run 🚗💨

A **3D cartoony infinite-runner** for phones. You drive a getaway car the wrong
way through freeway traffic at ever-increasing speed, dodging cars, trucks,
cones, barriers, oncoming traffic and median strips — while the **police heat**
builds behind you and cruisers, roadblocks and spike strips try to take you down.

Built with **Three.js**, runs in any modern mobile browser, fully offline
(Three.js is vendored). Low-poly cartoon art, with optional **Meshy.ai**
generated GLB car models that swap in over the procedural fallbacks.

![gameplay](docs/gameplay.png)

---

## Play

```bash
cd vector_run
python3 -m http.server 8099
# open http://localhost:8099 in Chrome (desktop or phone)
```

On a phone: serve the folder and open it in the mobile browser, or wrap in a
WebView/Capacitor. Landscape is recommended; portrait also works.

### Controls
| | Touch | Keyboard |
|---|---|---|
| Steer | swipe / tap left-right half (lane-snap) or drag (free) | ← → / A D |
| **Jump** | **swipe up** or **JUMP button** | **Space** |
| Boost | hold BOOST pedal | Shift / W / ↑ |
| Brake | hold BRAKE pedal | S / ↓ |
| Pause | ❚❚ button | Esc / P |

Switch lane-snap ↔ free steering in **Settings**.

**Jump** to sail over cones, barriers, spike strips and same-direction cars for
an "AIR!" bonus — but trucks and police blocks are too tall to clear.

---

## Mechanics (what makes it feel good)

- **Always forward, always faster** — speed ramps with distance.
- **The spin** — hitting traffic sharply slows you, sends the car into a
  spin-out, and triggers a **transparent ghost-flash** of i-frames so you can
  recover instead of instantly chain-dying. Head-on (oncoming) hits spin hardest.
- **Near-misses** build a style multiplier (score + a little heat).
- **Heat / Wanted ★1–5** — reckless driving, boosting and speeding raise heat.
  Stay clean and it cools down (you "lose them"). Stars spawn pursuing cruisers,
  then roadblocks (★★★) and spike strips (★★★★). A **bust meter** fills while a
  cruiser is on you — fill it and you're BUSTED.
- **Road sections** stream procedurally: Open Highway, Rush Hour, Two-Way
  (oncoming!), Median Split, Construction (closed lanes). They get harder & faster.
- **Pickups**: coins (currency) — bait into risky lanes.
- Cosmetic **car unlocks** bought with coins.

---

## Project layout

```
index.html            shell + import map (offline three.js)
css/style.css         HUD + menus
vendor/               vendored three.module.js, GLTFLoader (offline)
src/
  main.js             bootstrap, game state machine, fixed-step loop
  config.js           ALL tunable constants + palette + car roster
  engine.js           renderer, scene, camera, lights, shake
  input.js            touch + keyboard → intent (snap & free steering)
  road.js             endless freeway: lanes, dashes, median, themed scenery
  terrain.js          evolving visual THEMES (6 biomes, crossfade by distance)
  sections.js         road-layout templates + difficulty director
  player.js           car physics + impact→spin→flash→recover state machine
  traffic.js          pooled traffic/obstacles/pickups + roadblock/spike spawners
  police.js           heat/wanted system + cruiser AI + bust meter
  collisions.js       AABB overlap, near-miss, dispatch
  fx.js               pooled particles (sparks/smoke/coins) + combo popups
  audio.js            WebAudio synth engine, siren, crash sfx (no asset files)
  hud.js              DOM HUD + overlays
  menus.js            menu / gameover / pause / cars / settings
  save.js             localStorage best/coins/cars/settings
  assets.js           procedural low-poly models + GLB swap-in (buildModel)
tools/
  meshy_assets.py     Meshy.ai text-to-3D pipeline (preview/status/download)
  smoke_test.js       headless Playwright: load, drive, impact, screenshot
  stress_test.js      headless: force ★★★★★, roadblocks, busted path
docs/GDD.md           full game design document
assets/models/        downloaded Meshy GLBs + manifest.json
```

---

## Art assets (Meshy.ai)

Procedural low-poly models ship by default so the game runs with **zero
downloads**. To (re)generate the nicer GLB models:

```bash
cd tools
python3 meshy_assets.py preview     # submit text-to-3D tasks
python3 meshy_assets.py status      # poll until SUCCEEDED
python3 meshy_assets.py download    # download GLBs + write manifest.json
```

`assets/models/manifest.json` gates which models the game tries to load — if it's
absent, the procedural fallback is used silently (no 404s). On **Low** quality
the game uses procedural meshes for performance.

Uses `MESHY_API_KEY` from env or `bannerlord_guns/.env`.

---

## Testing

```bash
# (server must be running on :8099)
bash tools/run_tests.sh      # runs ALL suites below, starts server if needed

# or individually:
node tools/smoke_test.js     # core loop: drive, collide, spin, screenshot
node tools/flow_test.js      # full UI: menu→play→pause→gameover→retry→cars→settings
node tools/jump_test.js      # jump arc, clears cone, hit by truck
node tools/terrain_test.js   # 6 biomes distinct, screenshots biome_*.png
node tools/stress_test.js    # high-heat: 5 stars, roadblocks, busted path
```

All run headless via Playwright + the cached Chromium and assert no page errors.

---

## Status

**M1 + M2 + extras complete and playable.** Endless road, lane steering (snap &
free), **jump** (clears low obstacles, "AIR!" bonus), traffic + oncoming +
obstacles, the signature spin/flash collision, near-miss combos, full police
heat/wanted system with cruisers + roadblocks + spike strips + bust meter,
procedural road-layout sections, **6 evolving terrain themes** that crossfade by
distance (Day / Sunset Desert / Night City / Forest / Snow / Dusk, with
theme-specific scenery), HUD, menus, car select, synth audio, coins, Meshy GLB
models wired in, particles, screen shake, auto perf-degrade. 5 headless test
suites, all green.

See `docs/GDD.md` for the full design and roadmap (M3 polish, M4 device tuning).
