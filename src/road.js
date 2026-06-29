// road.js — endless scrolling freeway: ground, lane lines, medians, scenery.
// World moves toward +Z (toward camera); player stays near z=0.
// We render a long ground strip + tiled lane dashes + side scenery, scrolling
// their Z by the travelled distance (modulo segment length) so it's infinite.
import * as THREE from 'three';
import { CFG, PAL } from './config.js';
import { flat, box } from './assets.js';

// procedural noise texture (asphalt speckle / grass mottle) via canvas
function noiseTexture(base, speck, density = 0.5, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const n = Math.floor(size * size * density * 0.12);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const a = 0.04 + Math.random() * 0.12;
    ctx.fillStyle = `rgba(${speck},${a})`;
    const r = Math.random() * 1.6 + 0.4;
    ctx.fillRect(x, y, r, r);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class Road {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.numLanes = CFG.NUM_LANES;
    this.laneW = CFG.LANE_WIDTH;
    this.roadW = this.numLanes * this.laneW;
    this.halfRoad = this.roadW / 2;

    this.scrollZ = 0;          // accumulated scroll for dashes
    this.medianActive = false; // current section has central median?
    this.medianAt = 0;         // lane index boundary of median
    this.oncomingLanes = 0;    // number of leftmost lanes that are oncoming

    this._build();
  }

  // lane center x for lane index 0..numLanes-1 (left to right)
  laneX(i) { return -this.halfRoad + this.laneW * (i + 0.5); }
  get drivableHalf() { return this.halfRoad - CFG.CAR_HALF_W; }

  _build() {
    const len = CFG.VISIBLE_AHEAD + CFG.VISIBLE_BEHIND + 40;

    // grass base (wide) — mottled texture
    const grassTex = noiseTexture('#3f7d4f', '20,60,30', 0.7);
    grassTex.repeat.set(20, len / 8);
    const grassMat = flat(PAL.grass, { rough: 1 });
    grassMat.map = grassTex;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(220, len),
      grassMat
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, -(CFG.VISIBLE_AHEAD - CFG.VISIBLE_BEHIND) / 2);
    grass.receiveShadow = true;
    this.group.add(grass);
    this.grassMesh = grass;

    // road surface — asphalt texture for a less flat look
    const roadTex = noiseTexture('#33384a', '0,0,0', 0.8);
    roadTex.repeat.set(3, len / 6);
    const roadMat = flat(PAL.road, { rough: 0.92 });
    roadMat.map = roadTex;
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(this.roadW + CFG.ROAD_SHOULDER * 2, len),
      roadMat
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = grass.position.z;
    road.receiveShadow = true;
    this.group.add(road);
    this.roadMesh = road;
    this._roadTex = roadTex;

    // shoulders (lighter edge strips)
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, len), flat(PAL.roadEdge));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx * (this.halfRoad + 0.2), 0.01, grass.position.z);
      this.group.add(sh);
    }

    // ---- lane dashes (tiled, scrolled) ----
    this.dashes = [];
    const dashLen = 3, dashGap = 5, period = dashLen + dashGap;
    const dashCount = Math.ceil(len / period);
    const dashMat = flat(PAL.roadLine, { emissive: 0x222200, emissiveIntensity: 0.2 });
    for (let line = 1; line < this.numLanes; line++) {
      const x = -this.halfRoad + this.laneW * line;
      for (let d = 0; d < dashCount; d++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, dashLen), dashMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.02, 0);
        m.userData = { baseZ: CFG.VISIBLE_BEHIND - d * period, period, total: dashCount * period, lineIndex: line };
        this.group.add(m);
        this.dashes.push(m);
      }
    }

    // ---- divider between oncoming & forward lanes ----
    // Two visual styles share one X position (set in setOncomingLanes):
    //   • centre LINE: a painted double-yellow stripe (two-way, no barrier)
    //   • BARRIER: a raised concrete wall (median sections)
    const medLen = len;

    // double-yellow centre line (two thin emissive strips)
    this.centerLine = new THREE.Group();
    for (const off of [-0.12, 0.12]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, medLen),
        flat(PAL.roadLine, { emissive: 0x332a00, emissiveIntensity: 0.25 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(off, 0.03, 0);
      this.centerLine.add(strip);
    }
    this.centerLine.position.z = grass.position.z;
    this.centerLine.visible = false;
    this.group.add(this.centerLine);

    // concrete barrier wall (segmented look via stripes)
    this.median = new THREE.Group();
    const medWall = box(0.7, 0.9, medLen, flat(PAL.median, { rough: 0.85 }));
    medWall.position.y = 0.45;
    this.median.add(medWall);
    // reflective top + base shadow
    const medTop = box(0.74, 0.12, medLen, flat(0xfff0a0, { emissive: 0x554400, emissiveIntensity: 0.3 }));
    medTop.position.y = 0.9;
    this.median.add(medTop);
    this.median.position.z = grass.position.z;
    this.median.visible = false;
    this.group.add(this.median);

    // ---- side scenery: lamp posts + trees + signs, pooled & scrolled ----
    this.scenery = [];
    this._buildScenery(len);

    // ---- moving sky stripe / distant hills (simple) ----
    const hills = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 60),
      flat(0x6fae6f, { rough: 1 })
    );
    hills.position.set(0, 12, -CFG.VISIBLE_AHEAD - 40);
    this.group.add(hills);
    this.hillsMesh = hills;
  }

  // ---- theme hooks (called by terrain.js) ----
  setColors(ground, groundAlt, road) {
    if (this.grassMesh) this.grassMesh.material.color.copy(ground);
    if (this.roadMesh) this.roadMesh.material.color.copy(road);
    // hills handled by terrain (they sit at the horizon -> far transition)
  }

  // rebuild scenery props to match the theme's prop palette
  setTheme(theme) {
    this.theme = theme;
    if (this.scenery) {
      for (const s of this.scenery) this.group.remove(s);
    }
    this.scenery = [];
    const len = CFG.VISIBLE_AHEAD + CFG.VISIBLE_BEHIND + 40;
    this._buildScenery(len, theme.props || ['lamp', 'tree', 'sign'], theme.night);
  }

  _buildScenery(len, palette = ['lamp', 'tree', 'sign'], night = false) {
    const period = 26;
    const count = Math.ceil(len / period);
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const kind = palette[(i * 13 + (side > 0 ? 7 : 0)) % palette.length];
        const grp = makeProp(kind, side, night);
        const extra = kind === 'building' ? 9 + (i % 3) * 3 : 4.5 + (i % 2) * 1.5;
        const ud = grp.userData;
        grp.position.set(side * (this.halfRoad + extra), 0, 0);
        grp.userData = { ...ud, baseZ: CFG.VISIBLE_BEHIND - i * period, period, total: count * period };
        this.group.add(grp);
        this.scenery.push(grp);
      }
    }
  }

  // dividerX = boundary between the last oncoming lane and first forward lane
  _dividerX() {
    const n = this.oncomingLanes || 0;
    if (n <= 0) return null;
    return -this.halfRoad + this.laneW * n; // edge between lane (n-1) and lane n
  }

  setMedian(on) {
    this.medianActive = on;
    const dx = this._dividerX();
    if (on && dx !== null) {
      this.median.position.x = dx;
      this.median.visible = true;
      this.centerLine.visible = false;          // barrier replaces the line
    } else {
      this.median.visible = false;
    }
  }

  setOncomingLanes(n) {
    this.oncomingLanes = n;
    const dx = this._dividerX();
    // show painted centre line on two-way roads that have NO physical barrier
    if (dx !== null && !this.medianActive) {
      this.centerLine.position.x = dx;
      this.centerLine.visible = true;
    } else if (!this.medianActive) {
      this.centerLine.visible = false;
    }
  }

  // scroll the tiled elements by distance moved this frame
  update(distDelta) {
    this.scrollZ += distDelta;
    // scroll the asphalt texture so the road surface appears to move
    if (this._roadTex) this._roadTex.offset.y = (this.scrollZ / 6) % 1;
    const wrap = (obj) => {
      let z = obj.userData.baseZ + (this.scrollZ % obj.userData.total);
      // bring into visible band
      while (z > CFG.VISIBLE_BEHIND + 5) z -= obj.userData.total;
      while (z < -CFG.VISIBLE_AHEAD - 5) z += obj.userData.total;
      obj.position.z = z;
    };
    for (const d of this.dashes) wrap(d);
    for (const s of this.scenery) wrap(s);
  }
}

// ---- scenery prop factory (theme-specific roadside props) ----
function makeProp(kind, side, night) {
  const grp = new THREE.Group();
  switch (kind) {
    case 'lamp': {
      const pole = box(0.15, 4, 0.15, flat(0x4a4f5c));
      pole.position.y = 2;
      const arm = box(0.1, 0.1, 1.4, flat(0x4a4f5c));
      arm.position.set(0, 3.9, side * -0.6);
      const ei = night ? 1.4 : 0.7;
      const lamp = box(0.5, 0.2, 0.5, flat(0xfff2c0, { emissive: 0xffe080, emissiveIntensity: ei }));
      lamp.position.set(0, 3.85, side * -1.1);
      grp.add(pole, arm, lamp);
      break;
    }
    case 'tree': {
      const trunk = box(0.3, 1.2, 0.3, flat(0x6b4a2b)); trunk.position.y = 0.6;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.4, 7), flat(0x3f9d54, { rough: 1 }));
      leaves.position.y = 2.4; leaves.castShadow = true;
      grp.add(trunk, leaves);
      break;
    }
    case 'pine': {
      const trunk = box(0.3, 1.0, 0.3, flat(0x5a3d22)); trunk.position.y = 0.5;
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.8, 7), flat(0x2f7a44, { rough: 1 })); c1.position.y = 1.7;
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 7), flat(0x368a4d, { rough: 1 })); c2.position.y = 2.7;
      const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 7), flat(0x3f9d54, { rough: 1 })); c3.position.y = 3.6;
      c1.castShadow = true;
      grp.add(trunk, c1, c2, c3);
      break;
    }
    case 'cactus': {
      const body = box(0.5, 2.4, 0.5, flat(0x4a8a3a, { rough: 1 })); body.position.y = 1.2;
      const armL = box(0.35, 1.0, 0.35, flat(0x4a8a3a)); armL.position.set(-0.5, 1.5, 0);
      const armLu = box(0.35, 0.8, 0.35, flat(0x4a8a3a)); armLu.position.set(-0.75, 2.0, 0);
      const armR = box(0.35, 0.8, 0.35, flat(0x4a8a3a)); armR.position.set(0.5, 1.8, 0);
      const armRu = box(0.35, 0.7, 0.35, flat(0x4a8a3a)); armRu.position.set(0.75, 2.25, 0);
      body.castShadow = true;
      grp.add(body, armL, armLu, armR, armRu);
      break;
    }
    case 'rock': {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + Math.random() * 0.5, 0), flat(0x8a8f99, { rough: 1 }));
      r.position.y = 0.5; r.rotation.set(Math.random(), Math.random(), Math.random()); r.castShadow = true;
      grp.add(r);
      break;
    }
    case 'building': {
      const h = 6 + Math.random() * 12;
      const col = [0x2a3350, 0x33405e, 0x222a42][(Math.random() * 3) | 0];
      const b = box(4 + Math.random() * 3, h, 4 + Math.random() * 3, flat(col, { rough: 0.7 }));
      b.position.y = h / 2; b.castShadow = true;
      grp.add(b);
      // lit windows (emissive specks)
      if (night) {
        const winMat = flat(0xffe9a0, { emissive: 0xffd060, emissiveIntensity: 1.2 });
        for (let w = 0; w < 6; w++) {
          const win = box(0.5, 0.5, 0.05, winMat);
          win.position.set((Math.random() - 0.5) * 3, 1 + Math.random() * (h - 2), 2.05 + Math.random() * 0.5);
          grp.add(win);
        }
      }
      grp.position.z = 0;
      grp.userData.far = true;
      break;
    }
    case 'billboard': {
      const post1 = box(0.2, 4, 0.2, flat(0x444a58)); post1.position.set(-1.2, 2, 0);
      const post2 = box(0.2, 4, 0.2, flat(0x444a58)); post2.position.set(1.2, 2, 0);
      const cols = [0xff3d7f, 0x3df0ff, 0xffd23f, 0x7d5dff];
      const panel = box(3.4, 1.8, 0.12, flat(cols[(Math.random() * cols.length) | 0], { emissive: 0x222222, emissiveIntensity: night ? 0.9 : 0.3 }));
      panel.position.y = 4.4;
      grp.add(post1, post2, panel);
      break;
    }
    case 'sign':
    default: {
      const post = box(0.12, 2.4, 0.12, flat(0x888)); post.position.y = 1.2;
      const sign = box(1.4, 0.9, 0.08, flat(0x2e7d32, { emissive: 0x0a2a0a, emissiveIntensity: 0.2 }));
      sign.position.y = 2.5;
      grp.add(post, sign);
      break;
    }
  }
  // buildings sit further from the road
  if (kind === 'building') grp.userData.offsetX = side * 8;
  return grp;
}
