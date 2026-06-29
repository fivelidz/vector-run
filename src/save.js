// save.js — localStorage persistence
const KEY = 'vectorrun.save.v1';

const DEFAULT = {
  best: 0,
  coins: 0,
  car: 'classic',
  owned: ['classic'],
  settings: { steer: 'free', sound: true, music: true, quality: 'high' },
};

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw), settings: { ...DEFAULT.settings, ...(JSON.parse(raw).settings || {}) } };
  } catch (e) {}
  return structuredClone(DEFAULT);
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

export const Save = {
  get: () => data,
  get best() { return data.best; },
  get coins() { return data.coins; },
  get car() { return data.car; },
  get owned() { return data.owned; },
  get settings() { return data.settings; },

  recordRun(dist, coins) {
    if (dist > data.best) data.best = Math.floor(dist);
    data.coins += coins;
    save();
  },
  setCar(id) { data.car = id; save(); },
  buyCar(id, cost) {
    if (data.owned.includes(id)) { data.car = id; save(); return true; }
    if (data.coins >= cost) { data.coins -= cost; data.owned.push(id); data.car = id; save(); return true; }
    return false;
  },
  setSetting(k, v) { data.settings[k] = v; save(); },
};
