// fx.js — particles (sparks, smoke, coin burst), pooled. Cheap point sprites.
import * as THREE from 'three';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.pool = [];
    this.max = 220;

    // shared sprite material via vertex colors on points
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95,
      sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this._data = []; // {x,y,z,vx,vy,vz,life,maxlife,r,g,b,grav}
    for (let i = 0; i < this.max; i++) this._data.push({ life: 0 });

    // ---- tyre tracks: each quad is a SEGMENT that bridges the previous wheel
    // position to the current one — stretched & rotated to connect them, so the
    // trail is a genuinely continuous line that follows any curve. A unit quad
    // (1×1 in local XZ) is scaled to the segment length and yaw-rotated.
    this._tracks = [];
    this._trackMax = 260;
    const trackGeo = new THREE.PlaneGeometry(1, 1); // unit, scaled per segment
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < this._trackMax; i++) {
      const m = new THREE.Mesh(trackGeo, trackMat.clone());
      m.rotation.order = 'YXZ';  // apply yaw (world) first, then flatten
      m.position.y = 0.06; m.renderOrder = 3; m.visible = false;
      scene.add(m);
      this._tracks.push({ mesh: m, z: 0, life: 0, _op: 0.5 });
    }
    this._trackIdx = 0;
    this._lastWheel = null; // [{x,z} left, {x,z} right] previous drop positions
  }

  // Drop connecting track SEGMENTS between the last wheel positions and now.
  dropTrack(x, strength = 0.4) {
    const op = Math.min(0.6, 0.3 + strength * 0.45);
    const nowW = [{ x: x - 0.42, z: 1.6 }, { x: x + 0.42, z: 1.6 }];
    if (this._lastWheel) {
      for (let w = 0; w < 2; w++) {
        const a = this._lastWheel[w], c = nowW[w];
        const dx = c.x - a.x, dz = c.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        const t = this._tracks[this._trackIdx];
        this._trackIdx = (this._trackIdx + 1) % this._trackMax;
        t.z = (a.z + c.z) / 2; t.life = 5.0; t._op = op;
        t.mesh.position.set((a.x + c.x) / 2, 0.06, t.z);
        // YXZ order: yaw about world-Y to point along the segment, then flat
        t.mesh.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0);
        t.mesh.scale.set(0.32, len + 0.14, 1);  // width, length(=segment)+overlap
        t.mesh.material.opacity = op;
        t.mesh.visible = true;
      }
    }
    this._lastWheel = nowW;
  }
  penUp() { this._lastWheel = null; } // break the line between separate skids

  clearTracks() { for (const t of this._tracks) { t.life = 0; t.mesh.visible = false; } this._lastWheel = null; }

  updateTracks(distDelta) {
    for (const t of this._tracks) {
      if (t.life <= 0) continue;
      t.z += distDelta;
      t.life -= 0.02;
      t.mesh.position.z = t.z;
      t.mesh.material.opacity = Math.max(0, t._op * Math.min(1, t.life / 1.5));
      if (t.life <= 0 || t.z > 55) { t.mesh.visible = false; t.life = 0; }
    }
    // the stored last-wheel points must also scroll with the world so the next
    // connecting segment starts from the right place
    if (this._lastWheel) for (const p of this._lastWheel) p.z += distDelta;
  }

  _emit(x, y, z, vx, vy, vz, life, color, grav = -9) {
    for (const d of this._data) {
      if (d.life <= 0) {
        const c = new THREE.Color(color);
        d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz;
        d.life = life; d.maxlife = life; d.r = c.r; d.g = c.g; d.b = c.b; d.grav = grav;
        return;
      }
    }
  }

  sparks(x, y, z, n = 16, color = 0xffd23f) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      this._emit(x, y, z,
        Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp - 4,
        0.4 + Math.random() * 0.4, color, -16);
    }
  }

  smoke(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      this._emit(x + (Math.random() - 0.5), y, z,
        (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2 - 2,
        0.8 + Math.random() * 0.6, 0x888888, 1.5);
    }
  }

  coinBurst(x, y, z) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
      this._emit(x, y, z, Math.cos(a) * sp, 4 + Math.random() * 4, Math.sin(a) * sp,
        0.5, 0xffe066, -14);
    }
  }

  update(dt) {
    let n = 0;
    for (const d of this._data) {
      if (d.life > 0) {
        d.life -= dt;
        d.vy += d.grav * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.y < 0.05) { d.y = 0.05; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; }
        const i3 = n * 3;
        const f = Math.max(0, d.life / d.maxlife);
        this.positions[i3] = d.x; this.positions[i3 + 1] = d.y; this.positions[i3 + 2] = d.z;
        this.colors[i3] = d.r * f; this.colors[i3 + 1] = d.g * f; this.colors[i3 + 2] = d.b * f;
        n++;
      }
    }
    // hide unused
    for (let i = n; i < this.max; i++) {
      const i3 = i * 3;
      this.positions[i3] = 0; this.positions[i3 + 1] = -999; this.positions[i3 + 2] = 0;
      this.colors[i3] = 0; this.colors[i3 + 1] = 0; this.colors[i3 + 2] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// floating text combo popup via DOM
export function comboPopup(el, text, color) {
  el.textContent = text;
  el.style.color = color || '';
  el.classList.remove('show');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('show');
}
