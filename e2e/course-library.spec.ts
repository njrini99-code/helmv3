import { test, expect } from '@playwright/test';

/**
 * Cloud Course Library E2E (Phase 6).
 *
 * Route under test: /golf/dashboard/courses (server component →
 * CourseLibraryClient) plus the new-round "Browse course library" entry
 * point that opens the tee picker (TeePickerDrawer).
 *
 * SCOPE — why this is split into two describe blocks:
 *
 * The CI harness (.github/workflows/playwright.yml) has NO seeded
 * authenticated fixture. There is no storageState / global-setup, and the
 * accessibility spec deliberately tests public routes only "so this runs
 * cleanly in CI without requiring seeded users". The hard-coded creds in
 * golf-dashboard.spec.ts / golf-round.spec.ts are a personal local account,
 * not a CI-seeded one. So the always-on, deterministic contract here is the
 * UNAUTHENTICATED one: the dashboard route is protected by middleware
 * (src/lib/supabase/middleware.ts) and redirects unauthenticated users to
 * /golf/login?returnTo=<path> — never a 404 or 500.
 *
 * The AUTHENTICATED flow is written too, but gated behind opt-in env vars
 * (E2E_GOLF_EMAIL / E2E_GOLF_PASSWORD) and test.skip()'d when they are
 * absent, so it never flakes CI. Set those to a seeded coach/player login
 * (against your test database) to exercise the real library + tee picker.
 */

const COURSES_PATH = '/golf/dashboard/courses';

// ── Unauthenticated contract (always runs, CI-safe) ──────────────────────
test.describe('Cloud Course Library — unauthenticated contract', () => {
  test('redirects /golf/dashboard/courses to golf login (not 404/500)', async ({
    page,
  }) => {
    const response = await page.goto(COURSES_PATH);

    // The navigation itself must not be a server error. A redirect resolves
    // to the login page's status, so assert we never landed on a 4xx/5xx.
    const status = response?.status() ?? 0;
    expect(status, `HTTP status for ${COURSES_PATH}`).toBeLessThan(400);

    // Middleware redirects protected golf routes to the sport login with a
    // returnTo pointing back at the originally requested path.
    await page.waitForURL('**/golf/login**', { timeout: 10000 });
    expect(page.url()).toContain('/golf/login');
    expect(page.url()).toContain(`returnTo=${encodeURIComponent(COURSES_PATH)}`);
  });

  test('golf login page renders its email + password form', async ({ page }) => {
    await page.goto('/golf/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

// ── Authenticated flow (opt-in: set E2E_GOLF_EMAIL / E2E_GOLF_PASSWORD) ───
//
// These run only when a seeded login is provided, matching the per-spec
// form-login pattern used by golf-dashboard.spec.ts / golf-round.spec.ts.
const GOLF_EMAIL = process.env.E2E_GOLF_EMAIL;
const GOLF_PASSWORD = process.env.E2E_GOLF_PASSWORD;
const hasSeededAuth = Boolean(GOLF_EMAIL && GOLF_PASSWORD);

test.describe('Cloud Course Library — authenticated flow', () => {
  test.skip(
    !hasSeededAuth,
    'Set E2E_GOLF_EMAIL and E2E_GOLF_PASSWORD (seeded golf coach/player) to run.',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/golf/login');
    await page.fill('input[type="email"]', GOLF_EMAIL as string);
    await page.fill('input[type="password"]', GOLF_PASSWORD as string);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
  });

  test('renders the course library', async ({ page }) => {
    await page.goto(COURSES_PATH);

    await expect(page).toHaveURL(/\/golf\/dashboard\/courses/);
    // CourseLibraryClient header.
    await expect(page.locator('h1')).toContainText('Courses');
    // Subtitle confirms the cloud-library count line rendered.
    await expect(page.getByText(/in the cloud library/i)).toBeVisible();
  });

  test('search filters the library', async ({ page }) => {
    await page.goto(COURSES_PATH);
    await expect(page.locator('h1')).toContainText('Courses');

    const search = page.getByLabel('Search courses');
    await expect(search).toBeVisible();

    // A nonsense query must always resolve to the empty-results branch
    // ("No courses match …") regardless of library contents — deterministic.
    await search.fill('zzzqqq-no-such-course-xyz');
    await expect(page.getByText(/No courses match/i)).toBeVisible();

    // Clearing the query restores the full (unfiltered) view.
    await search.fill('');
    await expect(page.getByText(/No courses match/i)).toHaveCount(0);
  });

  test('"Browse course library" on new round opens the tee picker', async ({
    page,
  }) => {
    await page.goto('/golf/dashboard/rounds/new');

    const browse = page.getByRole('button', { name: /Browse course library/i });
    // Only present when not resuming an in-progress round; guard so the test
    // is honest about that precondition rather than hanging.
    await expect(browse).toBeVisible();
    await browse.click();

    // TeePickerDrawer opens as a dialog (Vaul bottom-sheet). Its own course
    // search input ("Search courses…") confirms the picker mounted.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByPlaceholder(/Search courses/i).or(page.getByPlaceholder(/Search courses/i)),
    ).toBeVisible();
  });

  // Capture screenshots of the premium course picker for review as CI artifacts
  // (uploaded by .github/workflows/playwright.yml). Requires
  // NEXT_PUBLIC_REDESIGN=true so the redesign FairwayCoursePicker renders
  // (otherwise this shoots the legacy TeePickerDrawer). Best-effort — the point
  // is the image, not a gate; a missing affordance skips rather than fails.
  test('capture: premium course picker screenshots', async ({ page }) => {
    const dir = 'e2e-screenshots';

    await page.goto('/golf/dashboard/rounds/new');
    const browse = page.getByRole('button', { name: /Browse course library/i });
    if (!(await browse.isVisible().catch(() => false))) {
      test.skip(true, 'New-round "Browse course library" CTA not present (resuming a round?).');
      return;
    }
    await browse.click();

    // Wait for the picker sheet, then let the entrance + coverflow settle.
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${dir}/picker-desktop-stage-a.png` });

    // If the carousel has cards, advance it once to capture the coverflow mid-state.
    const next = page.getByRole('button', { name: /Next course/i });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${dir}/picker-desktop-coverflow.png` });
    }

    // Mobile full-screen view (the primary form factor for this sheet).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/picker-mobile-stage-a.png` });

    // The standalone library page too (CourseLibraryClient), for completeness.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(COURSES_PATH);
    await expect(page.locator('h1')).toContainText('Courses', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/course-library-page.png`, fullPage: true });
  });
});
