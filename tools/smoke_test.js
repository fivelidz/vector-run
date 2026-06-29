// smoke_test.js — headless browser smoke test for Vector Run.
// Loads the game, captures console errors, starts a run, simulates input,
// runs for a few seconds of game time, reads internal state, screenshots.
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = process.env.CHROME ||
  '/home/fivelidz/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8099/index.html';
const OUT = path.join(__dirname, '..', 'docs', 'screenshot.png');

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
           '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 440 } });
  const page = await ctx.newPage();

  const errors = [];
  const logs = [];
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

  console.log('→ loading', URL);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // game object should exist
  const hasGame = await page.evaluate(() => !!window.__game);
  console.log('game object present:', hasGame);

  // start a run programmatically (also hide menu overlays for a clean shot)
  await page.evaluate(() => { window.__game.menus.hideAll(); window.__game.startRun(); });
  await page.waitForTimeout(300);

  // simulate driving: lane changes + boost over a few seconds
  for (let i = 0; i < 18; i++) {
    await page.evaluate((d) => {
      const g = window.__game;
      // force a lane change pulse
      g.input.laneDir = d;
      g.input._boostHeld = Math.random() < 0.5;
    }, i % 2 === 0 ? -1 : 1);
    await page.waitForTimeout(160);
  }

  // let it run a bit more to build distance/heat
  await page.waitForTimeout(2500);

  // clean in-game screenshot
  await page.evaluate(() => window.__game.menus.hideAll());
  await page.screenshot({ path: require('path').join(__dirname, '..', 'docs', 'gameplay.png') });

  // read internal state
  const state = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state,
      distance: Math.round(g.player.distance),
      speed: Math.round(g.player.speed),
      score: Math.round(g.score),
      heat: Math.round(g.police.heat),
      stars: g.police.stars,
      activeTraffic: g.traffic.active.length,
      cruisers: g.police.cruisers.filter(c => c.mesh.visible).length,
      section: g.director.current.name,
      fps: g._fps,
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  // force a collision to test spin/flash by spawning a car right on player
  const impactRes = await page.evaluate(() => {
    const g = window.__game;
    const e = g.traffic.spawnEntity('car', g.player.targetLane, 0.5, { speed: 0 });
    e.x = g.player.x; e.mesh.position.x = g.player.x;
    // run one collision check
    return { before: Math.round(g.player.speed), state: g.player.state };
  });
  await page.waitForTimeout(600);
  const afterImpact = await page.evaluate(() => ({
    speed: Math.round(window.__game.player.speed),
    state: window.__game.player.state,
    invuln: +window.__game.player.isInvuln(),
  }));
  console.log('IMPACT before:', impactRes, 'after:', afterImpact);

  await page.screenshot({ path: OUT });
  console.log('screenshot →', OUT);

  // report
  if (logs.length) { console.log('\n--- CONSOLE ---'); logs.slice(0, 40).forEach(l => console.log(l)); }
  if (errors.length) {
    console.log('\n!!! ERRORS !!!');
    errors.forEach(e => console.log(e));
  } else {
    console.log('\n✓ no page errors / failed requests');
  }

  await browser.close();

  // exit non-zero if errors or game didn't progress
  const ok = errors.length === 0 && state.distance > 5 && state.state === 'play';
  console.log(ok ? '\n✅ SMOKE TEST PASSED' : '\n❌ SMOKE TEST FAILED');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(2); });
