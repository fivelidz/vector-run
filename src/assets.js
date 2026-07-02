// assets.js — procedural low-poly model factory + optional GLB swap-in.
// Everything has a procedural fallback so the game runs with zero downloads.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL } from './config.js';

// rounded, smooth-shaded box mesh
function roundedBox(w, h, d, r, mat) {
  const rad = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), mat);
}

const loader = new GLTFLoader();

// Registry of GLB overrides. If a file exists in assets/models/<key>.glb it is
// loaded and used instead of the procedural mesh. We try-load lazily.
const GLB_KEYS = {
  player: 'assets/models/player_car.glb',
  sedan: 'assets/models/traffic_sedan.glb',
  hatch: 'assets/models/traffic_hatchback.glb',
  truck: 'assets/models/truck.glb',
  police: 'assets/models/police_cruiser.glb',
  cone: 'assets/models/cone.glb',
  barrier: 'assets/models/barrier.glb',
};
const glbCache = {};

function flat(color, opts = {}) {
  const { rough, metal, ...rest } = opts;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough ?? 0.6,
    metalness: metal ?? 0.1,
    flatShading: true,
    ...rest,
  });
}

// rounded-ish box via slightly beveled scale; keep it cheap: plain box.
function box(w, h, d, mat) {
  const g = new THREE.BoxGeometry(w, h, d);
  return new THREE.Mesh(g, mat);
}

// ---- Procedural car: chunky cartoon car with visible wheels + glass + lights.
// FORWARD = -Z (away from the chase camera). Headlights at the -Z end.
// Smooth-shaded, rounded, sporty silhouette (not flat-shaded blocks).
export function makeCar(color = PAL.player, kind = 'car') {
  const grp = new THREE.Group();
  const long = kind === 'truck';
  const W = 1.5, L = long ? 5.0 : 3.4, H = 0.85;
  const FWD = -1;

  grp.userData.tint = [];
  const smooth = (col, o = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: o.rough ?? 0.35, metalness: o.metal ?? 0.4, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 0, flatShading: false });

  // main body — a rounded capsule-ish hull (smooth-shaded rounded box)
  const bodyMat = smooth(color, { rough: 0.3, metal: 0.45 });
  const body = roundedBox(W, H, L * 0.98, 0.28, bodyMat);
  body.position.y = 0.62; body.castShadow = true;
  grp.add(body); grp.userData.tint.push(body);

  // sleek hood/nose taper at the front
  const nose = roundedBox(W * 0.9, H * 0.55, L * 0.3, 0.2, bodyMat.clone());
  nose.position.set(0, 0.5, FWD * (L * 0.42)); grp.add(nose); grp.userData.tint.push(nose);

  if (kind === 'convertible') {
    // OPEN-TOP: low body sides + a small windshield + dark cockpit, no roof.
    const cabinMat = smooth(shade(color, -0.05), { rough: 0.3, metal: 0.4 });
    // raised body-coloured sides forming the cockpit rim
    const rim = roundedBox(W * 0.86, 0.4, L * 0.6, 0.16, cabinMat);
    rim.position.set(0, 0.98, -0.05); grp.add(rim); grp.userData.tint.push(rim);
    // sunken dark interior (seats/floor)
    const interior = box(W * 0.66, 0.25, L * 0.5, smooth(0x15181f, { rough: 0.8, metal: 0 }));
    interior.position.set(0, 1.02, -0.05); grp.add(interior);
    // two head-rest bumps
    for (const sx of [-1, 1]) { const hr = roundedBox(0.28, 0.28, 0.28, 0.1, cabinMat.clone()); hr.position.set(sx * 0.3, 1.18, 0.35); grp.add(hr); grp.userData.tint.push(hr); }
    // small raked windshield at the front of the cockpit
    const glassMat = smooth(0x9fd8ff, { rough: 0.05, metal: 0.6, emissive: 0x223344, emissiveIntensity: 0.15 });
    const ws = box(W * 0.7, 0.34, 0.06, glassMat);
    ws.position.set(0, 1.2, FWD * (L * 0.14)); ws.rotation.x = FWD * 0.25; grp.add(ws);
  } else if (!long) {
    // curved cabin (lower, raked) — a squashed rounded box
    const cabinMat = smooth(shade(color, -0.05), { rough: 0.25, metal: 0.4 });
    const cabin = roundedBox(W * 0.78, 0.5, L * 0.5, 0.22, cabinMat);
    cabin.position.set(0, 1.06, -0.05); cabin.castShadow = true;
    grp.add(cabin); grp.userData.tint.push(cabin);
    // wraparound glass (one smooth dark greenhouse)
    const glassMat = smooth(0x18222e, { rough: 0.05, metal: 0.85, emissive: 0x0a1622, emissiveIntensity: 0.2 });
    const glass = roundedBox(W * 0.74, 0.42, L * 0.46, 0.2, glassMat);
    glass.position.set(0, 1.12, -0.05); grp.add(glass);
    // body-coloured ROOF panel on top (so the roof matches the body, not glass)
    const roof = roundedBox(W * 0.7, 0.09, L * 0.4, 0.04, cabinMat.clone());
    roof.position.set(0, 1.34, -0.05);
    grp.add(roof); grp.userData.tint.push(roof);
    // thin pillar accents keep it reading as windows
    const pillarMat = smooth(shade(color, -0.1));
    for (const sx of [-1, 1]) { const pl = box(0.05, 0.4, L * 0.46, pillarMat); pl.position.set(sx * W * 0.39, 1.1, -0.05); grp.add(pl); }
  } else {
    const cab = roundedBox(W * 0.96, 1.1, 1.7, 0.2, smooth(shade(color, -0.05)));
    cab.position.set(0, 1.0, FWD * (L * 0.3)); cab.castShadow = true; grp.add(cab); grp.userData.tint.push(cab);
    const wsh = box(W * 0.82, 0.55, 0.08, smooth(0x18222e, { rough: 0.05, metal: 0.85 }));
    wsh.position.set(0, 1.2, FWD * (L * 0.3 + 0.86)); grp.add(wsh);
    const cargo = roundedBox(W * 0.98, 1.55, L * 0.5, 0.12, smooth(0xeceef4, { rough: 0.6, metal: 0.1 }));
    cargo.position.set(0, 1.2, -FWD * (L * 0.16)); cargo.castShadow = true; grp.add(cargo);
  }

  // ---- smooth wheels with shiny rims, tucked into arches ----
  const tyreMat = smooth(0x0e0f14, { rough: 0.9, metal: 0 });
  const rimMat = smooth(0xcdd2dc, { rough: 0.25, metal: 0.85 });
  const R = long ? 0.52 : 0.46;
  const wheelG = new THREE.CylinderGeometry(R, R, 0.3, 18);
  const rimG = new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.32, 12);
  const wx = W * 0.52, wz = L * 0.31;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelG, tyreMat);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * wx, R, sz * wz); wheel.castShadow = true;
    grp.add(wheel);
    const rim = new THREE.Mesh(rimG, rimMat);
    rim.rotation.z = Math.PI / 2; rim.position.set(sx * (wx + 0.005), R, sz * wz);
    grp.add(rim);
  }

  // headlights (front, -Z) — bright; tail lights (rear, +Z) red
  const headMat = flat(0xffffff, { emissive: 0xfff3c8, emissiveIntensity: 1.0 });
  for (const sx of [-1, 1]) {
    const head = box(0.34, 0.2, 0.12, headMat);
    head.position.set(sx * W * 0.32, 0.72, FWD * (L * 0.48));
    grp.add(head);
  }
  const tailMat = flat(0x551111, { emissive: 0xff2222, emissiveIntensity: 0.8 });
  for (const sx of [-1, 1]) {
    const tail = box(0.34, 0.2, 0.12, tailMat);
    tail.position.set(sx * W * 0.32, 0.72, -FWD * (L * 0.48));
    grp.add(tail);
  }

  // real-looking headlight beams (volumetric cones) + ground pool, night only
  addHeadlightBeams(grp, { W, L, FWD });
  grp.userData.headMat = headMat;
  grp.userData.tailMat = tailMat;

  // soft contact shadow blob
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.6, L * 1.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  grp.add(blob);

  grp.userData.dims = { W, L, H };
  grp.userData.body = body;
  grp.userData.headlights = headMat; // for night glow boost
  return grp;
}

// Build two volumetric headlight beam cones + a soft ground pool. Hidden by
// default; setCarNight() reveals them. `dims` may be approximate (for GLB).
export function addHeadlightBeams(grp, dims) {
  const W = dims.W ?? 1.5, L = dims.L ?? 3.4, FWD = dims.FWD ?? -1;
  const beams = new THREE.Group();
  const mats = [];
  const tex = _softGlowTexture();
  // one soft, FEATHERED light pool per headlight, stretched down the road.
  // A radial-gradient sprite = smooth falloff (no hard specular disc).
  for (const sx of [-1, 1]) {
    const pm = new THREE.MeshBasicMaterial({ map: tex, color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    mats.push(pm);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, L * 2.6), pm);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(sx * W * 0.3, 0.04, FWD * (L * 1.35));
    beams.add(pool);
  }
  // faint soft halo right at the lamps (gentle bloom, not a hard dot)
  for (const sx of [-1, 1]) {
    const hm = new THREE.MeshBasicMaterial({ map: tex, color: 0xfff4cf, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    mats.push(hm);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), hm);
    halo.position.set(sx * W * 0.32, 0.72, FWD * (L * 0.5));
    beams.add(halo);
  }
  beams.visible = false;
  grp.add(beams);
  grp.userData.beams = beams;
  grp.userData.beamMats = mats;
  grp.userData.beamHalos = mats.slice(2); // last two are the lamp halos
}

// cached soft radial-gradient texture (white center -> transparent edge)
let _glowTex = null;
function _softGlowTexture() {
  if (_glowTex) return _glowTex;
  const s = 128; const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}

// toggle a car's night lighting (beams + brighter lights)
export function setCarNight(carMesh, night) {
  const u = carMesh.userData;
  if (u.beams) u.beams.visible = night;
  if (u.beamMats) {
    // sprites are now just a soft accent glow (real SpotLight does the lighting)
    u.beamMats[0].opacity = night ? 0.35 : 0;
    u.beamMats[1].opacity = night ? 0.35 : 0;
    if (u.beamMats[2]) u.beamMats[2].opacity = night ? 0.3 : 0;
    if (u.beamMats[3]) u.beamMats[3].opacity = night ? 0.3 : 0;
  }
  if (u.headMat) u.headMat.emissiveIntensity = night ? 2.2 : 1.0;
  if (u.tailMat) u.tailMat.emissiveIntensity = night ? 1.6 : 0.8;
}

// ---- Police cruiser: car + light bar ----
export function makePolice() {
  const grp = makeCar(PAL.police, 'car');
  const bar = new THREE.Group();
  const red = box(0.5, 0.22, 0.4, flat(0xff2b2b, { emissive: 0xff0000, emissiveIntensity: 1.2 }));
  red.position.x = -0.3;
  const blue = box(0.5, 0.22, 0.4, flat(0x2b6bff, { emissive: 0x0040ff, emissiveIntensity: 1.2 }));
  blue.position.x = 0.3;
  bar.add(red, blue);
  bar.position.set(0, 1.68, -0.1);
  grp.add(bar);
  grp.userData.lightbar = { red, blue };
  // white body stripe
  const stripe = box(1.95, 0.5, 1.4, flat(0xffffff));
  stripe.position.set(0, 0.62, 0);
  grp.add(stripe);
  return grp;
}

// ---- Enemy (gang) car: dark menacing car with red accents ----
export function makeEnemy() {
  const grp = makeCar(0x2a0d12, 'car');
  // red roof scoop / accent so it reads as a threat
  const scoop = box(0.7, 0.25, 0.9, new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.6, roughness: 0.4 }));
  scoop.position.set(0, 1.35, -0.1);
  grp.add(scoop);
  grp.userData.enemyAccent = scoop;
  return grp;
}

// slow grenade projectile (arcs through the air, dodgeable)
export function makeGrenade() {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x2e3a22, emissive: 0x334411, emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.3 }));
  grp.add(body);
  // big blinking red warning light on top
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2.0 }));
  tip.position.y = 0.42; grp.add(tip);
  // danger ring on the ground (always visible from above)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 18),
    new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.25; grp.add(ring);
  grp.userData.tip = tip;
  return grp;
}

// ---- Cone ----
export function makeCone() {
  const grp = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.95, 10), flat(PAL.cone, { rough: 0.7 }));
  cone.position.y = 0.5; cone.castShadow = true; grp.add(cone);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 10), flat(0xffffff));
  ring.position.y = 0.6; grp.add(ring);
  const base = box(0.8, 0.12, 0.8, flat(0x222));
  base.position.y = 0.06; grp.add(base);
  grp.userData.dims = { W: 0.7, L: 0.7, H: 1.0 };
  grp.userData.light = true;
  return grp;
}

// ---- Barrier (jersey wall) ----
export function makeBarrier() {
  const grp = new THREE.Group();
  const wall = box(0.7, 1.0, 2.6, flat(0xf2f2f4, { rough: 0.8 }));
  wall.position.y = 0.55; wall.castShadow = true; grp.add(wall);
  // red/white stripes
  for (let i = -1; i <= 1; i++) {
    const s = box(0.72, 0.34, 0.5, flat(i % 2 ? 0xffffff : PAL.barrier));
    s.position.set(0, 0.55, i * 0.85); grp.add(s);
  }
  grp.userData.dims = { W: 0.9, L: 2.6, H: 1.0 };
  return grp;
}

// ---- Ramp (launch pad) ----
export function makeRamp() {
  const grp = new THREE.Group();
  // wedge: a box sheared into a triangular prism via geometry
  const len = 3.2, w = 2.6, h = 1.3;
  const geo = new THREE.BufferGeometry();
  // simple triangular prism (ramp rising toward -Z front)
  const v = [
    // bottom quad
    -w/2,0, len/2,  w/2,0, len/2,  w/2,0,-len/2,  -w/2,0,-len/2,
    // top edge (raised at -Z)
    -w/2,h,-len/2,  w/2,h,-len/2,
  ];
  const idx = [
    0,1,2, 0,2,3,        // bottom
    3,2,5, 3,5,4,        // sloped top
    0,4,5, 0,5,1,        // front? -> back vertical
    0,3,4,               // left side
    1,5,2,               // right side
  ];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ramp = new THREE.Mesh(geo, flat(0x3a4252, { rough: 0.5, metal: 0.5 }));
  ramp.castShadow = true;
  grp.add(ramp);
  // glowing chevron arrows up the slope (cyan, reads as "launch")
  for (let i = 0; i < 3; i++) {
    const ch = box(w * 0.55, 0.04, 0.26, flat(0x39e0ff, { emissive: 0x18c0e0, emissiveIntensity: 0.9 }));
    ch.position.set(0, 0.42 + i * 0.32, -0.1 - i * 0.55);
    grp.add(ch);
  }
  // bright yellow highlighted side rails
  for (const sx of [-1, 1]) {
    const rail = box(0.16, h * 0.95, len, flat(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: 0.7, metal: 0.3, rough: 0.4 }));
    rail.position.set(sx * w * 0.52, h * 0.48, 0);
    grp.add(rail);
  }
  grp.userData.dims = { W: w, L: len, H: h };
  return grp;
}

// ---- Power-up pickup (floating glowing icon) ----
const PU_COLORS = { invincible: 0xffd23f, nitro: 0xff5d5d, shield: 0x4ea3ff, magnet: 0x9d6dff };
export function makePowerup(type) {
  const grp = new THREE.Group();
  const col = PU_COLORS[type] || 0xffffff;
  // glowing octahedron core
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.2 }));
  grp.add(core);
  // halo ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 20),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7 }));
  ring.rotation.x = Math.PI / 2;
  grp.add(ring);
  grp.position.y = 1.2;
  grp.userData.dims = { W: 1.1, L: 1.1, H: 1.1 };
  grp.userData.core = core; grp.userData.ring = ring;
  return grp;
}

// ---- Big overhead EXIT sign (gantry) ----
export function makeExitSign(roadHalf) {
  const grp = new THREE.Group();
  const beam = box(roadHalf * 2 + 4, 0.4, 0.4, flat(0x44495a, { metal: 0.4 }));
  beam.position.y = 6; grp.add(beam);
  for (const sx of [-1, 1]) { const post = box(0.4, 6, 0.4, flat(0x3a3f4d)); post.position.set(sx * (roadHalf + 1.5), 3, 0); grp.add(post); }
  const panel = box(4.4, 1.8, 0.2, flat(0x1f7a3a, { emissive: 0x0a3318, emissiveIntensity: 0.5 }));
  panel.position.set(0, 6.9, 0); grp.add(panel);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4), flat(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: 1.0 }));
  arrow.rotation.x = Math.PI; arrow.position.set(0, 6.9, 0.25);
  grp.add(arrow);
  grp.userData.arrow = arrow;
  return grp;
}

// ---- Rock (desert obstacle) ----
export function makeRock() {
  const grp = new THREE.Group();
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 + Math.random() * 0.4, 0), flat(0x8a7a5a, { rough: 1 }));
  r.position.y = 0.5; r.rotation.set(Math.random(), Math.random(), Math.random()); r.castShadow = true;
  grp.add(r);
  grp.userData.dims = { W: 1.0, L: 1.0, H: 1.2 };
  return grp;
}

// ---- Coin ----
export function makeCoin() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16);
  const m = new THREE.Mesh(g, flat(PAL.coin, { emissive: 0xffae00, emissiveIntensity: 0.5, metal: 0.6, rough: 0.3 }));
  m.rotation.x = Math.PI / 2;
  const grp = new THREE.Group(); grp.add(m); grp.position.y = 1.1;
  grp.userData.dims = { W: 1, L: 1, H: 1 };
  return grp;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return c.getHex();
}

// Manifest gate: we only attempt GLB loads for keys listed in
// assets/models/manifest.json. If the manifest is absent (no Meshy assets
// downloaded yet) we skip entirely — no 404 spam, procedural fallback is used.
let _manifest = undefined; // undefined=unchecked, null=absent, {} = present
async function getManifest() {
  if (_manifest !== undefined) return _manifest;
  try {
    const res = await fetch('assets/models/manifest.json', { cache: 'no-cache' });
    _manifest = res.ok ? await res.json() : null;
  } catch (e) { _manifest = null; }
  return _manifest;
}

// Try to load a GLB; returns null if missing/unavailable. Non-blocking errors.
export async function tryLoadGLB(key) {
  const path = GLB_KEYS[key];
  if (!path) return null;
  if (glbCache[key] !== undefined) return glbCache[key];
  const man = await getManifest();
  if (!man || !man[key]) { glbCache[key] = null; return null; } // not available yet
  try {
    const gltf = await loader.loadAsync(path);
    const root = gltf.scene;
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    glbCache[key] = root;
    return root;
  } catch (e) {
    glbCache[key] = null; // mark as missing so we don't retry
    return null;
  }
}

// ---- GLB swap-in: clone a loaded GLB and normalize size/orientation/colour ----
// Returns a wrapper Group whose -Z faces forward, scaled to targetLen, recoloured.
import { Box3, Vector3, Group as TGroup, Color as TColor, DoubleSide } from 'three';
function normalizeGLB(root, targetLen, color) {
  const inner = root.clone(true);

  // measure raw bounds
  let bb = new Box3().setFromObject(inner);
  const size = bb.getSize(new Vector3());
  // if the model is longer along X than Z, rotate 90° so length runs along Z
  if (size.x > size.z) inner.rotation.y = Math.PI / 2;

  // re-measure after rotation
  bb = new Box3().setFromObject(inner);
  const size2 = bb.getSize(new Vector3());
  const lengthAxis = Math.max(size2.z, 0.001);
  const s = targetLen / lengthAxis;
  inner.scale.setScalar(s);

  // recolour: tint the largest mesh(es) as the body; keep dark parts dark
  if (color != null) {
    const base = new TColor(color);
    inner.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        o.material = mats.map((m) => {
          const nm = m.clone();
          if (nm.color) {
            // Meshy car bodies are mostly one big mesh in a neutral grey. Repaint
            // everything to the chosen colour (the model has little internal
            // material variation, so this reads as a solid coloured car).
            nm.color.copy(base);
            nm.emissive = new TColor(color).multiplyScalar(0.06); // lift from black
          }
          nm.metalness = 0.3; nm.roughness = 0.5; nm.flatShading = false;
          nm.side = DoubleSide;   // GLB rear faces can be single-sided -> black
          nm.needsUpdate = true;
          return nm;
        });
        if (!Array.isArray(o.material)) o.material = o.material[0];
        o.castShadow = true;
      }
    });
  }

  // wrap so we can ground it cleanly
  const wrap = new TGroup();
  wrap.add(inner);
  const gbb = new Box3().setFromObject(inner);
  const c = gbb.getCenter(new Vector3());
  inner.position.x -= c.x;
  inner.position.z -= c.z;
  inner.position.y -= gbb.min.y;

  // soft contact shadow blob
  const dims = new Box3().setFromObject(inner).getSize(new Vector3());
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.x * 1.3, dims.z * 1.15),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03;
  wrap.add(blob);

  wrap.userData.dims = { W: dims.x, L: dims.z, H: dims.y };
  // night headlight beams for GLB cars too
  addHeadlightBeams(wrap, { W: dims.x, L: dims.z, FWD: -1 });
  return wrap;
}

// Build a model for a logical kind, preferring GLB if available.
// targetLen in metres (full length). Always returns a Group-like Object3D.
export function buildModel(kind, color, fallbackFactory, targetLen) {
  const root = glbCache[kind];
  if (root) return normalizeGLB(root, targetLen, color);
  return fallbackFactory();
}

export { flat, box };
