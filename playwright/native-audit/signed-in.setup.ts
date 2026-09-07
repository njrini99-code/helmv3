import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Signs in once and writes storage state to HELM_AUDIT_STATE, which the audit
 * config requires to be OUTSIDE the repository. Storage state carries session
 * cookies; it is evidence-adjacent, never a committed artifact, and never
 * quoted in a report.
 */
setup('sign in as coach', async ({ page }) => {
  const email = process.env.HELM_AUDIT_EMAIL;
  const password = process.env.HELM_AUDIT_PASSWORD;
  const statePath = process.env.HELM_AUDIT_STATE;
  if (!email || !password || !statePath) {
    throw new Error('Set HELM_AUDIT_EMAIL, HELM_AUDIT_PASSWORD and HELM_AUDIT_STATE.');
  }
  if (statePath.includes('/worktrees/') || statePath.includes('helmv3')) {
    throw new Error('Refusing to write session state inside a checkout.');
  }

  await page.goto('/golf/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#golf-signin-email', email);
  await page.fill('#golf-signin-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/golf\/dashboard/, { timeout: 30_000 });
  await expect(page.locator('body')).toBeVisible();

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  await page.context().storageState({ path: statePath });
});
