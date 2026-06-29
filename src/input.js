// input.js — unifies keyboard + touch into a per-frame intent.
// intent: { steer: -1..1 (free), laneDir: -1/0/+1 (snap pulses), boost, brake }
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.steer = 0;       // analog -1..1 (free mode hold)
    this.laneDir = 0;     // one-shot lane change pulse (snap mode)
    this.jumpPulse = false; // one-shot jump request
    this.boost = false;
    this.brake = false;
    this.mode = 'snap';

    this._keys = {};
    this._touchId = null;
    this._touchStartX = 0;
    this._touchCurX = 0;
    this._swiped = false;
    this._boostHeld = false;
    this._brakeHeld = false;

    this._bindKeyboard();
    this._bindTouch();
  }

  setMode(m) { this.mode = m; }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const wasDown = this._keys[e.code];
      this._keys[e.code] = true;
      if (this.mode === 'snap') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.laneDir = -1;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.laneDir = 1;
      }
      // jump on Space (edge-triggered so holding doesn't auto-repeat-jump)
      if (e.code === 'Space' && !wasDown) { this.jumpPulse = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });
  }

  _bindTouch() {
    const c = this.canvas;
    const opt = { passive: false };

    // Continuous steering: the touch ANCHOR is where you first press; sliding
    // left/right of it steers proportionally and is SUSTAINED while held. A
    // quick flick up jumps. Releasing returns steer to 0 (then lane-settle).
    c.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._touchId = t.identifier;
      this._anchorX = this._touchCurX = t.clientX;
      this._touchStartY = this._touchCurY = t.clientY;
      this._touchStartT = performance.now();
      this._jumpedThisTouch = false;
      e.preventDefault();
    }, opt);

    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchId) {
          this._touchCurX = t.clientX;
          this._touchCurY = t.clientY;
          const dy = this._touchCurY - this._touchStartY;
          const dx = this._touchCurX - this._anchorX;
          // quick upward flick => jump
          if (!this._jumpedThisTouch && dy < -55 && Math.abs(dy) > Math.abs(dx) * 1.5) {
            this.jumpPulse = true;
            this._jumpedThisTouch = true;
          }
        }
      }
      e.preventDefault();
    }, opt);

    c.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchId) {
          this._touchId = null;
          this.steer = 0;
        }
      }
      e.preventDefault();
    }, opt);
    c.addEventListener('touchcancel', () => { this._touchId = null; this.steer = 0; });
  }

  bindButtons({ boostBtn, brakeBtn }) {
    const press = (el, set) => {
      const on = (e) => { set(true); e.preventDefault(); };
      const off = (e) => { set(false); e.preventDefault(); };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off);
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    };
    if (boostBtn) press(boostBtn, (v) => this._boostHeld = v);
    if (brakeBtn) press(brakeBtn, (v) => this._brakeHeld = v);
  }

  bindJumpButton(jumpBtn) {
    if (!jumpBtn) return;
    const fire = (e) => { this.jumpPulse = true; e.preventDefault(); };
    jumpBtn.addEventListener('touchstart', fire, { passive: false });
    jumpBtn.addEventListener('mousedown', fire);
  }

  // consume one-shot jump request
  takeJump() { const j = this.jumpPulse; this.jumpPulse = false; return j; }

  // Continuous analog steer (sustained while held). Call once per frame.
  poll() {
    let kSteer = 0;
    if (this._keys['ArrowLeft'] || this._keys['KeyA']) kSteer -= 1;
    if (this._keys['ArrowRight'] || this._keys['KeyD']) kSteer += 1;

    // touch: proportional to slide from the anchor (full lock past ~70px)
    let tSteer = 0;
    if (this._touchId !== null) {
      const dx = this._touchCurX - this._anchorX;
      tSteer = Math.max(-1, Math.min(1, dx / 70));
    }
    this.steer = tSteer !== 0 ? tSteer : kSteer;

    this.boost = this._boostHeld || this._keys['ShiftLeft'] || this._keys['KeyW'] || this._keys['ArrowUp'];
    this.brake = this._brakeHeld || this._keys['KeyS'] || this._keys['ArrowDown'];
  }

  // consume one-shot lane change
  takeLaneDir() { const d = this.laneDir; this.laneDir = 0; return d; }
}
