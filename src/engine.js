// engine.js — Three.js renderer, scene, camera, lights, resize, shake.
import * as THREE from 'three';
import { CFG, PAL } from './config.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(PAL.sky, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.sky);
    this.scene.fog = new THREE.Fog(PAL.fog, 90, CFG.VISIBLE_AHEAD * 0.95);

    this.camera = new THREE.PerspectiveCamera(CFG.CAM_FOV_BASE, 1, 0.1, 800);
    this.camera.position.set(0, CFG.CAM_HEIGHT, CFG.CAM_BACK);
    this.camera.lookAt(0, 1.5, -CFG.CAM_LOOK_AHEAD);

    this._setupLights();

    this.shake = 0;            // current shake magnitude
    this._tmp = new THREE.Vector3();
    this._camBase = new THREE.Vector3();

    this.quality = 'high';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xcfeaff, 0x3a4a32, 0.85);
    this.hemi = hemi;
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
    sun.position.set(-18, 38, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const d = 40;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0008;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.amb = amb;
    this.scene.add(amb);
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') { this.renderer.setPixelRatio(Math.min(1, dpr)); this.renderer.shadowMap.enabled = false; }
    else if (q === 'med') { this.renderer.setPixelRatio(Math.min(1.5, dpr)); this.renderer.shadowMap.enabled = true; }
    else { this.renderer.setPixelRatio(Math.min(2, dpr)); this.renderer.shadowMap.enabled = true; }
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.setQuality(this.quality);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  addShake(mag) { this.shake = Math.min(2.2, this.shake + mag); }

  // Update camera follow + shake. target = {x} lateral of player, speed01 = 0..1
  updateCamera(targetX, speed01, dt) {
    // ease lateral follow (lag a touch behind player for feel)
    const desiredX = targetX * 0.55;
    this._camBase.set(desiredX, CFG.CAM_HEIGHT, CFG.CAM_BACK);
    this.camera.position.x += (this._camBase.x - this.camera.position.x) * Math.min(1, dt * 6);

    // FOV widens with speed
    const fov = CFG.CAM_FOV_BASE + CFG.CAM_FOV_SPEED * speed01;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    // shake
    if (this.shake > 0.001) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y = CFG.CAM_HEIGHT + (Math.random() - 0.5) * s;
      this.shake -= CFG.SHAKE_DECAY * s * dt;
      if (this.shake < 0.001) this.shake = 0;
    } else {
      this.camera.position.y += (CFG.CAM_HEIGHT - this.camera.position.y) * Math.min(1, dt * 8);
    }

    // winding-road curve: PAN the look-ahead point toward the bend only — no
    // screen roll. Rotating/rolling the whole view on every turn was making
    // players motion-sick; a pure lateral pan reads as "the road curves" while
    // keeping the horizon level and comfortable.
    const cb = this.curveBank || 0;
    const lookX = desiredX * 0.4 + cb * 70;
    this.camera.rotation.z = 0;

    // exit-ramp: a brief, gentle lateral sweep only (roll removed — same reason)
    if (this.bank && Math.abs(this.bank) > 0.001) {
      this.camera.position.x += this.bank * 4;
      this.camera.lookAt(desiredX * 0.4 + this.bank * 10, 1.4, -CFG.CAM_LOOK_AHEAD);
      return;
    }
    this.camera.lookAt(lookX, 1.4, -CFG.CAM_LOOK_AHEAD);
  }

  setBank(b) { this.bank = b; }
  setCurveBank(c) { this.curveBank = c; }

  render() { this.renderer.render(this.scene, this.camera); }
}
