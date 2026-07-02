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

    // ---- tyre tracks (pool of dark quads laid on the road) ----
    // ---- continuous tyre-track RIBBONS (one triangle strip per wheel) ----
    // Each ribbon is a rolling buffer of cross-segments; we append the wheel's
    // current position each step and scroll the whole buffer back, tracing a
    // smooth curved trail instead of stamped rectangles.
    this._trackSegs = 90;                 // segments per ribbon
    this._trackW = 0.34;                  // track width
    this._ribbons = [];
    for (let w = 0; w < 2; w++) {
      const verts = new Float32Array((this._trackSegs + 1) * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      const idx = [];
      for (let s = 0; s < this._trackSegs; s++) {
        const a = s * 2, b = s * 2 + 1, cc = (s + 1) * 2, d = (s + 1) * 2 + 1;
        idx.push(a, b, cc, b, d, cc);
      }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.42, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 2;
      scene.add(mesh);
      // ring buffer of {x, z, a(lpha)} points; head is newest
      const pts = new Array(this._trackSegs + 1).fill(null).map(() => ({ x: 0, z: 999, a: 0 }));
      this._ribbons.push({ mesh, geo, pts, active: false });
    }
  }

  // add a point to both ribbons at the current wheel positions (strength = darkness)
  dropTrack(x, strength = 0.4) {
    const a = Math.min(1, 0.35 + strength * 0.6);
    const fresh = !this._penDown; // resuming after a gap => start a clean segment
    this._penDown = true;
    for (let w = 0; w < 2; w++) {
      const r = this._ribbons[w];
      const off = w === 0 ? -0.42 : 0.42;
      if (fresh) { r.pts.pop(); r.pts.unshift({ x: x + off, z: 1.7, a: 0 }); } // invisible break
      r.pts.pop();
      r.pts.unshift({ x: x + off, z: 1.6, a });
      r.active = true;
    }
  }
  penUp() { this._penDown = false; }

  clearTracks() {
    for (const r of this._ribbons) {
      for (const pt of r.pts) { pt.z = 999; pt.a = 0; }
      r.active = false;
      this._writeRibbon(r);
    }
  }

  updateTracks(distDelta) {
    for (const r of this._ribbons) {
      if (!r.active) continue;
      let anyVisible = false;
      for (const pt of r.pts) {
        pt.z += distDelta;                // scroll back with the world
        pt.a -= distDelta * 0.012 + 0.006; // fade with distance/time
        if (pt.z < 55 && pt.a > 0.01) anyVisible = true;
      }
      this._writeRibbon(r);
      if (!anyVisible) r.active = false;
    }
  }

  _writeRibbon(r) {
    const pos = r.geo.attributes.position;
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i];
      const aa = Math.max(0, Math.min(1, p.a));
      const hw = this._trackW * 0.5 * aa;   // faded segments shrink to a point => vanish
      pos.setXYZ(i * 2, p.x - hw, 0.05, p.z);
      pos.setXYZ(i * 2 + 1, p.x + hw, 0.05, p.z);
    }
    pos.needsUpdate = true;
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
