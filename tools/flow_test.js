// flow_test.js — verifies the full UI flow: menu → play → pause → resume →
// game over → retry → quit to menu, plus car select & settings, via real clicks.
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME || '/home/fivelidz/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8099/index.html';

const sel = '#'; // shorthand
async function visible(page, id) { return page.evaluate((i) => { const e = document.getElementById(i); return e && !e.classList.contains('hidden'); }, id); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 400 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const checks = [];
  const assert = (name, cond) => { checks.push([name, cond]); console.log((cond ? '✓' : '✗') + ' ' + name); };

  assert('menu visible at start', await visible(page, 'menu'));

  // PLAY
  await page.click('#btn-play'); await page.waitForTimeout(400);
  assert('hud visible after play', await visible(page, 'hud'));
  assert('state is play', (await page.evaluate(() => window.__game.state)) === 'play');

  // PAUSE via button
  await page.click('#btn-pause'); await page.waitForTimeout(200);
  assert('pause overlay visible', await visible(page, 'pause'));
  // RESUME
  await page.click('#btn-resume'); await page.waitForTimeout(200);
  assert('resumed to play', (await page.evaluate(() => window.__game.state)) === 'play');

  // force game over
  await page.evaluate(() => window.__game._gameOver('wrecked'));
  await page.waitForTimeout(1400);
  assert('gameover overlay visible', await visible(page, 'gameover'));

  // RETRY
  await page.click('#btn-retry'); await page.waitForTimeout(400);
  assert('retry → play', (await page.evaluate(() => window.__game.state)) === 'play');

  // quit to menu via pause
  await page.click('#btn-pause'); await page.waitForTimeout(150);
  await page.click('#btn-quit'); await page.waitForTimeout(300);
  assert('quit → menu', await visible(page, 'menu'));

  // car select
  await page.click('#btn-cars'); await page.waitForTimeout(200);
  assert('cars overlay visible', await visible(page, 'cars'));
  const cells = await page.$$('.car-cell');
  assert('car grid populated', cells.length >= 3);
  await page.click('#btn-cars-back'); await page.waitForTimeout(150);

  // settings
  await page.click('#btn-settings'); await page.waitForTimeout(150);
  assert('settings overlay visible', await visible(page, 'settings'));
  await page.selectOption('#opt-steer', 'free'); await page.waitForTimeout(100);
  assert('steer mode applied', (await page.evaluate(() => window.__game.input.mode)) === 'free');
  await page.click('#btn-settings-back');

  console.log('\nerrors:', errors.length ? errors : 'none');
  await browser.close();
  const pass = errors.length === 0 && checks.every(c => c[1]);
  console.log(pass ? '\n✅ FLOW TEST PASSED' : '\n❌ FLOW TEST FAILED');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
