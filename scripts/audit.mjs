// End-to-end audit against the built preview: console errors/warnings on every view at desktop,
// 390 px (also checks horizontal overflow) and reduced motion; keyboard shortcuts and view
// transitions; and a full showcase loop that must not touch the saved session.
// Usage: pnpm build && pnpm preview  (other terminal)  then  pnpm test:e2e
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4631';
const ROUTES = ['/', '/productos', '/productos/dl-lim-001', '/pedidos', '/sincronizacion', '/reglas', '/canales', '/reportes'];
const STORAGE_KEY = 'dl-sync-demo-v3';
const browser = await chromium.launch({ channel: 'chrome' });
const problems = [];
let checks = 0;

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`[${label}] ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`[${label}] pageerror: ${error.message}`));
}

async function sweep(name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  watch(page, name);
  for (const route of ROUTES) {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    for (let y = 0; y < 8; y++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`[${name}] ${route}: horizontal overflow ${overflow}px`);
    checks += 1;
  }
  await context.close();
}

await sweep('desktop', { viewport: { width: 1440, height: 900 } });
await sweep('mobile-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await sweep('reduced-motion', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });

// Keyboard: palette, help dialog, number keys through view transitions, manual sale, fast forward.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  watch(page, 'keyboard');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Control+k');
  if (!(await page.locator('[data-palette][open]').count())) problems.push('[keyboard] Ctrl+K did not open the palette');
  await page.keyboard.type('lavandina');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  if (!page.url().includes('/productos/')) problems.push('[keyboard] palette Enter did not open a product');
  await page.keyboard.press('Shift+?');
  if (!(await page.locator('[data-shortcuts][open]').count())) problems.push('[keyboard] ? did not open the shortcuts dialog');
  await page.keyboard.press('Escape');
  for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(700);
  }
  await page.keyboard.press('1');
  await page.waitForTimeout(800);
  await page.keyboard.press('v');
  await page.keyboard.press('f');
  await page.waitForTimeout(7000);
  const persisted = await page.evaluate((key) => localStorage.getItem(key) !== null, STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (!persisted) problems.push('[keyboard] session was not persisted to localStorage');
  checks += 1;
  await context.close();
}

// Showcase: clean state, no writes to the saved session, no console noise over a full loop.
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  watch(page, 'showcase');
  // The sentinel is written from inside the showcase page itself: a normal page would persist on pagehide.
  await page.goto(`${base}/?showcase`, { waitUntil: 'networkidle' });
  await page.evaluate((key) => localStorage.setItem(key, 'SENTINEL'), STORAGE_KEY);
  const started = Date.now();
  let loopedAt = 0;
  let sawReports = false;
  while (Date.now() - started < 40_000) {
    await page.waitForTimeout(250);
    const path = new URL(page.url()).pathname;
    if (path === '/reportes') sawReports = true;
    if (sawReports && !loopedAt && path === '/') loopedAt = Date.now() - started;
  }
  const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (saved !== 'SENTINEL') problems.push('[showcase] the saved session was overwritten');
  const cursor = await page.evaluate(() => getComputedStyle(document.body).cursor);
  if (cursor !== 'none') problems.push(`[showcase] cursor is "${cursor}", expected none`);
  console.log(`showcase loop length ≈ ${loopedAt ? `${Math.round(loopedAt / 1000)} s` : 'more than 40 s'}`);
  checks += 1;
  await context.close();
}

await browser.close();
console.log(`${checks} checks run`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('audit: zero console errors or warnings, no horizontal overflow, showcase isolated');
