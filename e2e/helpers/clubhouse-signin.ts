import { expect, type Page } from '@playwright/test';

/**
 * Signs a seeded user in through the Clubhouse sign-in screen. A dev server can hydrate after the first fill and wipe
 * it, or reload the page for a recompile after the click, so the whole sign-in repeats until the page leaves login.
 */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  // A dev server that restarts itself near its memory limit drops the first request; try again.
  await expect(async () => {
    await page.goto('/golf/login', { timeout: 120_000 });
  }).toPass({ timeout: 480_000, intervals: [2_000, 5_000] });
  const button = page.getByRole('button', { name: 'Sign in' });
  await expect(async () => {
    if (!new URL(page.url()).pathname.endsWith('/login')) return;
    await page.locator('#golf-signin-email').fill(email);
    await page.locator('#golf-signin-password').fill(password);
    await expect(button).toBeEnabled({ timeout: 2000 });
    await button.click();
    await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 90_000 });
  }).toPass({ timeout: 480_000 });
}
