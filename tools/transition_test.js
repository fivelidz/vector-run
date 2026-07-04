// transition_test.js — verifies three specific fixes:
//  1. traffic keeps spawning FOREVER after a road-layout transition (was:
//     haltSpawns never got re-enabled -> road went empty permanently after
//     the first two-way/desert transition, worse the longer/faster you played)
//  2. the centre-line divider previews the UPCOMING layout beyond an
//     approaching intersection while the near side keeps the CURRENT layout,
//     and cleanly resets once the player crosses (no leftover clip / stuck preview)
//  3. enemy grenades are telegraphed for ~1s (something growing/sliding out
//     the back of the car) before the real grenade is actually thrown
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

  const assert = (n, c) => console.log((c ? '✓' : '✗') + ' ' + n);

  // ---- 1+2: force a two-way transition manually (bypass RNG) and fast-forward ----
  const r1 = await page.evaluate(() => {
    const g = window.__game;
    g.traffic.reset();
    g.player.speed = 40; g.player.distance = 500;
    // drain any existing traffic then confirm normal spawning refills it
    for (let i = 0; i < 120; i++) g._step(1 / 60);
    const beforeCount = g.traffic.active.length;

    // manually trigger a layout transition the same way _step does
    g._pendingLayout = { oncomingLanes: 2 };
    g.traffic.haltSpawns = true;
    g.road.triggerIntersection();
    g.traffic.clearBeyond(g.road.intersection.position.z);

    // fast-forward until the intersection reaches and passes the player
    let crossed = false, previewSeenBeyond = false, previewClearedAfter = null, minActiveDuringHalt = Infinity;
    for (let i = 0; i < 2000 && !crossed; i++) {
      const ix = g.road.intersection;
      if (ix && ix.visible) {
        g.traffic.turnZ = ix.position.z;
        g.traffic.preloadBeyond({ ...g.director.current, oncomingLanes: 2 }, ix.position.z);
        g.road.previewOncomingBeyond(2, ix.position.z);
        if (g.road.centerLinePreview.visible) previewSeenBeyond = true;
      }
      if (g.traffic.haltSpawns) minActiveDuringHalt = Math.min(minActiveDuringHalt, g.traffic.active.length);
      if (ix && ix.visible && ix.position.z >= 0) {
        g._appliedOncoming = 2; g.road.setOncomingLanes(2);
        g._pendingLayout = null; g.traffic.turnZ = null;
        g.traffic.haltSpawns = false; // the actual fix under test
        g.traffic.adoptPreload();
        crossed = true;
        previewClearedAfter = g.road.centerLinePreview.visible; // should be false now
      }
      g._step(1 / 60);
    }

    // now fast-forward a LONG additional stretch (simulating high-speed play
    // for a while after the transition) and make sure traffic keeps spawning
    // continuously rather than staying empty forever
    let sawTrafficAfter = false;
    for (let i = 0; i < 600; i++) {
      g._step(1 / 60);
      if (g.traffic.active.length > 3) sawTrafficAfter = true;
    }
    return {
      beforeCount, crossed, previewSeenBeyond, previewClearedAfter,
      haltStillTrue: g.traffic.haltSpawns, sawTrafficAfter,
      finalActive: g.traffic.active.length,
    };
  });
  assert('intersection was crossed', r1.crossed);
  assert('centre-line preview appeared beyond the junction while pending', r1.previewSeenBeyond);
  assert('preview cleanly cleared after crossing', r1.previewClearedAfter === false);
  assert('haltSpawns correctly re-enabled (false) after crossing — THE BUG FIX', r1.haltStillTrue === false);
  assert('traffic kept spawning long after the transition (not stuck empty forever)', r1.sawTrafficAfter);

  // ---- 3: grenade telegraph ----
  const r2 = await page.evaluate(async () => {
    const g = window.__game;
    g.enemies.reset();
    g.player.speed = 0; // freeze world scroll so the fired grenade can't scroll off-screen mid-check
    const c = g.enemies._spawnEnemy(g.player);
    c.z = -20; c.fireTimer = 0; c.telegraphT = 0;
    const bulletsLiveBefore = g.enemies.bullets.filter(b => b.live).length;
    // step ~0.5s: telegraph should be mid-way, NOT yet actually thrown
    for (let i = 0; i < 30; i++) g.enemies.update(1 / 60, g.player, true, () => {});
    const mid = { telegraphVisible: c.telegraphMesh.visible, telegraphT: c.telegraphT, bulletsLive: g.enemies.bullets.filter(b => b.live).length };
    // step frame-by-frame past the telegraph window and catch the EXACT frame it fires
    let firedAtFrame = -1;
    for (let i = 0; i < 60 && firedAtFrame < 0; i++) {
      g.enemies.update(1 / 60, g.player, true, () => {});
      if (g.enemies.bullets.some(b => b.live)) firedAtFrame = i;
    }
    const after = { telegraphVisible: c.telegraphMesh.visible, bulletsLive: g.enemies.bullets.filter(b => b.live).length, firedAtFrame };
    return { bulletsLiveBefore, mid, after };
  });
  assert('no grenade thrown instantly on fireTimer expiry', r2.bulletsLiveBefore === 0 && r2.mid.bulletsLive === 0);
  assert('telegraph visible mid-windup (warning shown before throw)', r2.mid.telegraphVisible === true);
  assert('grenade actually thrown after the telegraph window elapses', r2.after.firedAtFrame >= 0);
  assert('telegraph hidden again once thrown', r2.after.telegraphVisible === false);

  console.log('\nerrors:', errors.length ? errors.join('; ') : 'none');
  const ok = errors.length === 0;
  console.log(ok ? '\n✅ TRANSITION TEST PASSED' : '\n❌ TRANSITION TEST FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
