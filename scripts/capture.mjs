// Screenshot helper for development and QA.
// Usage: node scripts/capture.mjs <url> <out.png> [width] [height] [waitMs] [--full] [--reduced]
import { chromium } from 'playwright';

const [url, out, width = '1440', height = '900', wait = '2500', ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node scripts/capture.mjs <url> <out.png> [width] [height] [waitMs] [--full] [--reduced]');
  process.exit(1);
}
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height) },
  reducedMotion: flags.includes('--reduced') ? 'reduce' : 'no-preference',
});
const messages = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') messages.push(`${message.type()}: ${message.text()}`);
});
page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
await browser.close();
console.log(messages.length ? messages.join('\n') : 'console: clean');
