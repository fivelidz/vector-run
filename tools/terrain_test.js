// terrain_test.js — fast-forwards distance through all themes, verifies the
// sky/ground colors actually change, and screenshots a few biomes.
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = process.env.CHROME || '/home/fivelidz/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8099/index.html';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 440 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__game.menus.hideAll(); window.__game.startRun(); });
  await page.waitForTimeout(200);

  const themeIds = await page.evaluate(() => window.__game.terrain.constructor && Array.from(document.querySelectorAll('x')).length ? [] : (window.THEMES || []).map(t => t.id));
  const skies = [];
  const dist = [200, 1450, 2650, 3850, 5050, 6250]; // mid-points of each theme
  let shot = 0;
  for (const d of dist) {
    // teleport distance & force a terrain update + a few frames to settle crossfade
    const info = await page.evaluate((D) => {
      const g = window.__game;
      g.player.distance = D;
      g.terrain._lastBase = -1;      // force scenery rebuild
      const t = g.terrain.update(D);
      // read engine sky color
      const sky = g.engine.scene.background.getHexString();
      const fog = g.engine.scene.fog.color.getHexString();
      const ground = g.road.grassMesh.material.color.getHexString();
      const sceneryCount = g.road.scenery.length;
      const propKinds = g.road.scenery.slice(0, 4).map(s => s.children.length);
      return { name: t.name, night: t.night, sky, fog, ground, sceneryCount };
    }, d);
    skies.push(info.sky);
    console.log(`@${d}m  ${info.name.padEnd(14)} sky#${info.sky} ground#${info.ground} night:${info.night} props:${info.sceneryCount}`);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__game.menus.hideAll());
    await page.screenshot({ path: path.join(__dirname, '..', 'docs', `biome_${shot}.png`) });
    shot++;
  }

  const distinctSkies = new Set(skies).size;
  console.log('\ndistinct sky colors:', distinctSkies, 'of', skies.length);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  const ok = errors.length === 0 && distinctSkies >= 4;
  console.log(ok ? '\n✅ TERRAIN TEST PASSED (themes visually distinct)' : '\n❌ TERRAIN TEST FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
