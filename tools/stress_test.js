// stress_test.js — police chase model: cops appear after 2 crashes, you get
// busted only when a cruiser stays in CONTACT (caught), and you can outrun them.
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

  // 1) crashes raise wanted; cops appear after 2; a crash NEVER directly wrecks
  const seq = await page.evaluate(() => {
    const g = window.__game; const out = {};
    g.police.collisions = 0; g.police.lastHitTime = -999; g.police.active = false;
    g.police.time = 5;  out.h1 = g.police.registerCollision();   out.active1 = g.police.active;
    g.police.time = 15; out.h2 = g.police.registerCollision();   out.active2 = g.police.active;
    g.police.time = 15.2; out.hCooldown = g.police.registerCollision(); // debounced
    return out;
  });
  console.log('crash sequence:', JSON.stringify(seq));

  // 2) bust meter fills only while a cruiser is in contact; busts when full
  let bustedFired = false;
  const bust = await page.evaluate(async () => {
    const g = window.__game; g.police.active = true; g.police.collisions = 2;
    const c = g.police._spawnCruiser();
    g.player.speed = 5; // slow -> cop catches & rides bumper
    let maxBust = 0, busted = false;
    g.police.bust = 0;
    for (let i = 0; i < 240; i++) {
      // pin the cruiser onto the player to simulate being caught
      c.z = 1.0; c.x = g.player.x; c.mesh.visible = true;
      g.police.update(1 / 60, g.player, 1, (ev) => { if (ev === 'busted') busted = true; }, g.director.current);
      maxBust = Math.max(maxBust, g.police.bust);
    }
    return { maxBust: Math.round(maxBust), busted };
  });
  bustedFired = bust.busted;
  console.log('contact bust:', JSON.stringify(bust));

  // 3) outrunning (fast) drains the bust meter (no bust)
  const outrun = await page.evaluate(async () => {
    const g = window.__game; g.police.bust = 50; g.player.speed = 95;
    const c = g.police.cruisers.find(x => x.mesh.visible) || g.police._spawnCruiser();
    c.z = 40; // far behind (outrun)
    for (let i = 0; i < 120; i++) g.police.update(1 / 60, g.player, 1, () => {}, g.director.current);
    return { bust: Math.round(g.police.bust) };
  });
  console.log('outrun drain:', JSON.stringify(outrun));

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  const ok = errors.length === 0 &&
    seq.h1 === 'counted' && seq.active1 === false &&
    seq.h2 === 'counted' && seq.active2 === true &&
    seq.hCooldown === 'ignored' &&
    bust.busted === true && bust.maxBust >= 99 &&
    outrun.bust === 0;
  console.log(ok ? '✅ STRESS TEST PASSED (chase: appear@2, bust on contact, outrun drains)' : '❌ STRESS TEST FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
