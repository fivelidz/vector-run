// terrain.js — visual THEMES that change over distance with smooth crossfades.
// A theme is purely cosmetic (sky/fog/ground/road/light/scenery prop set); the
// road LAYOUT (lanes, oncoming, median) is owned by sections.js. Themes cycle by
// distance, lerping every color over a transition window so the change is smooth.
import * as THREE from 'three';
import { CFG } from './config.js';
const CFG_VISIBLE_AHEAD = CFG.VISIBLE_AHEAD;
const CFG_VISIBLE_BEHIND = CFG.VISIBLE_BEHIND;

// scenery prop kinds a theme can request (built in road.js):
//   'lamp' | 'tree' | 'sign' | 'cactus' | 'pine' | 'building' | 'rock' | 'billboard'
export const THEMES = [
  {
    id: 'day', name: 'Day Plains',
    sky: 0x9fd3ff, fog: 0xbfe0ff, fogNear: 90, fogFar: 210,
    ground: 0x3f7d4f, groundAlt: 0x4a8a5a, road: 0x7a8090,
    sunColor: 0xfff4e0, sunInt: 1.15, hemiSky: 0xcfeaff, hemiGround: 0x3a4a32, hemiInt: 0.85, ambInt: 0.25,
    props: ['lamp', 'tree', 'sign'], night: false,
  },
  {
    id: 'sunset', name: 'Sunset Desert',
    sky: 0xffb36b, fog: 0xffc98e, fogNear: 70, fogFar: 190,
    ground: 0xd9a566, groundAlt: 0xc99356, road: 0x8a8092,
    sunColor: 0xffd9a0, sunInt: 1.3, hemiSky: 0xffd9a8, hemiGround: 0x8a6a3a, hemiInt: 0.8, ambInt: 0.3,
    props: ['cactus', 'rock', 'sign'], night: false,
  },
  {
    id: 'night', name: 'Night City',
    sky: 0x0c1024, fog: 0x141a33, fogNear: 60, fogFar: 175,
    ground: 0x1a2030, groundAlt: 0x202840, road: 0x5e6472,
    sunColor: 0x9fb4ff, sunInt: 0.45, hemiSky: 0x2a3358, hemiGround: 0x0a0e1a, hemiInt: 0.55, ambInt: 0.35,
    props: ['building', 'billboard', 'lamp'], night: true,
  },
  {
    id: 'forest', name: 'Deep Forest',
    sky: 0x88c98f, fog: 0x9fd4a6, fogNear: 55, fogFar: 165,
    ground: 0x2f6438, groundAlt: 0x37713f, road: 0x6f7484,
    sunColor: 0xe8ffd8, sunInt: 1.0, hemiSky: 0xb8e6bf, hemiGround: 0x24461f, hemiInt: 0.85, ambInt: 0.28,
    props: ['pine', 'tree', 'rock'], night: false,
  },
  {
    id: 'snow', name: 'Snowfield',
    sky: 0xd8e8f5, fog: 0xeaf2fa, fogNear: 60, fogFar: 185,
    ground: 0xeef4fb, groundAlt: 0xdfe9f4, road: 0x7c8496,
    sunColor: 0xffffff, sunInt: 1.05, hemiSky: 0xf0f6ff, hemiGround: 0xc6d4e2, hemiInt: 0.95, ambInt: 0.4,
    props: ['pine', 'rock', 'sign'], night: false,
  },
  {
    id: 'dusk', name: 'Dusk Highway',
    sky: 0x8a5da6, fog: 0xb07db5, fogNear: 70, fogFar: 195,
    ground: 0x44506a, groundAlt: 0x4c5874, road: 0x736f86,
    sunColor: 0xffb0d0, sunInt: 0.9, hemiSky: 0xc89adf, hemiGround: 0x33304a, hemiInt: 0.75, ambInt: 0.32,
    props: ['building', 'lamp', 'tree'], night: true,
  },
];

const THEME_DISTANCE = 1800; // metres each theme lasts (longer = less frequent)
const TRANSITION = 600;      // metres over which colours crossfade (smooth, gradual)

export class Terrain {
  constructor(engine, road) {
    this.engine = engine;
    this.road = road;
    this.index = 0;
    this.next = 1;
    this.blend = 0; // 0..1 across the transition
    // working color objects (avoid allocations)
    this._c = {
      sky: new THREE.Color(), fog: new THREE.Color(), ground: new THREE.Color(),
      groundAlt: new THREE.Color(), roadCol: new THREE.Color(), sun: new THREE.Color(),
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
    };
    this.current = THEMES[0];
    this.reset();
  }

  reset() {
    this.index = 0; this.next = 1; this.blend = 0;
    this.current = THEMES[0];
    this._propThemeId = THEMES[0].id;
    this._forced = null;
    this._lastBase = 0;
    this._applyInstant(THEMES[0]);
    this.road.setTheme(THEMES[0]);
  }

  themeAt(dist) {
    return THEMES[Math.floor(dist / THEME_DISTANCE) % THEMES.length];
  }

  // force a specific theme by id (null resumes cycling)
  forceTheme(id) {
    if (!id) { this._forced = null; return; }
    const t = THEMES.find((x) => x.id === id);
    if (!t) return;
    this._forced = t; this._propThemeId = t.id; this.current = t;
    this.road.setTheme(t); // lighting eases toward it over time in update()
  }

  update(distance, dt = 1 / 60) {
    if (this._forced) {
      this._applyBlend(this._forced, this._forced, 0, dt); // eases over time
      return { name: this._forced.name, night: this._forced.night };
    }
    const cycle = distance / THEME_DISTANCE;
    const baseIdx = Math.floor(cycle) % THEMES.length;
    const into = (distance % THEME_DISTANCE); // metres into current theme
    const a = THEMES[baseIdx];
    const b = THEMES[(baseIdx + 1) % THEMES.length];

    // transition happens in the LAST `TRANSITION` metres of the theme
    let t = 0;
    if (into > THEME_DISTANCE - TRANSITION) {
      t = (into - (THEME_DISTANCE - TRANSITION)) / TRANSITION; // 0..1
      // at the very start of the window, drop an intersection at the horizon as
      // the visual "seam" you drive through into the new biome
      if (this._transBase !== baseIdx) { this._transBase = baseIdx; this.road.triggerIntersection?.(); }
    }
    // swap scenery props to theme `b` midway through the fade, so new props
    // stream in from the horizon while colours are still blending (no hard jump)
    const propTheme = (t > 0.55) ? b : a;
    if (this._propThemeId !== propTheme.id) {
      this._propThemeId = propTheme.id;
      this.current = propTheme;
      this.road.setTheme(propTheme);
    }
    this._lastBase = baseIdx;
    this.blend = t;
    this._applyBlend(a, b, t, dt);
    return { name: t > 0.5 ? b.name : a.name, night: (t > 0.5 ? b : a).night };
  }

  _lerpColor(out, hexA, hexB, t) {
    out.setHex(hexA);
    if (t > 0) out.lerp(new THREE.Color(hexB), t);
    return out;
  }

  _applyBlend(a, b, t, dt = 1 / 60, instant = false) {
    const e = this.engine, c = this._c;
    const tFar = clamp01(t / 0.7);
    const tNear = clamp01((t - 0.3) / 0.7);

    // ---- compute TARGET values (staggered far->near across the window) ----
    const tgt = {
      sky: this._lerpColor(new THREE.Color(), a.sky, b.sky, tFar).clone(),
      // fog = SKY colour so the ground fades seamlessly into the sky at the
      // horizon (no sharp line). Blend slightly toward the theme fog for haze.
      fog: this._lerpColor(new THREE.Color(), a.sky, b.sky, tFar).clone()
        .lerp(this._lerpColor(new THREE.Color(), a.fog, b.fog, tFar), 0.35),
      fogNear: a.fogNear + (b.fogNear - a.fogNear) * tNear,
      fogFar: a.fogFar + (b.fogFar - a.fogFar) * tFar,
      hills: this._lerpColor(new THREE.Color(), a.groundAlt, b.groundAlt, tFar).clone(),
      sun: this._lerpColor(new THREE.Color(), a.sunColor, b.sunColor, t).clone(),
      sunInt: a.sunInt + (b.sunInt - a.sunInt) * t,
      hemiSky: this._lerpColor(new THREE.Color(), a.hemiSky, b.hemiSky, t).clone(),
      hemiGround: this._lerpColor(new THREE.Color(), a.hemiGround, b.hemiGround, t).clone(),
      hemiInt: a.hemiInt + (b.hemiInt - a.hemiInt) * t,
      ambInt: a.ambInt + (b.ambInt - a.ambInt) * t,
      ground: this._lerpColor(new THREE.Color(), a.ground, b.ground, tNear).clone(),
      roadCol: this._lerpColor(new THREE.Color(), a.road, b.road, tNear).clone(),
    };

    // ---- ease the ACTUAL state toward targets over TIME (no jumps, ever) ----
    if (!this._s || instant) this._s = tgt;
    else {
      const al = 1 - Math.exp(-dt * 0.7); // ~1.4s time constant (gentler, less jumpy)
      const s = this._s;
      s.sky.lerp(tgt.sky, al); s.fog.lerp(tgt.fog, al); s.hills.lerp(tgt.hills, al);
      s.sun.lerp(tgt.sun, al); s.hemiSky.lerp(tgt.hemiSky, al); s.hemiGround.lerp(tgt.hemiGround, al);
      s.ground.lerp(tgt.ground, al); s.roadCol.lerp(tgt.roadCol, al);
      s.fogNear += (tgt.fogNear - s.fogNear) * al;
      s.fogFar += (tgt.fogFar - s.fogFar) * al;
      s.sunInt += (tgt.sunInt - s.sunInt) * al;
      s.hemiInt += (tgt.hemiInt - s.hemiInt) * al;
      s.ambInt += (tgt.ambInt - s.ambInt) * al;
    }
    const s = this._s;

    // ---- apply the smoothed state ----
    e.scene.background = s.sky;
    if (e.scene.fog) { e.scene.fog.color.copy(s.fog); e.scene.fog.near = s.fogNear; e.scene.fog.far = s.fogFar; }
    e.renderer.setClearColor(s.sky, 1);
    if (this.road.hillsMesh) this.road.hillsMesh.material.color.copy(s.hills);
    if (e.sun) { e.sun.color.copy(s.sun); e.sun.intensity = s.sunInt; }
    if (e.hemi) { e.hemi.color.copy(s.hemiSky); e.hemi.groundColor.copy(s.hemiGround); e.hemi.intensity = s.hemiInt; }
    if (e.amb) e.amb.intensity = s.ambInt;

    // GROUND + ROAD: spatial horizon sweep during distance transitions; the
    // time-smoothed uniform colours otherwise (covers forced-theme changes too).
    if (t > 0 && t < 1) {
      const from = -CFG_VISIBLE_AHEAD, to = CFG_VISIBLE_BEHIND;
      const boundaryZ = from + (to - from) * t;
      this.road.setGroundBlend(boundaryZ, a.ground, b.ground, a.road, b.road);
    } else {
      this.road.setColors(s.ground, s.ground, s.roadCol);
    }
  }

  _applyInstant(theme) {
    this._lastBase = 0;
    this._applyBlend(theme, theme, 0, 1 / 60, true); // instant (run start only)
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
