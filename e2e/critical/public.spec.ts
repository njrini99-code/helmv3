import { expect, test } from '@playwright/test';

const publicRoutes = ['/', '/golf', '/baseball'];

for (const route of publicRoutes) {
  test(`critical public route loads: ${route}`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });
}
