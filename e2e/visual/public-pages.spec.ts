import { expect, test } from '@playwright/test';

/**
 * Visual regression for public marketing routes.
 * Update baselines: npm run e2e:visual:update
 */
const publicRoutes = [
  { path: '/', name: 'landing' },
  { path: '/golf', name: 'golf-landing' },
  { path: '/baseball', name: 'baseball-landing' },
] as const;

for (const route of publicRoutes) {
  test(`visual: ${route.name}`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: true,
      mask: [page.locator('[data-testid="animated-counter"]')],
    });
  });
}
