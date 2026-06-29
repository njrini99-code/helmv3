import { expect, test } from '@playwright/test';

const demoEmail = process.env.E2E_GOLF_EMAIL;
const demoPassword = process.env.E2E_GOLF_PASSWORD;
const authSmokeReady = Boolean(
  demoEmail && demoPassword && process.env.E2E_AUTH_SMOKE_ENABLED === 'true'
);
const authSmokeTest = authSmokeReady ? test : test.skip;

test.describe('Helm smoke checks', () => {
  test('landing page loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });

  test('golf login page loads', async ({ page }) => {
    await page.goto('/golf/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  });

  test('protected golf dashboard redirects unauthenticated users', async ({ page }) => {
    await page.goto('/golf/dashboard');
    await expect(page).toHaveURL(/\/golf\/login|\/login/);
  });

  authSmokeTest('demo golf user can open dashboard when credentials are configured', async ({ page }) => {
    const email = demoEmail ?? '';
    const password = demoPassword ?? '';

    await page.goto('/golf/login');
    await page.locator('input[type="email"], input[name="email"]').fill(email);
    await page.locator('input[type="password"], input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/golf\/dashboard/, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/dashboard|round|team|coach/i, {
      timeout: 10_000,
    });
  });
});
