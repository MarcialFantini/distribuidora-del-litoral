// Captures public/poster.jpg (1600x900) from the real running page.
// Usage: pnpm build && pnpm preview   (in another terminal)  then  pnpm poster
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://localhost:4631';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
// Let the engine start and a few orders flow, then trigger manual sales so pulses are mid-cable.
await page.waitForTimeout(5000);
for (const channel of ['mkt', 'web', 'own']) {
  await page.click(`[data-sell="${channel}"]`);
  await page.waitForTimeout(140);
}
await page.mouse.move(1599, 899);
await page.waitForTimeout(380);
const jpg = await page.screenshot({ type: 'jpeg', quality: 88 });
await writeFile('public/poster.jpg', jpg);
await browser.close();
console.log('public/poster.jpg written (1600x900)');
