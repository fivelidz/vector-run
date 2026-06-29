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
import { tryLoadGLB, setCarNight } from './assets.js';

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
    this.enemies = new Enemies(this.engine.scene, this.road, this.traffic);

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
  }

  startRun() {
    this.audio.init(); this.audio.resume();
    this._buildPlayer();
    this.player.reset();
    this.player.mesh.position.z = 0;
    this.traffic.reset();
    this.police.reset();
    this.enemies.reset();
    this.director.reset();
    this.terrain.reset();
    this._night = false;
    this._lastOncoming = 0; this._lastMedian = false;
    this._lastKm = 0;
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
    this.audio.bust();
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
    // section (road layout)
    const section = this.director.update(p.distance);
    this.traffic.setDifficulty(this.director.difficulty);
    // detect a layout change (oncoming/median) and transition cleanly:
    // clear far-ahead conflicting traffic + briefly pause spawns so cars never
    // appear to drive the wrong way in a lane that just flipped direction.
    if (section.oncomingLanes !== this._lastOncoming || section.median !== this._lastMedian) {
      this._lastOncoming = section.oncomingLanes;
      this._lastMedian = section.median;
      this.traffic.beginTransition(section);
      this.hud.combo(section.oncomingLanes > 0 ? '⇅ TWO-WAY AHEAD' : 'ONE-WAY AHEAD', '#ffd23f');
    }
    this.road.setMedian(section.median);
    this.road.setOncomingLanes(section.oncomingLanes);
    p.setLaneCount(section.lanes);

    // terrain (visual theme) — changes over distance with crossfade
    const terr = this.terrain.update(p.distance);
    if (terr.night !== this._night) {
      this._night = terr.night;
      setCarNight(p.mesh, this._night);
      this.traffic.setNight(this._night);
    }

    // player physics
    const before = p.distance;
    p.update(dt, this.input, this.road, {
      onWreck: (r) => this._gameOver('wrecked'),
      onLand: (x) => { this.fx.smoke(x, 0.2, 0, 10); this.engine.addShake(0.18); this.audio.land?.(); },
    });
    const distDelta = p.distance - before;

    // scroll road & spawn/move traffic
    this.road.update(distDelta);
    this.traffic.update(dt, p.speed, section, null);

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
        this.audio.nearMiss();
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
        this.audio.coin();
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
          this.audio.jump?.();
          this.hud.combo('LAUNCH!', '#ffb02e');
        }
      },
      onKnock: (e, side) => {
        // smash a cone/barrier aside: knock it off, small slow, points, no spin
        e.knocked = true;
        e.knockVX = side * (6 + Math.random() * 5);
        e.knockVY = 4 + Math.random() * 3;
        e.knockSpin = (Math.random() - 0.5) * 12;
        p.speed *= 0.94;
        const pts = e.type === 'barrier' ? 60 : 30;
        this.score += pts;
        this.fx.sparks(e.x, 0.6, e.z, e.type === 'barrier' ? 14 : 8, e.type === 'barrier' ? 0xff7d5d : 0xffae42);
        this.engine.addShake(0.15);
        this.audio.crash(false);
        this.hud.combo('+' + pts, '#ffae42');
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
    this.police.update(dt, p, this.director.difficulty, (ev) => {
      if (ev === 'hazard') this.hud.combo('ROADBLOCK!', '#ff5d5d');
      if (ev === 'busted') this._gameOver('busted');
      if (ev === 'escaped') { this.score += 500; this.hud.combo('ESCAPED! +500', '#5dff9b'); }
    }, section);

    // distance milestones (every 1km) — score bonus + callout
    const km = Math.floor(p.distance / 1000);
    if (km > (this._lastKm || 0)) { this._lastKm = km; this.score += 200; this.hud.combo(km + ' KM! +200', '#ffd23f'); }

    // enemy gang cars (shoot at you; you can ram them off the road)
    this.enemies.update(dt, p, this.police.active, (ev, c) => {
      if (ev === 'shoot') this.audio.click?.();
      if (ev === 'bulletHit') {
        // a bullet connected: small spin + counts toward the bust streak
        if (p.impact('light', (Math.random() < 0.5 ? -1 : 1), 0)) {}
        this.engine.addShake(0.25);
        this.fx.sparks(p.x, 0.9, 0, 10, 0xffd23f);
        this.audio.crash(false);
        const res = this.police.registerCollision();
        if (res === 'wreck') this._gameOver('busted');
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
