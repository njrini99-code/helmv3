import { expect, test } from '@playwright/test';

// All four `expect.poll` calls below check the same thing four times: did a
// scrollTo()/reload we just triggered actually take effect. That's a "did it
// happen" readiness check, not a perf budget or a "this should never appear"
// negative assertion — how LONG the scroll/reset takes to register carries
// no meaning of its own here, so a longer timeout doesn't weaken what's
// being verified. Raised from Playwright's 5000ms default to 15000ms
// 2026-08-19 (Wave L, Lane C): playwright.config.ts's CI workers 1->3 change
// introduced real CPU contention between concurrently-running specs, and
// this spec's own scroll assertion was observed missing the 5s window under
// that contention on real CI (run 06d564199, exact same "Expected: > 500,
// Received: 0" this test would throw) while never failing at workers=1. A
// genuine scroll/reset bug still fails at 15s; only false alarms from
// sibling-worker contention are what this buys back.
test('marketing route changes and reloads start at the page masthead', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.75));
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(500);

  await page.locator('nav[aria-label="Primary"] a[href="/products"]').click();
  await expect(page).toHaveURL(/\/products$/);
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.75));
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(500);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});
