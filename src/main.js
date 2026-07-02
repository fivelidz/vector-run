// main.js — bootstrap + game state machine + fixed-step loop.
import { CFG, CARS } from './config.js';
import { Engine } from './engine.js';
import { Input } from './input.js';
import { Road } from './road.js';
import { Terrain } from './terrain.js';
import { SectionDirector } from './sections.js';
import { Player, PStates } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Enemies } from './enemies.js';
import { checkCollisions } from './collisions.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { Save } from './save.js';
import { tryLoadGLB, setCarNight, makeExitSign } from './assets.js';

const GS = { MENU: 'menu', PLAY: 'play', PAUSE: 'pause', OVER: 'over' };

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.engine = new Engine(this.canvas);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.fx = new FX(this.engine.scene);
    this.hud = new HUD();

    this.road = new Road(this.engine.scene);
    this.terrain = new Terrain(this.engine, this.road);
    this.director = new SectionDirector();
    this.traffic = new Traffic(this.engine.scene, this.road);
    this.police = new Police(this.engine.scene, this.road, this.traffic);
    this.enemies = new Enemies(this.engine.scene, this.road, this.traffic, this.police);

    // overhead EXIT sign (reused for exit events)
    this.exitSign = makeExitSign(this.road.halfRoad);
    this.exitSign.visible = false;
    this.engine.scene.add(this.exitSign);

    this.player = null; // built on play (uses chosen car color)

    this.state = GS.MENU;
    this.score = 0;
    this.runCoins = 0;
    this.comboMult = 1;
    this.comboTimer = 0;
    this.overReason = 'wrecked';

    this._acc = 0;
    this._last = performance.now();
    this._fps = 60; this._fpsTimer = 0; this._fpsCount = 0;

    this._setupMenus();
    this._applySettings();
    this._loop = this._loop.bind(this);

    // initial player so menu has a car visible idling
    this._buildPlayer();
    this.player.mesh.position.z = -2;

    this.menus.hideLoading();
    this.menus.showMenu();
    requestAnimationFrame(this._loop);

    // try swap GLB models in background (non-blocking)
    this._tryAssets();
  }

  _buildPlayer() {
    const car = CARS.find((c) => c.id === Save.car) || CARS[0];
    if (this.player) this.engine.scene.remove(this.player.mesh);
    this.player = new Player(this.engine.scene, car.color);
    this.player.setLaneCount(CFG.NUM_LANES);
  }

  async _tryAssets() {
    // Procedural meshes render reliably from the chase camera (the Meshy GLB
    // convertible read as a dark interior from behind). Procedural is the default.
  }

  _setupMenus() {
    this.menus = new Menus({
      audio: this.audio,
      onPlay: () => this.startRun(),
      onRetry: () => this.startRun(),
      onResume: () => { this._last = performance.now(); this._acc = 0; this.state = GS.PLAY; this.hud.show(); },
      onQuit: () => { this.state = GS.MENU; this.hud.hide(); this.menus.showMenu(); this._buildPlayer(); this.player.mesh.position.z = -2; },
      onPause: () => { if (this.state === GS.PLAY) { this.state = GS.PAUSE; this.menus.showPause(); } },
    });
    this.menus.onCarChange = () => { this._buildPlayer(); this.player.mesh.position.z = -2; };
    this.menus.onSteerChange = (m) => this.input.setMode(m);
    this.menus.onQualityChange = (q) => this.engine.setQuality(q);
    this.menus.onTuneChange = (k, v) => { CFG.TUNE[k] = v; };
    this.menus.onTuneReset = () => {
      const def = { steerMaxVel: 11, steerAccel: 6.0, grip: 4.5, laneMagnet: 2.2 };
      Object.assign(CFG.TUNE, def);
      for (const k in def) Save.setTune(k, def[k]);
      // refresh slider positions
      const ids = { 'tune-accel': 'steerAccel', 'tune-grip': 'grip', 'tune-vel': 'steerMaxVel', 'tune-magnet': 'laneMagnet' };
      for (const id in ids) { const el = document.getElementById(id); if (el) el.value = def[ids[id]]; }
    };

    this.input.bindButtons({
      brakeBtn: document.getElementById('btn-brake'),
    });
    this.input.bindJumpButton(document.getElementById('btn-jump'));
    // keyboard pause
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Escape' || e.code === 'KeyP')) {
        if (this.state === GS.PLAY) { this.state = GS.PAUSE; this.menus.showPause(); }
        else if (this.state === GS.PAUSE) { this._last = performance.now(); this._acc = 0; this.state = GS.PLAY; this.menus.hidePause(); this.hud.show(); }
      }
    });
  }

  _applySettings() {
    const s = Save.settings;
    this.input.setMode(s.steer);
    this.engine.setQuality(s.quality);
    this.audio.setEnabled(s.sound);
    this.audio.setMusic(s.music);
    Object.assign(CFG.TUNE, Save.tune); // apply persisted steering feel
  }

  startRun() {
    this.audio.init(); this.audio.resume(); this.audio.startEngine();
    this._buildPlayer();
    this.player.reset();
    this.player.mesh.position.z = 0;
    this.traffic.reset();
    this.police.reset();
    this.enemies.reset();
    this.director.reset();
    this.terrain.reset();
    this._night = false;
    this._appliedOncoming = 0; this._appliedMedian = false; this._pendingLayout = null; this._pendingLayoutIn = 0;
    this.road.setOncomingLanes(0); this.road.setMedian(false); // start one-way
    this._lastKm = 0;
    this._exit = null;                    // active exit event
    this._nextExitAt = 700 + Math.random() * 500; // distance of first exit prompt
    this._desertUntil = 0;                // distance until which desert area lasts
    this.traffic.desert = false;
    this.hud.clearWanted();
    this.score = 0; this.runCoins = 0; this.comboMult = 1; this.comboTimer = 0;
    this._acc = 0; this._last = performance.now(); // fresh clock for the run
    this.state = GS.PLAY;
    this.hud.show();
  }

  _gameOver(reason) {
    if (this.state === GS.OVER) return;
    this.overReason = reason;
    this.state = GS.OVER;
    this.audio.stopAll();  // kill engine/siren immediately
    this.audio.bust();     // single bust sting
    const dist = this.player.distance;
    const isBest = Math.floor(dist) > Save.best;
    Save.recordRun(dist, this.runCoins);
    setTimeout(() => {
      this.hud.hide();
      this.menus.showGameOver(reason, dist, this.score, this.runCoins, isBest);
    }, 1100);
  }

  // ---- fixed-step update ----
  _step(dt) {
    if (this.state !== GS.PLAY) return;
    const p = this.player;

    this.input.poll();
    const laneDir = this.input.takeLaneDir();
    if (laneDir && this.input.mode === 'snap') {
      p.steerSnap(laneDir, this.road);
    }
    // jump
    if (this.input.takeJump()) {
      if (p.jump()) { this.fx.smoke(p.x, 0.3, 0, 8); this.audio.jump?.(); }
    }
    // section (road layout). The director picks the NEXT layout, but a layout
    // CHANGE (oncoming/median flip) is deferred: we announce it with an
    // intersection that scrolls in, and only APPLY the new layout (clearing
    // traffic) once that intersection reaches the player — so two-way roads
    // always begin AFTER the intersection, never abruptly mid-traffic.
    const section = this.director.update(p.distance);
    this.traffic.setDifficulty(this.director.difficulty);
    this.traffic.thin = this.enemies.cars.some((c) => c.mesh.visible && c.alive) ? CFG.ENEMY_NPC_THIN : 1;

    const layoutChanged = section.oncomingLanes !== this._appliedOncoming || section.median !== this._appliedMedian;
    if (layoutChanged && !this._pendingLayout) {
      // schedule the change at an incoming intersection. Track our OWN countdown
      // distance (independent of the shared intersection mesh used by terrain/exit).
      this._pendingLayout = { oncomingLanes: section.oncomingLanes, median: section.median };
      this._pendingLayoutIn = CFG.VISIBLE_AHEAD; // travel this far before it applies
      this.road.triggerIntersection?.();
      this.hud.combo(section.oncomingLanes > 0 ? '⇅ TWO-WAY AHEAD' : 'JUNCTION AHEAD', '#ffd23f');
    }
    if (this._pendingLayout) {
      this._pendingLayoutIn -= p.speed * dt; // distance travelled this frame
      if (this._pendingLayoutIn <= 0) {
        // intersection reached the player: clear ALL traffic & apply the new layout
        this.traffic.clearAll();
        this._appliedOncoming = this._pendingLayout.oncomingLanes;
        this._appliedMedian = this._pendingLayout.median;
        this.road.setMedian(this._pendingLayout.median);
        this.road.setOncomingLanes(this._pendingLayout.oncomingLanes);
        this._pendingLayout = null;
      }
    }
    p.setLaneCount(section.lanes);

    // IMPORTANT: traffic uses the *applied* layout (not the pending director one)
    // so oncoming cars only start spawning AFTER we've crossed the intersection.
    const activeSection = {
      ...section,
      oncomingLanes: this._appliedOncoming,
      median: this._appliedMedian,
    };

    // terrain (visual theme) — changes over distance with crossfade
    const terr = this.terrain.update(p.distance);
    if (terr.night !== this._night) {
      this._night = terr.night;
      setCarNight(p.mesh, this._night);
      this.traffic.setNight(this._night);
      if (p.headlight) p.headlight.intensity = this._night ? CFG.HEADLIGHT_INTENSITY : 0;
    }

    // player physics
    const before = p.distance;
    p.update(dt, this.input, this.road, {
      onWreck: (r) => this._gameOver('wrecked'),
      onLand: (x) => { this.fx.smoke(x, 0.2, 0, 10); this.engine.addShake(0.18); this.audio.land?.(); },
    });
    const distDelta = p.distance - before;

    // tyre tracks: continuous faint marks; darker when steering hard or braking
    this.fx.updateTracks(distDelta);
    if (p.state === 'drive' && !p.airborne && p.speed > 4) {
      this._trackDist = (this._trackDist || 0) + distDelta;
      if (this._trackDist >= 2.2) {
        this._trackDist = 0;
        const skid = (Math.abs(p.vx) > 6 || this.input.brake) ? 1 : 0.25;
        this.fx.dropTrack(p.x, skid);
      }
    }

    // exit-lane events (Temple-Run style branch into new areas)
    this._updateExits(distDelta, p);

    // scroll road & spawn/move traffic
    this.road.update(distDelta);
    this.traffic.update(dt, p.speed, activeSection, null);

    // collisions
    checkCollisions(p, this.traffic, {
      onImpact: (e, kind, side) => {
        const ok = p.impact(kind, side, e.speed || 0);
        if (ok) {
          this.engine.addShake(kind === 'light' ? 0.2 : kind === 'headon' ? 0.8 : 0.5);
          this.fx.sparks(p.x, 0.8, 0, kind === 'light' ? 6 : 14, 0xffd23f);
          if (kind !== 'light') this.fx.smoke(p.x, 0.5, 0, 8);
          this.audio.crash(kind !== 'light');
          this.comboMult = 1; this.comboTimer = 0; // break combo on hit
          // the NPC we hit veers off & crashes too (flung away from the player)
          if (e.type === 'car' || e.type === 'truck' || e.type === 'block') {
            e.knocked = true;
            e.knockVX = -side * (5 + Math.random() * 6); // away from player
            e.knockVY = 2 + Math.random() * 3;
            e.knockSpin = (Math.random() - 0.5) * 10 - side * 4;
            this.fx.smoke(e.x, 0.5, e.z, 8);
          }
          // a crash raises the wanted level (cops appear after 2 crashes)
          if (kind !== 'light') {
            const res = this.police.registerCollision();
            if (res === 'counted') {
              this.hud.combo(this.police.active ? '🚓 WANTED!' : 'CRASH!', '#ff5d5d');
            }
          }
        }
      },
      onNearMiss: (e) => {
        this.comboMult = Math.min(8, this.comboMult + 1);
        this.comboTimer = 2.2;
        const bonus = CFG.NEARMISS_SCORE * this.comboMult;
        this.score += bonus;
        if (this.comboMult > 1) this.audio.combo(); else this.audio.nearMiss();
        this.hud.combo((this.comboMult > 1 ? `x${this.comboMult} ` : '') + 'CLOSE!', '#5dff9b');
      },
      onCoin: (e) => {
        e.mesh.visible = false;
        this.runCoins += 1;
        this.score += CFG.COIN_VALUE;
        this.fx.coinBurst(e.x, 1.1, 0);
        this.audio.coin();
      },
      onPowerup: (e) => {
        e.mesh.visible = false;
        p.grantPowerup('invincible');
        this.fx.coinBurst(e.x, 1.2, 0);
        this.fx.sparks(p.x, 0.9, 0, 18, 0xffd23f);
        this.audio.powerup();
        this.hud.combo('★ INVINCIBLE!', '#ffd23f');
      },
      onSmash: (e, side) => {
        // invincible smash-through: fling the NPC/obstacle, +points, no penalty
        e.knocked = true;
        e.knockVX = -side * (7 + Math.random() * 6);
        e.knockVY = 3 + Math.random() * 4;
        e.knockSpin = (Math.random() - 0.5) * 14;
        this.score += 40;
        this.fx.sparks(e.x, 0.7, e.z, 14, 0xffd23f);
        this.fx.smoke(e.x, 0.5, e.z, 8);
        this.engine.addShake(0.2);
        this.audio.crash(false);
      },
      onRamp: (e) => {
        if (p.launch()) {
          this.fx.smoke(p.x, 0.3, 0, 12);
          this.fx.sparks(p.x, 0.5, 0, 10, 0xffb02e);
          this.engine.addShake(0.3);
          this.audio.boost();
          this.hud.combo('LAUNCH!', '#ffb02e');
        }
      },
      onKnock: (e, side) => {
        if (e.type === 'barrier') {
          // SCRAPE a barrier: shower of sparks + screech, NO slowdown, small score.
          // (debounced so a sustained scrape doesn't spam) — barrier stays put.
          e.hit = false; // allow repeated scraping along its length
          const now = performance.now();
          if (now - (this._lastScrape || 0) > 90) {
            this._lastScrape = now;
            this.score += 5;
            this.fx.sparks(p.x + side * 0.7, 0.5, 0, 6, 0xffd23f);
            this.audio.screech?.();
            this.engine.addShake(0.06);
          }
        } else {
          // cone: knock it aside (+points, tiny slow)
          e.knocked = true;
          e.knockVX = side * (6 + Math.random() * 5);
          e.knockVY = 4 + Math.random() * 3;
          e.knockSpin = (Math.random() - 0.5) * 12;
          p.speed *= 0.97;
          this.score += 30;
          this.fx.sparks(e.x, 0.6, e.z, 8, 0xffae42);
          this.audio.crash(false);
          this.hud.combo('+30', '#ffae42');
        }
      },
      onClear: (e) => {
        // sailed over an obstacle: stylish bonus + small combo bump
        this.comboMult = Math.min(8, this.comboMult + 1);
        this.comboTimer = 2.2;
        this.score += CFG.NEARMISS_SCORE * this.comboMult;
        this.audio.nearMiss();
        this.hud.combo('AIR! x' + this.comboMult, '#4ea3ff');
      },
    });

    // police (visual pursuit only — collision counting handled in onImpact)
    this.police.update(dt, p, this.director.difficulty, (ev, d) => {
      if (ev === 'hazard') this.hud.combo('ROADBLOCK!', '#ff5d5d');
      if (ev === 'busted') this._gameOver('busted');
      if (ev === 'escaped') { this.score += 500; this.hud.combo('ESCAPED! +500', '#5dff9b'); }
      if (ev === 'copCrash') { this.fx.sparks(d?.x ?? p.x, 0.8, d?.z ?? 8, 18, 0x4ea3ff); this.fx.smoke(d?.x ?? p.x, 0.5, d?.z ?? 8, 10); this.audio.crash(true); this.score += 250; this.hud.combo('COP WRECKED! +250', '#4ea3ff'); }
    }, activeSection);

    // distance milestones (every 1km) — score bonus + callout
    const km = Math.floor(p.distance / 1000);
    if (km > (this._lastKm || 0)) { this._lastKm = km; this.score += 200; this.hud.combo(km + ' KM! +200', '#ffd23f'); }

    // enemy gang cars (drive ahead, lob grenades; ram them off the road)
    this.enemies.update(dt, p, this.police.active, (ev, data) => {
      if (ev === 'shoot') this.audio.throwSfx();
      if (ev === 'enemyHitNPC') { this.fx.sparks(data.x, 0.7, data.z, 10, 0xffae42); this.audio.crash(false); }
      if (ev === 'enemyHitCop') { this.fx.sparks(data.x, 0.8, data.z, 16, 0x4ea3ff); this.fx.smoke(data.x, 0.5, data.z, 8); this.audio.crash(true); this.hud.combo('COP DOWN!', '#4ea3ff'); }
      if (ev === 'explode') {
        // explosion FX at the landing spot (always visible)
        this.fx.sparks(data.x, 0.6, data.z, 24, 0xff7d2a);
        this.fx.smoke(data.x, 0.5, data.z, 14);
        this.engine.addShake(data.hit ? 0.6 : 0.25);
        this.audio.explode();
        // only hurts you if you were on the spot (and not protected)
        if (data.hit && !p.isInvuln() && !(p.hasInvincible && p.hasInvincible())) {
          p.impact('heavy', (Math.random() < 0.5 ? -1 : 1), 0);
          this.police.registerCollision();
        }
      }
    });
    // ram an enemy car off the road for points
    if (p.state === 'drive') {
      const rammed = this.enemies.checkRam(p);
      if (rammed) {
        this.score += 150;
        this.fx.sparks(rammed.x, 0.8, rammed.z, 18, 0xff5d5d);
        this.fx.smoke(rammed.x, 0.5, rammed.z, 10);
        this.engine.addShake(0.4);
        this.audio.crash(true);
        this.hud.combo('+150 SMASH!', '#ff5d5d');
      }
    }

    // scoring (distance based)
    this.score += distDelta * CFG.SCORE_PER_M;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboMult = 1; }

    // fx + audio
    this.fx.update(dt);
    this.audio.updateEngine(p.speed01(), this.police.stars);

    // camera
    this.engine.updateCamera(p.x, p.speed01(), dt);

    // HUD
    this.hud.update({
      distance: p.distance, score: this.score, speed: p.speed,
      heat: this.police.heat, stars: this.police.stars, bust: this.police.bust,
    });
  }

  // EXIT events: a sign appears; be in the exit lane (far right) when you reach
  // it to branch into a new area (desert). Miss it and you stay on the highway.
  _updateExits(distDelta, p) {
    // end the desert area after its stretch
    if (this.traffic.desert && p.distance > this._desertUntil) {
      this.traffic.desert = false;
      this.terrain.forceTheme?.(null); // back to normal cycling
      this.audio.setMusicTrack?.('music');
      this.hud.combo('BACK ON THE HIGHWAY', '#ffd23f');
    }

    // schedule a new exit
    if (!this._exit && p.distance > this._nextExitAt && !this.traffic.desert) {
      const exitLane = CFG.NUM_LANES - 1; // far-right lane
      this._exit = { lane: exitLane, z: -CFG.VISIBLE_AHEAD * 0.95, announced: false, taken: false };
      this.exitSign.position.set(this.road.laneX(exitLane), 0, this._exit.z);
      this.exitSign.visible = true;
      this.hud.combo('EXIT AHEAD → KEEP RIGHT', '#5dff9b');
    }

    if (this._exit) {
      const e = this._exit;
      e.z += distDelta;
      this.exitSign.position.z = e.z;
      // pulse the arrow
      if (this.exitSign.userData.arrow) this.exitSign.userData.arrow.position.y = 6.9 + Math.sin(performance.now() * 0.006) * 0.2;

      // decision point: when the sign reaches the player (wide window for high speed)
      if (!e.taken && e.z > -6) {
        e.taken = true;
        const inLane = Math.abs(p.x - this.road.laneX(e.lane)) < CFG.LANE_WIDTH * 0.7;
        if (inLane) {
          // took the exit -> desert area for a stretch
          this.traffic.desert = true;
          this._desertUntil = p.distance + 900;
          this.terrain.forceTheme?.('sunset'); // sandy desert palette
          this.road.triggerIntersection?.();
          this.audio.whoosh();
          this.audio.setMusicTrack?.('musicDesert');
          this.hud.combo('EXIT TAKEN! 🏜️ DESERT', '#ffb36b');
          this.score += 300;
        }
      }
      // despawn the sign after it passes
      if (e.z > CFG.VISIBLE_BEHIND + 8) {
        this.exitSign.visible = false;
        this._exit = null;
        this._nextExitAt = p.distance + 900 + Math.random() * 700;
      }
    }
  }

  _loop(now) {
    const raw = (now - this._last) / 1000;
    this._last = now;
    const dt = Math.min(0.05, raw); // clamp big gaps

    // fixed-step accumulator for stable physics
    if (this.state === GS.PLAY) {
      const FIXED = 1 / 60;
      this._acc += dt;
      // hard cap so a stall/tab-switch can never spiral the sim forward
      if (this._acc > FIXED * 4) this._acc = FIXED * 4;
      let steps = 0;
      while (this._acc >= FIXED && steps < 4) { this._step(FIXED); this._acc -= FIXED; steps++; }
    } else {
      this._acc = 0; // don't bank time while paused / in menus
      // idle scene: gently rotate menu car & still render
      if (this.player && this.state === GS.MENU) {
        this.player.mesh.rotation.y = Math.sin(now * 0.0006) * 0.35;
        this.engine.updateCamera(0, 0.2, dt);
      }
    }

    // perf monitor → auto-degrade
    this._fpsCount++; this._fpsTimer += raw;
    if (this._fpsTimer >= 1) {
      this._fps = this._fpsCount; this._fpsCount = 0; this._fpsTimer = 0;
      if (this._fps < 40 && this.engine.quality !== 'low' && Save.settings.quality === 'high') {
        this.engine.setQuality('med');
      }
    }

    this.engine.render();
    requestAnimationFrame(this._loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.__game = new Game(); }
  catch (e) { console.error(e); document.getElementById('loading').innerHTML = '<div class="load-txt">Error: ' + e.message + '</div>'; }
});
