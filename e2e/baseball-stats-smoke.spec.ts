import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS } from './helpers/auth';
import { waitForPageLoad } from './helpers/common';
import { BASEBALL_SEED_MANIFEST } from './helpers/baseball-seed-manifest';

/**
 * BaseballHelm seeded production smoke (#382) — Rini / demo stats surfaces.
 *
 * Two tiers, mirroring the established pattern in baseball-phase1.spec.ts:
 *
 *   1. ALWAYS-ON anonymous route-wiring checks — no seeded flag required.
 *      These only assert the route doesn't hard-500 and doesn't leak
 *      staff/player data to an anonymous visitor.
 *
 *   2. SEEDED data assertions — gated by PLAYWRIGHT_BASEBALL_SEEDED. These log
 *      in as the seeded Rini University Baseball coach/player accounts
 *      (scripts/seed-rini-baseball-demo.ts) and assert manifest-backed
 *      non-empty data renders on Command Center, Stats Center, Box Score,
 *      Upload, and the player surfaces.
 *
 * FAILURE SEMANTICS (the whole point of this spec): every seeded assertion
 * below pairs a POSITIVE manifest-backed presence check with an explicit
 * ABSENCE check for that surface's own empty-state / unauthorized text. A
 * surface rendering its empty state while the manifest claims real seeded
 * data is a HARD FAILURE — it means the seed and the read model have drifted
 * apart (wrong table, wrong team scope, wrong season window, a broken join),
 * which is a real regression, not "no data yet". This is intentionally a
 * different failure mode from:
 *   - healthy zero-data (not covered here — that's what an UNSEEDED run
 *     would show, and this spec doesn't run those assertions at all unless
 *     PLAYWRIGHT_BASEBALL_SEEDED=1), and
 *   - anonymous-redirect (covered by the always-on tier above, which never
 *     asserts page content beyond "no leak", since an anonymous visitor is
 *     SUPPOSED to see nothing).
 *
 * One-time seeding command + required env vars: see the doc block at the
 * bottom of this file and docs/e2e-baseball-smoke.md.
 */

const SEEDED =
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === '1' ||
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === 'true';

/** Try to log a user in; returns true on success, false if no fixture (mirrors baseball-phase1.spec.ts's tryLogin). */
async function tryLogin(
  page: Page,
  creds: { email: string; password: string },
): Promise<boolean> {
  try {
    await page.goto('/baseball/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', creds.email);
    await page.fill('input[name="password"]', creds.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/**/dashboard/**', { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — anonymous route-wiring (always on, independent of PLAYWRIGHT_BASEBALL_SEEDED)
// ---------------------------------------------------------------------------
test.describe('BaseballHelm seeded smoke — route wiring (anonymous)', () => {
  const AUTH_WALL_ROUTES = [
    '/baseball/dashboard/command-center',
    '/baseball/dashboard/stats-center',
    '/baseball/dashboard/stats/games',
    '/baseball/dashboard/stats/upload',
    '/baseball/dashboard/my-stats',
  ];

  for (const route of AUTH_WALL_ROUTES) {
    test(`anonymous visitor to ${route} is bounced to the auth wall`, async ({ page }) => {
      const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(resp?.status() ?? 0).toBeLessThan(500);
      const url = page.url();
      const onAuthWall =
        url.includes('/login') || url.includes('/signup') || url.includes('/baseball/login');
      expect(onAuthWall, `expected ${route} to redirect an anonymous visitor to login`).toBe(true);
    });
  }

  // /baseball/player/today: the PlayerTodayTeamless "join a team" terminal is
  // now reserved for an AUTHENTICATED-but-teamless player (see the page's
  // HONESTY v12 docstring — it exists to avoid an onboarding redirect loop for
  // a signed-in player who skipped team selection). An ANONYMOUS visitor (no
  // session) is bounced to the auth wall by the (player-dashboard) route group
  // layout, exactly like every other AUTH_WALL_ROUTE above — which is the
  // correct secure behaviour and what actually renders (the old assertion of a
  // 200 terminal for an anonymous visitor was stale). Assert the redirect and
  // that no real player data leaks.
  test('anonymous visitor to /baseball/player/today is bounced to the auth wall', async ({ page }) => {
    const resp = await page.goto('/baseball/player/today', { waitUntil: 'domcontentloaded' });
    expect(resp?.status() ?? 0).toBeLessThan(500);
    const url = page.url();
    const onAuthWall =
      url.includes('/login') || url.includes('/signup') || url.includes('/baseball/login');
    expect(onAuthWall, 'expected anonymous /baseball/player/today to redirect to login').toBe(true);
    await expect(page.getByText('No player profile on this team')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — seeded coach surfaces
// ---------------------------------------------------------------------------
test.describe('BaseballHelm seeded smoke — coach surfaces', () => {
  test.skip(!SEEDED, 'no seeded baseball fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test('Command Center renders the seeded roster with real stats, not empty states', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');

    await page.goto('/baseball/dashboard/command-center');
    await waitForPageLoad(page);

    // Roster tab (default): the empty-state copy must be ABSENT — the seed
    // claims a full roster, so this surface rendering "No players yet" would
    // mean the read model can't see the seeded team at all.
    await expect(page.getByText('No players yet')).toHaveCount(0);

    const marcusCard = page.getByRole('button', { name: /View Marcus Rodriguez details/i });
    await expect(marcusCard).toBeVisible({ timeout: 10000 });
    // The AVG StatChip renders a real ".xxx" average (formatAvg strips the
    // leading 0) once baseball_player_aggregates has a row — "—" would mean
    // the seed's aggregate rollup never reached this player.
    await expect(marcusCard).toContainText(/\.\d{3}/);

    // Stats tab: switch and assert the per-player table also shows real data.
    await page.locator('#cc-tab-stats').click();
    const statsPanel = page.locator('#cc-panel-stats');
    await expect(statsPanel.getByText('No performance data yet')).toHaveCount(0);
    const marcusRow = statsPanel.locator('tr', { hasText: 'Rodriguez' });
    await expect(marcusRow).toBeVisible({ timeout: 10000 });
    await expect(marcusRow).toContainText(/\.\d{3}/);
  });

  test('Stats Center shows seeded official games and per-player splits, not the unauthorized/no-data states', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');

    await page.goto('/baseball/dashboard/stats-center');
    await waitForPageLoad(page);

    // Honest unauthorized envelope must be absent — the seeded coach has a
    // baseball_team_coach_staff row, so this text appearing means the staff
    // check itself is broken for the seeded account, not just "no data".
    await expect(page.getByText('Stats Center is for coaching staff')).toHaveCount(0);

    const withDataValue = page
      .getByText('With Data', { exact: true })
      .locator('xpath=following-sibling::p[1]');
    const officialGamesValue = page
      .getByText('Official Games', { exact: true })
      .locator('xpath=following-sibling::p[1]');

    await expect(withDataValue).toBeVisible({ timeout: 10000 });
    const withData = Number((await withDataValue.textContent())?.trim() ?? '0');
    const officialGames = Number((await officialGamesValue.textContent())?.trim() ?? '0');
    expect(withData).toBeGreaterThanOrEqual(BASEBALL_SEED_MANIFEST.minimums.playersWithData);
    expect(officialGames).toBeGreaterThanOrEqual(BASEBALL_SEED_MANIFEST.minimums.officialGames);

    // At least one player card (Marcus, who has both batting and pitching
    // box-score lines every game) must show real splits, not the per-row
    // "no box-score lines" honest-empty card.
    await expect(page.getByText('Marcus Rodriguez')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No box-score lines or events captured yet this season.')).toHaveCount(0);
  });

  test('Games list + Box Score render the seeded completed game with batting and pitching lines', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');

    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);
    await expect(page.getByText('No games yet')).toHaveCount(0);

    // Target the manifest's specific completed game by its deterministic id,
    // NOT by opponent name: the seed produces MULTIPLE past games and more
    // than one can share the same opponent ("Coastal State" appears on both a
    // May and a July game), so a name-based `getByRole('link', ...)` matched 2
    // elements and tripped strict mode. The game-card link's href is the
    // stable, unique anchor.
    const seededGameLink = page.locator(
      `a[data-testid="game-card"][href$="/baseball/dashboard/stats/games/${BASEBALL_SEED_MANIFEST.completedGame.id}"]`,
    );
    await expect(seededGameLink).toBeVisible({ timeout: 10000 });
    await seededGameLink.click();
    await expect(page).toHaveURL(new RegExp(`/baseball/dashboard/stats/games/${BASEBALL_SEED_MANIFEST.completedGame.id}$`));
    await expect(page.getByText('No stats recorded for this game yet')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Batting' })).toBeVisible({ timeout: 10000 });

    // Deep-link to the manifest's known completed game rather than depending
    // on games-list click-through ordering.
    await page.goto(`/baseball/dashboard/stats/games/${BASEBALL_SEED_MANIFEST.completedGame.id}`);
    await waitForPageLoad(page);

    await expect(page.getByText('No stats recorded for this game yet')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Batting' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Pitching' })).toBeVisible();
    await expect(page.getByText('TOTALS').first()).toBeVisible();
    await expect(page.getByText('FINAL')).toBeVisible();
  });

  // Wizard consolidation: the legacy /stats/upload wizard is now a redirect
  // shim INTO Import Center (the canonical wizard) — see
  // src/app/baseball/(dashboard)/dashboard/stats/upload/page.tsx. This test
  // used to assert the retired StatsUploadClient surface directly; it now
  // asserts the redirect lands the coach on Import Center's "Quick box score"
  // entry point instead, so the college-coach guard + destination stay
  // covered without pinning a UI that no longer exists.
  test('Upload route redirects into Import Center (college-coach guard passed)', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.coach);
    test.skip(!ok, 'coach login fixture unavailable in this environment');

    await page.goto('/baseball/dashboard/stats/upload');
    await waitForPageLoad(page);

    await expect(page).toHaveURL(/\/baseball\/dashboard\/import$/);
    await expect(page.getByRole('heading', { name: 'Import Center' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Quick box score')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — seeded player surfaces
// ---------------------------------------------------------------------------
test.describe('BaseballHelm seeded smoke — player surfaces', () => {
  test.skip(!SEEDED, 'no seeded baseball fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test('Player Today shows the seeded player rundown, not the unauthorized envelope', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.player);
    test.skip(!ok, 'player login fixture unavailable in this environment');

    await page.goto('/baseball/player/today');
    await waitForPageLoad(page);

    await expect(page.getByText('No player profile on this team')).toHaveCount(0);
    await expect(page.getByText('Join a team to unlock Today')).toHaveCount(0);
    await expect(page.getByText('No recent sessions')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent Sessions' })).toBeVisible({ timeout: 10000 });
  });

  test('My Stats shows season totals for the seeded player, not the empty states', async ({ page }) => {
    const ok = await tryLogin(page, TEST_USERS.player);
    test.skip(!ok, 'player login fixture unavailable in this environment');

    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);

    await expect(page.getByText('No Stats Yet')).toHaveCount(0);
    await expect(page.getByText('No season stats yet')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: BASEBALL_SEED_MANIFEST.player.fullName })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/Season Stats/)).toBeVisible();
  });
});

/**
 * ---------------------------------------------------------------------------
 * CI wiring (Phase 3, #382) — required secrets + one-time seeding command.
 * ---------------------------------------------------------------------------
 * This spec is wired into .github/workflows/playwright.yml as an isolated,
 * advisory `baseball-smoke` job (mirrors the existing `picker-screenshots`
 * job's checkout/setup/build/browser-cache shape).
 *
 * Required repo secrets (Settings → Secrets and variables → Actions):
 *   PLAYWRIGHT_BASEBALL_SEEDED   = "1"
 *   E2E_BASEBALL_COACH_EMAIL     = njrini99@gmail.com (or another seeded coach)
 *   E2E_BASEBALL_COACH_PASSWORD
 *   E2E_BASEBALL_PLAYER_EMAIL    = rinin376@gmail.com (or another seeded player)
 *   E2E_BASEBALL_PLAYER_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (already used by
 *     the existing `e2e` job — reused here)
 *
 * One-time seeding command (run against the target Supabase project, needs
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — NOT a CI secret used
 * by this job, only by whoever runs the seed):
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/seed-rini-baseball-demo.ts --confirm
 *
 * Promotion path: once this job is green across several consecutive runs,
 * remove the `|| echo` / `continue-on-error` non-blocking guard in the
 * workflow job to promote it from advisory to a hard required check.
 * ---------------------------------------------------------------------------
 */
