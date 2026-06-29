// mechanics_test.js — verifies the feedback-driven changes:
//  - far-right lane reachable
//  - cones/barriers KNOCK aside (+points, no spin)
//  - ramp LAUNCHES the player (airborne, no damage)
//  - police cruiser cannot OVERTAKE (z stays behind player)
//  - guaranteed passable route (no fully-blocked forward band)
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME || '/home/fivelidz/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8099/index.html';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 400 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__game.menus.hideAll(); window.__game.startRun(); window.__game.input.setMode('free'); });
  await page.waitForTimeout(200);

  const checks = []; const assert = (n, c) => { checks.push([n, c]); console.log((c ? '✓' : '✗') + ' ' + n); };

  // far-right lane reachable
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 14; i++) await page.waitForTimeout(100);
  await page.keyboard.up('KeyD');
  const far = await page.evaluate(() => ({ x: window.__game.player.x, far: window.__game.road.laneX(4) }));
  assert('far-right lane reachable', far.x > far.far - 1.0);

  // cone knock: no spin, points go up
  const knock = await page.evaluate(() => {
    const g = window.__game; g.traffic.reset(); g.player.state = 'drive'; g.player.invuln = 0; g.player.airborne = false; g.player.y = 0;
    const before = g.score;
    const cone = g.traffic.spawnEntity('cone', g.player.targetLane, 0); cone.x = g.player.x; cone.mesh.position.x = g.player.x;
    return before;
  });
  await page.waitForTimeout(250);
  const afterKnock = await page.evaluate(() => ({ state: window.__game.player.state, score: window.__game.score }));
  assert('cone knocked (no spin)', afterKnock.state === 'drive');
  assert('cone awarded points', afterKnock.score > knock);

  // ramp launch
  await page.evaluate(() => {
    const g = window.__game; g.traffic.reset(); g.player.state = 'drive'; g.player.invuln = 0; g.player.airborne = false; g.player.y = 0;
    const r = g.traffic.spawnEntity('ramp', g.player.targetLane, 0); r.x = g.player.x; r.mesh.position.x = g.player.x;
  });
  await page.waitForTimeout(150);
  const afterRamp = await page.evaluate(() => ({ airborne: window.__game.player.airborne, y: +window.__game.player.y.toFixed(2) }));
  assert('ramp launches player airborne', afterRamp.airborne === true && afterRamp.y > 0.3);

  // police no-overtake: cops active, run many frames, cruiser z must stay behind
  const pol = await page.evaluate(async () => {
    const g = window.__game; g.player.airborne = false; g.player.y = 0; g.player.state = 'drive';
    g.police.active = true; g.police.collisions = 2; g.police.lastHitTime = g.police.time;
    const c = g.police._spawnCruiser();
    let minZ = 999;
    for (let i = 0; i < 200; i++) { g.police.update(1 / 60, g.player, 1, () => {}, g.director.current); if (c.mesh.visible) minZ = Math.min(minZ, c.z); }
    return { minZ: +minZ.toFixed(2) };
  });
  assert('police never overtake (z stays > 0 behind player)', pol.minZ > 0.5);

  // passable route over time
  let blocked = 0, total = 0;
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const g = window.__game; const sec = g.director.current; const onc = sec.oncomingLanes || 0; const n = sec.lanes;
      const bands = {};
      for (const e of g.traffic.active) { if (e.oncoming || e.type === 'coin' || e.type === 'ramp') continue; if (e.z > 5 || e.z < -150) continue; const band = Math.floor(e.z / 12); (bands[band] = bands[band] || new Set()).add(e.lane); }
      let b = 0, t = 0; for (const k in bands) { t++; const occ = bands[k]; let free = 0; for (let l = onc; l < n; l++) if (!occ.has(l)) free++; if (free === 0) b++; }
      return { b, t };
    });
    blocked += r.b; total += r.t;
  }
  assert('always a passable forward route (0 blocked bands)', blocked === 0);
  console.log(`  (${total} bands sampled, ${blocked} blocked)`);

  console.log('\nerrors:', errors.length ? errors : 'none');
  await browser.close();
  const pass = errors.length === 0 && checks.every(c => c[1]);
  console.log(pass ? '\n✅ MECHANICS TEST PASSED' : '\n❌ MECHANICS TEST FAILED');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
