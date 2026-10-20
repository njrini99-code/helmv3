import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Component depth audit (owner brief, 2026-10-01): every Clubhouse preview screen at a phone and a desktop size, so a
 * material change can be compared before and after on the same data and viewport. Resting appearance only: no motion,
 * no device, no Safari trace. Screenshots go to SHOTS_DIR/<label>/ (default e2e/.materials, untracked).
 *
 * LOCAL ONLY (the preview routes need a dev server):
 *   SHOTS_LABEL=after PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/clubhouse-materials.spec.ts --project=chromium
 * SHOTS_ONLY=messages,stats limits the screens; SHOTS_SIZES=phone or desktop limits the sizes.
 */

test.skip(!process.env.PLAYWRIGHT_BASE_URL?.includes('localhost'), 'Material screenshots run against a local dev server');
test.describe.configure({ mode: 'serial' });
// Retina density, as a phone shows them: a 1x capture viewed on a phone is upscaled and reads as blurry.
test.use({ deviceScaleFactor: 2 });

const LABEL = process.env.SHOTS_LABEL ?? 'current';
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 860 },
].filter((s) => !process.env.SHOTS_SIZES || process.env.SHOTS_SIZES.split(',').includes(s.name));
const SCREENS: Array<{ name: string; path: string; act?: (page: Page, size: string) => Promise<void> }> = [
  { name: 'home', path: '/clubhouse-preview/home' },
  { name: 'home-player', path: '/clubhouse-preview/home-player' },
  { name: 'stats', path: '/clubhouse-preview/stats' },
  { name: 'stats-player', path: '/clubhouse-preview/player' },
  { name: 'calendar', path: '/clubhouse-preview/calendar' },
  { name: 'roster', path: '/clubhouse-preview/roster' },
  { name: 'qualifiers', path: '/clubhouse-preview/qualifiers' },
  { name: 'qualifier', path: '/clubhouse-preview/qualifier' },
  { name: 'rounds', path: '/clubhouse-preview/rounds' },
  { name: 'classes', path: '/clubhouse-preview/classes' },
  { name: 'hub', path: '/clubhouse-preview/hub' },
  { name: 'coachhelm', path: '/clubhouse-preview/coachhelm' },
  { name: 'settings-switches', path: '/clubhouse-preview/settings?section=notifications' },
  {
    name: 'messages',
    path: '/clubhouse-preview/messages',
    act: async (page, size) => {
      if (size !== 'phone') return;
      const row = page.locator('.ch-msp-row, [class*="ch-msp-list"] a, [class*="ch-msp-list"] button').first();
      if (await row.count()) await row.click().catch(() => undefined);
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'menu',
    path: '/clubhouse-preview/home?teams=2',
    act: async (page) => {
      const switcher = page.locator('[aria-haspopup="menu"], [aria-haspopup="listbox"]').first();
      if (await switcher.count()) await switcher.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    },
  },
];
const ONLY = process.env.SHOTS_ONLY?.split(',');

async function shot(page: Page, size: string, name: string) {
  // Outside test-results/, which Playwright empties at the start of every run.
  const dir = `${process.env.SHOTS_DIR ?? 'e2e/.materials'}/${LABEL}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${size}-${name}.png` });
}

test(`material screenshots: ${LABEL}`, async ({ page }) => {
  test.setTimeout(60 * 60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const screen of SCREENS) {
      if (ONLY && !ONLY.includes(screen.name)) continue;
      // A dev-server reload can abort a navigation: try again.
      for (let tries = 0; ; tries += 1) {
        try {
          await page.goto(screen.path, { timeout: 420_000 });
          break;
        } catch (e) {
          if (tries >= 2) throw e;
          await page.waitForTimeout(3000);
        }
      }
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
      await page.evaluate(() => document.fonts.ready);
      // The dev server's Next.js badge is not part of the app.
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      await page.waitForTimeout(600);
      await screen.act?.(page, size.name);
      await shot(page, size.name, screen.name);
      if (screen.name === 'messages') {
        const box = page.locator('.ch-ms-comp textarea').first();
        if (await box.count()) {
          await box.click();
          await box.fill('Tee times moved to 8:10. Bring the yardage books.');
          await shot(page, size.name, 'messages-focus');
        }
      }
    }
  }
});
