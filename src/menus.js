// menus.js — wires up DOM overlays (menu, gameover, pause, cars, settings).
import { Save } from './save.js';
import { CARS } from './config.js';

export class Menus {
  constructor({ onPlay, onRetry, onResume, onQuit, onPause, audio }) {
    this.audio = audio;
    this.cb = { onPlay, onRetry, onResume, onQuit, onPause };
    this.el = {
      menu: document.getElementById('menu'),
      gameover: document.getElementById('gameover'),
      pause: document.getElementById('pause'),
      cars: document.getElementById('cars'),
      settings: document.getElementById('settings'),
      loading: document.getElementById('loading'),
      bestDist: document.getElementById('best-dist'),
      coinTotal: document.getElementById('coin-total'),
      goTitle: document.getElementById('go-title'),
      goDist: document.getElementById('go-dist'),
      goScore: document.getElementById('go-score'),
      goCoins: document.getElementById('go-coins'),
      goBest: document.getElementById('go-best'),
      carGrid: document.getElementById('car-grid'),
    };
    this._bind();
    this.refreshMenu();
  }

  _click(id, fn) {
    const e = document.getElementById(id);
    if (e) e.addEventListener('click', () => { this.audio?.init(); this.audio?.resume(); this.audio?.click(); fn(); });
  }

  _bind() {
    this._click('btn-play', () => { this.hideAll(); this.cb.onPlay(); });
    this._click('btn-retry', () => { this.hideAll(); this.cb.onRetry(); });
    this._click('btn-resume', () => { this.el.pause.classList.add('hidden'); this.cb.onResume(); });
    this._click('btn-quit', () => { this.el.pause.classList.add('hidden'); this.cb.onQuit(); });
    this._click('btn-menu', () => { this.hideAll(); this.refreshMenu(); this.el.menu.classList.remove('hidden'); });
    this._click('btn-pause', () => this.cb.onPause());

    this._click('btn-cars', () => { this.buildCars(); this.el.menu.classList.add('hidden'); this.el.cars.classList.remove('hidden'); });
    this._click('btn-cars-back', () => { this.el.cars.classList.add('hidden'); this.refreshMenu(); this.el.menu.classList.remove('hidden'); });
    this._click('btn-settings', () => { this.el.menu.classList.add('hidden'); this.el.settings.classList.remove('hidden'); });
    this._click('btn-settings-back', () => { this.el.settings.classList.add('hidden'); this.el.menu.classList.remove('hidden'); });

    // settings bindings
    const s = Save.settings;
    const steer = document.getElementById('opt-steer');
    if (steer) { steer.value = s.steer; steer.addEventListener('change', () => { Save.setSetting('steer', steer.value); this.onSteerChange?.(steer.value); }); }
    const snd = document.getElementById('opt-sound'); snd.checked = s.sound;
    snd.addEventListener('change', () => { Save.setSetting('sound', snd.checked); this.audio?.setEnabled(snd.checked); });
    const mus = document.getElementById('opt-music'); mus.checked = s.music;
    mus.addEventListener('change', () => { Save.setSetting('music', mus.checked); this.audio?.setMusic(mus.checked); });
    const q = document.getElementById('opt-quality'); q.value = s.quality;
    q.addEventListener('change', () => { Save.setSetting('quality', q.value); this.onQualityChange?.(q.value); });
  }

  hideAll() {
    for (const k of ['menu', 'gameover', 'pause', 'cars', 'settings', 'loading']) this.el[k].classList.add('hidden');
  }

  refreshMenu() {
    this.el.bestDist.textContent = Save.best;
    this.el.coinTotal.textContent = Save.coins;
  }

  showMenu() { this.hideAll(); this.refreshMenu(); this.el.menu.classList.remove('hidden'); }
  hideLoading() { this.el.loading.classList.add('hidden'); }

  showGameOver(reason, dist, score, coins, isBest) {
    this.el.goTitle.textContent = reason === 'busted' ? 'BUSTED' : 'WRECKED';
    this.el.goDist.textContent = Math.floor(dist);
    this.el.goScore.textContent = Math.floor(score).toLocaleString();
    this.el.goCoins.textContent = coins;
    this.el.goBest.textContent = isBest ? '🏆 NEW BEST!' : 'Best: ' + Save.best + ' m';
    this.el.gameover.classList.remove('hidden');
  }

  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }

  buildCars() {
    const grid = this.el.carGrid;
    grid.innerHTML = '';
    for (const car of CARS) {
      const owned = Save.owned.includes(car.id);
      const sel = Save.car === car.id;
      const cell = document.createElement('div');
      cell.className = 'car-cell' + (sel ? ' sel' : '') + (owned ? '' : ' locked');
      const sw = document.createElement('div');
      sw.className = 'car-swatch';
      sw.style.background = '#' + car.color.toString(16).padStart(6, '0');
      cell.appendChild(sw);
      const label = document.createElement('div');
      label.textContent = owned ? car.name : `🔒 ${car.cost}🪙`;
      cell.appendChild(label);
      cell.addEventListener('click', () => {
        this.audio?.click();
        if (owned) { Save.setCar(car.id); }
        else if (Save.buyCar(car.id, car.cost)) { /* bought */ }
        else { return; }
        this.refreshMenu();
        this.buildCars();
        this.onCarChange?.(Save.car);
      });
      grid.appendChild(cell);
    }
  }
}
