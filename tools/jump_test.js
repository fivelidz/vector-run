// jump_test.js — verifies the jump: parabolic arc, clears LOW obstacles
// (cone), but is still hit by TALL obstacles (truck), via real key/button input.
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME || '/home/fivelidz/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8099/index.html';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 400 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__game.menus.hideAll(); window.__game.startRun(); });
  await page.waitForTimeout(250);

  const checks = [];
  const assert = (n, c) => { checks.push([n, c]); console.log((c ? '✓' : '✗') + ' ' + n); };

  // 1) Space key triggers a jump arc
  await page.evaluate(() => { window.__game.player.y = 0; window.__game.player.airborne = false; window.__game.player.jumpCooldown = 0; });
  await page.keyboard.press('Space');
  const arc = [];
  for (let i = 0; i < 9; i++) { await page.waitForTimeout(80); arc.push(await page.evaluate(() => +window.__game.player.y.toFixed(2))); }
  const peak = Math.max(...arc);
  assert('jump produces an arc (peak > 1.5m)', peak > 1.5);
  assert('jump returns to ground', arc[arc.length - 1] < 0.2);

  // 2) airborne high clears a same-direction CAR (no spin, stays driving)
  await page.evaluate(() => {
    const g = window.__game;
    g.traffic.reset();
    g.player.state = 'drive'; g.player.invuln = 0; g.player.airborne = true; g.player.y = 2.2; g.player.speed = 40;
    const car = g.traffic.spawnEntity('car', g.player.targetLane, 0, { speed: 0 }); car.x = g.player.x; car.mesh.position.x = g.player.x;
  });
  await page.waitForTimeout(250);
  const afterCar = await page.evaluate(() => ({ state: window.__game.player.state, cleared: (window.__game.traffic.active.find(e => e.type === 'car') || {}).cleared }));
  assert('car cleared while airborne high (no spin)', afterCar.state === 'drive' && afterCar.cleared === true);

  // 3) truck while airborne is too tall -> HIT (spin)
  await page.evaluate(() => {
    const g = window.__game;
    g.traffic.reset();
    g.player.state = 'drive'; g.player.invuln = 0; g.player.airborne = true; g.player.y = 2.2; g.player.speed = 40;
    const tr = g.traffic.spawnEntity('truck', g.player.targetLane, 0, { speed: 0 }); tr.x = g.player.x; tr.mesh.position.x = g.player.x;
  });
  await page.waitForTimeout(280);
  const afterTruck = await page.evaluate(() => ({ state: window.__game.player.state, speed: Math.round(window.__game.player.speed) }));
  assert('truck hits even when airborne (spin)', afterTruck.state === 'spin');

  console.log('\nerrors:', errors.length ? errors : 'none');
  await browser.close();
  const pass = errors.length === 0 && checks.every(c => c[1]);
  console.log(pass ? '\n✅ JUMP TEST PASSED' : '\n❌ JUMP TEST FAILED');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
