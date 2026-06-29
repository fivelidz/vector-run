// hud.js — DOM HUD updates + overlay management.
import { CFG } from './config.js';
import { comboPopup } from './fx.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      dist: document.getElementById('hud-distance'),
      score: document.getElementById('hud-score'),
      stars: document.getElementById('hud-stars'),
      heat: document.getElementById('heatbar-fill'),
      speedoVal: document.getElementById('speedo-val'),
      combo: document.getElementById('combo-pop'),
      bustMeter: document.getElementById('bust-meter'),
      bustFill: document.getElementById('bust-fill'),
      app: document.getElementById('app'),
    };
    this._lastStars = -1;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  update(state) {
    this.el.dist.textContent = Math.floor(state.distance) + ' m';
    this.el.score.textContent = Math.floor(state.score).toLocaleString();
    this.el.speedoVal.textContent = Math.round(state.speed * 3.6); // m/s -> km/h
    this.el.heat.style.width = (state.heat / CFG.HEAT_MAX * 100).toFixed(0) + '%';

    if (state.stars !== this._lastStars) {
      this._lastStars = state.stars;
      this.el.stars.textContent = '★'.repeat(state.stars) + '☆'.repeat(5 - state.stars);
      this.el.app.classList.toggle('wanted', state.stars >= 2);
    }

    if (state.bust > 1) {
      this.el.bustMeter.classList.remove('hidden');
      this.el.bustFill.style.setProperty('--bust', (state.bust / CFG.BUST_MAX * 100).toFixed(0) + '%');
    } else {
      this.el.bustMeter.classList.add('hidden');
    }
  }

  combo(text, color) { comboPopup(this.el.combo, text, color); }
  clearWanted() { this.el.app.classList.remove('wanted'); this._lastStars = -1; }
}
