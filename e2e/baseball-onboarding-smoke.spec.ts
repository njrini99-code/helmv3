/**
 * e2e/baseball-onboarding-smoke.spec.ts — anonymous onboarding render smoke
 * (#372, Phase 2 Task 4).
 *
 * Runs with NO storageState under the default `chromium` Playwright project
 * — it never logs in and never creates a persistent account. It exists to
 * satisfy the "onboarding" criterion of the mandatory smoke suite without
 * the nondeterminism of real account creation inside a non-skippable test.
 *
 * COVERAGE:
 *   1. /baseball/signup renders the account-creation form (this is the one
 *      onboarding-adjacent route an anonymous visitor can actually reach —
 *      see point 2).
 *   2. /baseball/coach-onboarding is a hybrid route that serves BOTH the
 *      anonymous "create my program + account" wizard AND the
 *      already-authenticated "finish onboarding" flow, so it renders real
 *      onboarding content (the coach-type picker) for a logged-out visitor.
 *      This is the `(onboarding)` route smoke called for by the plan.
 *   3. /baseball/player (the player onboarding wizard) is SELF-only — it
 *      requires an authenticated `player` session and bounces anonymous
 *      visitors to /baseball/login. We assert that denial here as a security
 *      regression guard, since it's the only thing an anonymous visitor can
 *      observe about that route.
 *
 * DEFERRED: full fresh-account onboarding — actually creating a brand-new
 * coach/player account, completing the multi-step wizard end-to-end, and
 * tearing the account down afterwards — is intentionally NOT covered here.
 * It needs account creation + cleanup that doesn't fit a mandatory,
 * always-green smoke test. Tracked as a separate follow-up issue (file one
 * referencing #372 if it doesn't already exist).
 */
import { test, expect } from '@playwright/test';
import { waitForPageLoad } from './helpers/common';

test.describe('BaseballHelm onboarding — anonymous render smoke', () => {
  test('signup page renders the account-creation form', async ({ page }) => {
    await page.goto('/baseball/signup', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page).catch(() => {});

    await expect(page.locator('#baseball-signup-email')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#baseball-signup-password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('coach onboarding wizard renders the coach-type step for an anonymous visitor', async ({
    page,
  }) => {
    await page.goto('/baseball/coach-onboarding', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page).catch(() => {});

    await expect(
      page.getByRole('heading', { name: /what type of coach are you/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('College Coach')).toBeVisible();
  });

  test('player onboarding route denies an anonymous visitor (bounces to login)', async ({
    page,
  }) => {
    await page.goto('/baseball/player', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/baseball\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/baseball\/login/);
  });
});
