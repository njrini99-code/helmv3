// Entry World frame capture — runs in CI (entry-world-frames.yml) against
// `next start` on localhost:3000. Produces the frame set Fable reviews
// against the IMMACULATE final gate (docs/LANDING_ENTRY_WORLD_DESIGN.md,
// Amendment 2 §E). Never run on the local machine — browser work is
// CI-only for this project (machine stability mandate).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.FRAMES_BASE_URL ?? 'http://localhost:3000';
const OUT = 'entry-world-frames';

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile', width: 390, height: 844 },
];

// Static-page targets: full-page shots per viewport.
const PAGES = [
  { key: 'join', path: '/join' },
  { key: 'login', path: '/baseball/login' },
  { key: 'login-dawn', path: '/baseball/login?scene-variant=dawn' },
  { key: 'signup', path: '/baseball/signup' },
  { key: 'forgot', path: '/baseball/forgot-password' },
  { key: 'demo', path: '/baseball/demo' },
];

// Landing scroll-scrub steps: fraction of full scrollable height. Dense
// enough to land inside M1 exit, M3's pin (dock/screen1/2/3/phone), M4's
// slide-in, and M8.
const SCROLL_STEPS = {
  desktop: [0, 0.06, 0.12, 0.2, 0.28, 0.34, 0.4, 0.46, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92, 1],
  mobile: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1],
};

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureLanding(page, vpKey) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await settle(1200); // fonts, mount reveals, photo decode
  const total = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  for (const frac of SCROLL_STEPS[vpKey]) {
    // instant jump + generous settle so Lenis/springs come to rest
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(total * frac));
    await settle(900);
    const pct = String(Math.round(frac * 100)).padStart(3, '0');
    await page.screenshot({ path: `${OUT}/landing/${vpKey}/scroll-${pct}.png` });
  }
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: 'no-preference',
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await captureLanding(page, vp.key);

    for (const t of PAGES) {
      await page.goto(`${BASE}${t.path}`, { waitUntil: 'networkidle' });
      await settle(1500); // hydration — login shell renders client-side today
      await page.screenshot({ path: `${OUT}/pages/${vp.key}/${t.key}.png`, fullPage: true });
    }

    if (errors.length) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${OUT}/console-errors-${vp.key}.txt`, errors.join('\n'));
    }
    await ctx.close();
  }
  await browser.close();
  console.log('frames captured to', OUT);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
