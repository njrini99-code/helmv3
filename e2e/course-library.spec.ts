import { test as publicTest, expect } from '@playwright/test';
import { golfPlayerTest, hasGolfPlayerAuth } from './fixtures/golf-auth';

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
publicTest.describe('Cloud Course Library — unauthenticated contract', () => {
  publicTest('redirects /golf/dashboard/courses to golf login (not 404/500)', async ({
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

  publicTest('golf login page renders its email + password form', async ({ page }) => {
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
golfPlayerTest.describe('Cloud Course Library — authenticated flow', () => {
  golfPlayerTest.skip(
    !hasGolfPlayerAuth,
    'Set GOLFHELM_PLAYER_* or E2E_GOLF_* credentials to run.',
  );

  golfPlayerTest('renders the course library', async ({ page }) => {
    await page.goto(COURSES_PATH);

    await expect(page).toHaveURL(/\/golf\/dashboard\/courses/);
    // CourseLibraryClient header (CourseLibraryClient.tsx:128).
    await expect(page.locator('h1')).toContainText('Course library.');
    // Subtitle confirms the cloud-library count line rendered.
    await expect(page.getByText(/in the cloud library/i)).toBeVisible();
  });

  golfPlayerTest('search filters the library', async ({ page }) => {
    await page.goto(COURSES_PATH);
    await expect(page.locator('h1')).toContainText('Course library.');

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

  golfPlayerTest('opens a selected course with a usable snapshot', async ({ page }) => {
    await page.goto(COURSES_PATH);
    const library = page.locator('main');
    const courseCard = library.getByRole('button', { name: /^Open / }).first();
    await expect(courseCard).toBeVisible();

    // Cards include the course name as their accessible heading. Keeping this
    // dynamic makes the check portable across seeded course libraries while
    // exercising the exact click → detail contract the dashboard relies on.
    const courseName = await courseCard.getByRole('heading', { level: 3 }).innerText();
    await courseCard.click();

    const detail = page.getByRole('dialog', { name: courseName });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Course snapshot' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: /Tee sets/ })).toBeVisible();
  });

  golfPlayerTest('"Browse course library" on new round opens the tee picker', async ({
    page,
  }) => {
    await page.goto('/golf/dashboard/rounds/new');

    // Choosing from the library is now the new-round landing action, so the
    // picker opens automatically. If a resumed/manual state suppresses that,
    // the on-page affordance still opens the same dialog.
    const dialog = page.getByRole('dialog', { name: 'Choose a course' });
    await dialog.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Browse course library/i }).click();
    }
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByPlaceholder(/Search courses/i).or(page.getByPlaceholder(/Search courses/i)),
    ).toBeVisible();
  });

  // Capture screenshots of the premium course picker for review as CI artifacts
  // (uploaded by .github/workflows/playwright.yml). Best-effort — the point is
  // the image, not a gate; a missing affordance skips rather than fails.
  golfPlayerTest('capture: premium course picker screenshots', async ({ page }) => {
    const dir = 'e2e-screenshots';

    await page.goto('/golf/dashboard/rounds/new');
    const dialog = page.getByRole('dialog', { name: 'Choose a course' });
    await dialog.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
    if (!(await dialog.isVisible().catch(() => false))) {
      const browse = page.getByRole('button', { name: /Browse course library/i });
      if (!(await browse.isVisible().catch(() => false))) {
        await page.screenshot({ path: `${dir}/picker-debug-no-cta.png`, fullPage: true });
        golfPlayerTest.skip(true, 'Course picker is unavailable while resuming a round.');
        return;
      }
      await browse.click();
    }

    // Wait for the picker sheet, then for the entrance animation's actual
    // signal — the first carousel slide (role="group"/aria-roledescription
    // "slide" in FairwayCoursePicker) mounted and visible — instead of a
    // flat 1000ms guess at how long that entrance takes.
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('group').first()).toBeVisible({ timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: `${dir}/picker-desktop-stage-a.png` });

    // If the carousel has cards, advance it once to capture the coverflow mid-state.
    // Real state signal: clicking "Next course" flips the carousel's `canLeft`
    // flag, which sets the "Previous course" arrow's tabindex from -1 to 0
    // (see CarouselArrow in FairwayCoursePicker.tsx) — wait on that instead
    // of guessing how long the scroll-snap animation takes.
    const next = page.getByRole('button', { name: /Next course/i });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await expect(page.getByRole('button', { name: /Previous course/i })).toHaveAttribute(
        'tabindex',
        '0',
        { timeout: 5000 },
      ).catch(() => {});
      await page.screenshot({ path: `${dir}/picker-desktop-coverflow.png` });
    }

    // Mobile full-screen view (the primary form factor for this sheet). No
    // new content mounts on a viewport resize, so there is no DOM predicate
    // to assert on — wait for the browser to actually finish a reflow/paint
    // pass (two animation frames) rather than guessing a fixed duration.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${dir}/picker-mobile-stage-a.png` });

    // The standalone library page too (CourseLibraryClient), for completeness.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(COURSES_PATH);
    await expect(page.locator('h1')).toContainText('Course library.', { timeout: 10000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${dir}/course-library-page.png`, fullPage: true });
  });
});
