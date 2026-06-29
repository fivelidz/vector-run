// stress_test.js — exercises the collision-count police model & roadblocks.
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME || '/home/fivelidz/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8099/index.html';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 400 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__game.menus.hideAll(); window.__game.startRun(); });
  await page.waitForTimeout(300);

  // drive the collision-count model directly (cooldown-spaced hits)
  const seq = await page.evaluate(() => {
    const g = window.__game; const out = {};
    g.police.time = 0; g.police.collisions = 0; g.police.lastHitTime = -999;
    g.police.time = 5;  out.h1 = g.police.registerCollision();   // 1
    out.activeAfter1 = g.police.active;
    g.police.time = 15; out.h2 = g.police.registerCollision();   // 2 -> active
    out.activeAfter2 = g.police.active;
    g.police.time = 25; out.h3 = g.police.registerCollision();   // 3 within window -> wreck
    // cooldown ignore
    g.police.time = 25.5; out.hCooldown = g.police.registerCollision();
    return out;
  });
  console.log('collision sequence:', JSON.stringify(seq));

  // window expiry resets the streak (no bust)
  const expiry = await page.evaluate(() => {
    const g = window.__game; g.police.collisions = 0; g.police.lastHitTime = -999;
    g.police.time = 100; const a = g.police.registerCollision();   // 1
    g.police.time = 100 + 60; const b = g.police.registerCollision(); // >45s later -> fresh streak (1)
    return { a, b, collisions: g.police.collisions };
  });
  console.log('window expiry:', JSON.stringify(expiry));

  // roadblocks appear while actively chasing
  let roadblock = false;
  await page.evaluate(() => { const g = window.__game; g.police.active = true; g.police.collisions = 2; g.police._hazardTimer = 0; });
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    if (await page.evaluate(() => window.__game.traffic.active.some(e => e.type === 'block'))) { roadblock = true; break; }
  }
  console.log('roadblock spawned while chasing:', roadblock);

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  const ok = errors.length === 0 &&
    seq.h1 === 'counted' && seq.activeAfter1 === false &&
    seq.h2 === 'counted' && seq.activeAfter2 === true &&
    seq.h3 === 'wreck' && seq.hCooldown === 'ignored' &&
    expiry.collisions === 1 && roadblock;
  console.log(ok ? '✅ STRESS TEST PASSED (collision-count police + roadblocks)' : '❌ STRESS TEST FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
