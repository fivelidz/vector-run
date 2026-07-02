// road.js — endless scrolling freeway: ground, lane lines, medians, scenery.
// World moves toward +Z (toward camera); player stays near z=0.
// We render a long ground strip + tiled lane dashes + side scenery, scrolling
// their Z by the travelled distance (modulo segment length) so it's infinite.
import * as THREE from 'three';
import { CFG, PAL } from './config.js';
import { flat, box } from './assets.js';

// procedural noise texture (asphalt speckle / grass mottle) via canvas.
// Returns a white-ish texture with darker AND lighter specks so it stays
// visible after the material colour tint multiplies it.
function noiseTexture(density = 0.6, size = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size); // white base = full tint
  const n = Math.floor(size * size * density * 0.25);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const dark = Math.random() < 0.55;
    const a = 0.10 + Math.random() * 0.30;
    ctx.fillStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    const r = Math.random() * 2.2 + 0.6;
    ctx.fillRect(x, y, r, r);
  }
  // a few longer streaks for asphalt "grain"
  for (let i = 0; i < size * 0.3; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 0.8, 4 + Math.random() * 10);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// richer asphalt: speckle + cracks + patches + faint oil stains (imperfections)
function asphaltTexture(size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  // fine speckle
  for (let i = 0; i < size * size * 0.08; i++) {
    const dark = Math.random() < 0.5;
    ctx.fillStyle = dark ? `rgba(40,40,46,${0.08 + Math.random() * 0.18})` : `rgba(255,255,255,${0.06 + Math.random() * 0.14})`;
    const r = Math.random() * 1.8 + 0.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
  // cracks (jagged dark polylines)
  ctx.strokeStyle = 'rgba(20,20,24,0.4)'; ctx.lineWidth = 1;
  for (let c = 0; c < 10; c++) {
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    const segs = 4 + (Math.random() * 5 | 0);
    for (let s = 0; s < segs; s++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // lighter repair patches
  for (let p = 0; p < 6; p++) {
    ctx.fillStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.08})`;
    const w = 20 + Math.random() * 50, h = 20 + Math.random() * 50;
    ctx.fillRect(Math.random() * size, Math.random() * size, w, h);
  }
  // faint dark oil stains
  for (let o = 0; o < 5; o++) {
    const x = Math.random() * size, y = Math.random() * size, r = 8 + Math.random() * 18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(15,15,18,0.22)'); g.addColorStop(1, 'rgba(15,15,18,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
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

    const groundZ = -(CFG.VISIBLE_AHEAD - CFG.VISIBLE_BEHIND) / 2;
    this._groundZ = groundZ;
    this._groundLen = len;
    this._segZ = 40; // vertex rows along Z for per-distance vertex-colour blending

    // grass base (wide) — vertex-coloured so the theme can sweep from horizon
    const grassTex = noiseTexture(0.8);
    grassTex.repeat.set(24, len / 6);
    this._grassTex = grassTex;
    const grassGeo = new THREE.PlaneGeometry(220, len, 1, this._segZ);
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 1 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, groundZ);
    grass.receiveShadow = true;
    this.group.add(grass);
    this.grassMesh = grass;
    this._initVColors(grassGeo, PAL.grass);

    // road surface — vertex-coloured asphalt with imperfections
    const roadTex = asphaltTexture();
    roadTex.repeat.set(2, len / 8);
    const roadGeo = new THREE.PlaneGeometry(this.roadW + CFG.ROAD_SHOULDER * 2, len, 1, this._segZ);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, vertexColors: true, roughness: 0.92 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = groundZ;
    road.receiveShadow = true;
    this.group.add(road);
    this.roadMesh = road;
    this._roadTex = roadTex;
    this._initVColors(roadGeo, PAL.road); // (was missing -> black vertexColors -> dark road!)

    // shoulders (lighter edge strips)
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, len), flat(PAL.roadEdge));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx * (this.halfRoad + 0.2), 0.01, grass.position.z);
      this.group.add(sh);
    }

    // DESERT dirt shoulder lanes (hidden until desertShoulder is on) — a wide
    // sandy strip either side you can drive onto (packed dirt colour).
    this.dirtShoulders = new THREE.Group();
    const dirtMat = flat(0xc9a870, { rough: 1 });
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(6, len), dirtMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(sx * (this.halfRoad + 3.2), 0.005, grass.position.z);
      this.dirtShoulders.add(d);
      const rumble = new THREE.Mesh(new THREE.PlaneGeometry(0.3, len), flat(0x8a7048));
      rumble.rotation.x = -Math.PI / 2;
      rumble.position.set(sx * (this.halfRoad + 0.35), 0.012, grass.position.z);
      this.dirtShoulders.add(rumble);
      if (sx > 0) { this._dirtR = d; this._dirtRumbleR = rumble; }
    }
    this.dirtShoulders.visible = false;
    this.group.add(this.dirtShoulders);

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

    // distant hills removed — they made a hard horizon line. The ground now
    // fades into the sky via fog (fog colour tracks the sky). Keep a stub so
    // terrain code that references hillsMesh stays safe.
    this.hillsMesh = null;

    // ---- intersection marker (a perpendicular cross-road) used as the visual
    // "seam" for theme transitions; spawned at the horizon and scrolled in.
    this.intersection = new THREE.Group();
    // wide perpendicular cross-road with a lighter surface (reads clearly)
    const xroad = new THREE.Mesh(new THREE.PlaneGeometry(140, 18),
      new THREE.MeshStandardMaterial({ color: 0x7a8090, roughness: 0.95 }));
    xroad.rotation.x = -Math.PI / 2; xroad.position.y = 0.02;
    this.intersection.add(xroad);
    // centre dashes along the cross-road (it's a real road going left/right)
    for (let i = -8; i <= 8; i++) {
      if (Math.abs(i * 4) < this.halfRoad + 2) continue; // skip over the main road
      const d = box(2.2, 0.02, 0.25, flat(0xf4d35e));
      d.position.set(i * 4, 0.05, 0);
      this.intersection.add(d);
    }
    // edge lines of the cross-road
    for (const sz of [-1, 1]) {
      const edge = box(140, 0.02, 0.25, flat(0xe8e8ec));
      edge.position.set(0, 0.045, sz * 8.6);
      this.intersection.add(edge);
    }
    // white STOP line across the main road just before the junction
    const stop = box(this.roadW, 0.02, 0.9, flat(0xffffff, { emissive: 0x222222, emissiveIntensity: 0.15 }));
    stop.position.set(0, 0.05, 10.2);
    this.intersection.add(stop);
    // crosswalk stripes on the near side
    for (let i = -5; i <= 5; i++) {
      const s = box(1.0, 0.02, 2.6, flat(0xffffff, { emissive: 0x222222, emissiveIntensity: 0.1 }));
      s.position.set(i * 1.6, 0.04, 11.8);
      this.intersection.add(s);
    }
    // traffic-light posts on the corners
    for (const sx of [-1, 1]) {
      const post = box(0.2, 5, 0.2, flat(0x33363f)); post.position.set(sx * (this.halfRoad + 2), 2.5, 9.5);
      const head = box(0.5, 1.2, 0.4, flat(0x111));
      head.position.set(sx * (this.halfRoad + 2), 5, 9.5);
      const grn = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), flat(0x33ff55, { emissive: 0x22cc44, emissiveIntensity: 1.2 }));
      grn.position.set(sx * (this.halfRoad + 2), 4.7, 9.8);
      this.intersection.add(post, head, grn);
    }
    this.intersection.visible = false;
    this.intersection.position.z = -CFG.VISIBLE_AHEAD;
    this.group.add(this.intersection);
  }

  // place the intersection at the far horizon (called when a transition starts).
  // If one is already scrolling in, DON'T reset it — resetting made it jump
  // backward (looked like it moved with the car / never arrived).
  triggerIntersection() {
    if (this.intersection.visible) return;
    this.intersection.visible = true;
    this.intersection.position.z = -CFG.VISIBLE_AHEAD + 4;
  }
  // scroll the intersection toward the player; hide once it passes
  updateIntersection(distDelta) {
    if (!this.intersection.visible) return;
    this.intersection.position.z += distDelta;
    if (this.intersection.position.z > CFG.VISIBLE_BEHIND + 10) this.intersection.visible = false;
  }

  _initVColors(geo, hex) {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  // world Z for a vertex row index (0=far horizon .. segZ=nearest/behind)
  _rowWorldZ(row) {
    // PlaneGeometry local y runs +len/2 (top) .. -len/2 (bottom); after rot -90°
    // about X, local +y -> world -z. Mesh sits at groundZ.
    const localY = this._groundLen / 2 - (row / this._segZ) * this._groundLen;
    return this._groundZ - localY; // world z (negative = ahead)
  }

  // Paint ground+road vertex colours: rows AHEAD of boundaryZ use colour B (the
  // upcoming theme), rows behind use colour A (current). The boundary scrolls
  // from the horizon toward the player => the new biome flows DOWN the road.
  setGroundBlend(boundaryZ, grassA, grassB, roadA, roadB) {
    this._paintRows(this.grassMesh, boundaryZ, grassA, grassB);
    this._paintRows(this.roadMesh, boundaryZ, roadA, roadB);
  }
  _paintRows(mesh, boundaryZ, a, b) {
    if (!mesh) return;
    const geo = mesh.geometry; const col = geo.attributes.color; if (!col) return;
    const cols = this._segZ + 1;       // vertices per row = 2 (PlaneGeometry width segs=1)
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    const tmp = new THREE.Color();
    for (let row = 0; row <= this._segZ; row++) {
      const wz = this._rowWorldZ(row);
      // smooth band over ~30m around the boundary for a soft seam
      const f = Math.max(0, Math.min(1, (boundaryZ - wz) / 30 + 0.5)); // ahead-> b
      tmp.copy(ca).lerp(cb, f);
      for (let cx = 0; cx < 2; cx++) {
        const vi = row * 2 + cx;
        col.setXYZ(vi, tmp.r, tmp.g, tmp.b);
      }
    }
    col.needsUpdate = true;
  }

  // ---- theme hooks (called by terrain.js) ----
  setColors(ground, groundAlt, road) {
    // uniform fallback: paint every row the same colour (used outside transitions)
    if (this.grassMesh) this._fillVColor(this.grassMesh, ground);
    if (this.roadMesh) this._fillVColor(this.roadMesh, road);
  }
  _fillVColor(mesh, hex) {
    const geo = mesh.geometry, col = geo.attributes.color; if (!col) return;
    const c = new THREE.Color(hex);
    for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
  }

  // Set the CURRENT theme for prop spawning. We do NOT rebuild existing props —
  // instead, props adopt the new theme as they recycle at the horizon, so the
  // change sweeps in from the distance as you drive into the new biome.
  setTheme(theme) {
    this.theme = theme;
    if (!this.scenery) { // first call: build initial set
      this.scenery = [];
      const len = CFG.VISIBLE_AHEAD + CFG.VISIBLE_BEHIND + 40;
      this._buildScenery(len, theme.props || ['lamp', 'tree', 'sign'], theme.night);
    }
  }

  // replace a recycled prop's visual with one from the current theme
  _reskinProp(grp) {
    const t = this.theme || { props: ['lamp', 'tree', 'sign'], night: false };
    const idx = grp.userData.slot || 0;
    const kind = (t.props || ['lamp'])[(idx * 13) % (t.props || ['lamp']).length];
    // clear children, rebuild
    while (grp.children.length) grp.remove(grp.children[0]);
    const fresh = makeProp(kind, grp.userData.side || 1, t.night);
    while (fresh.children.length) grp.add(fresh.children[0]);
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
        grp.userData = { ...ud, baseZ: CFG.VISIBLE_BEHIND - i * period, period, total: count * period, slot: i, side };
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

  // median barriers removed from the game — always keep it hidden
  setMedian(on) { this.medianActive = false; this.median.visible = false; }

  // toggle the desert dirt shoulders (drivable sandy strips beyond the used
  // lanes). In desert, traffic only uses lanes 0-2, so lanes 3-4 + this dirt are
  // an open dirt run. We also HIDE the lane dashes on lines 3+ and lay dirt over
  // lanes 3-4 so the road visually narrows to 3 lanes.
  setDesertShoulder(on) {
    this.desertShoulder = on;
    if (this.dirtShoulders) this.dirtShoulders.visible = on;
    // lane dashes: in desert keep only lines 1,2,3 (edges of lanes 0-2); hide 4+
    for (const d of this.dashes) {
      d.userData._hideDesert = on && d.userData.lineIndex >= 3;
    }
    // widen/position the RIGHT dirt to cover lanes 3-4 in desert
    if (this._dirtR) {
      if (on) {
        const inner = -this.halfRoad + this.laneW * 3; // boundary lane2|lane3
        const outer = this.halfRoad + 9;
        this._dirtR.geometry.dispose();
        this._dirtR.geometry = new THREE.PlaneGeometry(outer - inner, this._groundLen);
        this._dirtR.position.x = (inner + outer) / 2;
        if (this._dirtRumbleR) this._dirtRumbleR.position.x = inner;
      } else {
        this._dirtR.geometry.dispose();
        this._dirtR.geometry = new THREE.PlaneGeometry(6, this._groundLen);
        this._dirtR.position.x = this.halfRoad + 3.2;
        if (this._dirtRumbleR) this._dirtRumbleR.position.x = this.halfRoad + 0.35;
      }
    }
  }

  setOncomingLanes(n) {
    this.oncomingLanes = n;
    const dx = this._dividerX();
    // painted double-yellow centre line on two-way roads (full length, static)
    if (dx !== null) {
      this.centerLine.position.set(dx, this.centerLine.position.y, this._groundZ);
      this.centerLine.visible = true;
    } else {
      this.centerLine.visible = false;
    }
  }

  // no-op stubs (the preview approach caused "imaginary dividers"; the
  // intersection + traffic clear is the transition seam now)
  previewLayout() {}
  clearPreview() { this.centerLine.position.z = this._groundZ; this.median.position.z = this._groundZ; }

  // scroll the tiled elements by distance moved this frame
  update(distDelta) {
    this.scrollZ += distDelta;
    // scroll the asphalt texture so the road surface appears to move
    if (this._roadTex) this._roadTex.offset.y = (this.scrollZ / 6) % 1;
    if (this._grassTex) this._grassTex.offset.y = (this.scrollZ / 6) % 1;
    const wrap = (obj) => {
      let z = obj.userData.baseZ + (this.scrollZ % obj.userData.total);
      while (z > CFG.VISIBLE_BEHIND + 5) z -= obj.userData.total;
      while (z < -CFG.VISIBLE_AHEAD - 5) z += obj.userData.total;
      obj.position.z = z;
      return z;
    };
    for (const d of this.dashes) { wrap(d); d.visible = !d.userData._hideDesert; }
    for (const s of this.scenery) {
      const z = wrap(s);
      // when a prop recycles to the far horizon, reskin it to the current theme
      if (s.userData._lastZ !== undefined && z < s.userData._lastZ - 50) {
        this._reskinProp(s);
      }
      s.userData._lastZ = z;
    }
    this.updateIntersection(distDelta);
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
