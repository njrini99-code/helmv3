const { chromium } = require('playwright');
const [layout, bundle, hole] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const logs = [];
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:8774/?layout=${layout}&bundle=${bundle}&hole=${hole}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas[data-terrain-state="ready"]', { timeout: 60000 });
  const alive = () => page.evaluate(() => document.querySelectorAll('canvas').length);
  await page.evaluate(() => dispatchEvent(new Event('resize'))); await page.waitForTimeout(500);
  console.log('same-size resize: canvases', await alive(), logs.splice(0));
  for (const h of [900, 948, 1200, 600, 400]) {
    await page.setViewportSize({ width: 390, height: h }); await page.waitForTimeout(800);
    console.log('viewport 390x' + h, 'canvases', await alive(), logs.splice(0));
    if (!(await alive())) { await page.reload(); await page.waitForSelector('canvas[data-terrain-state="ready"]', { timeout: 60000 }); }
  }
  await browser.close();
})();
