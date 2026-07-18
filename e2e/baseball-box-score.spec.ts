import { test, expect, type Page } from '@playwright/test';
import { getE2eAdminClient } from '../scripts/e2e-supabase-admin';
import { loginAsCoach, loginAsPlayer } from './helpers/auth';
import { waitForPageLoad } from './helpers/common';

/**
 * Baseball Box Score E2E Tests
 *
 * Exercises the full box-score lifecycle against the deterministic fixtures
 * provisioned by `scripts/seed-baseball-e2e.ts` (issue #375):
 *   - one SCHEDULED game (vs "Riverside University") with no stats yet —
 *     used for manual entry / save flows
 *   - one COMPLETED game (vs "Eastview College", final 5-3 W) with full
 *     batting + pitching box scores and rolled-up season stats — used for
 *     read-only box-score-view / season-stats / my-stats assertions
 *
 * SHARED-STATE SAFETY: several groups below read or write the same two
 * seeded games (and the season stats they drive), so this whole file runs
 * with `test.describe.configure({ mode: 'serial' })` to avoid two tests
 * racing under Playwright's `fullyParallel` config. The "save box score"
 * test intentionally flips the scheduled game to `completed` — that's a
 * one-way mutation for the run, restored by the next `seed:baseball:e2e`
 * invocation (the upsert in the seed script rewrites the full row,
 * including `status`), per the "destructive tests rely on seed reset"
 * pattern used throughout this fixture.
 *
 * The "create game" test adds one extra (non-seeded) game row each run.
 * `GamesList`'s delete button is still shipped with a permanent `hidden`
 * class, so there is no reachable UI delete affordance — cleanup instead
 * happens directly against the database: a `test.afterAll` below deletes
 * every `baseball_games` row (+ its linked `baseball_events` row) this file
 * created, via the same service-role client construction
 * `scripts/seed-baseball-e2e.ts` uses for seeding. See e2e/README.md.
 *
 * Gated on PLAYWRIGHT_BASEBALL_SEEDED=1, with a per-test self-skip if the
 * login fixture is unavailable in the target environment — same pattern as
 * camps.spec.ts / baseball-pipeline.spec.ts.
 */

test.describe.configure({ mode: 'serial' });

const SEEDED =
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === '1' ||
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === 'true';

const SCHEDULED_OPPONENT = 'Riverside University';
const COMPLETED_OPPONENT = 'Eastview College';

/**
 * Matches a game detail redirect, e.g. `/stats/games/<uuid>`.
 *
 * `baseball_games.id` is a Postgres `uuid` (`DEFAULT gen_random_uuid()`), so
 * matching the UUID shape — instead of the previous loose
 * `[a-zA-Z0-9-]+$` — structurally excludes `/stats/games/create` (issue
 * #952): the create-form route itself is 6 letters, never a UUID, so a
 * submit that silently hangs on the create page (no redirect at all) can no
 * longer false-pass this assertion.
 */
const GAME_DETAIL_URL_RE =
  /\/stats\/games\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service-role Supabase client for teardown-only writes (deleting rows this
 * spec itself created) — provided by scripts/e2e-supabase-admin.ts so this
 * spec never references the service-role env var directly (ast-grep rule
 * helmv3-no-service-role-key). Returns `null` (teardown becomes a no-op)
 * rather than throwing when the env is missing — cleanup must never fail an
 * otherwise-passing run.
 */
function getServiceRoleClient() {
  return getE2eAdminClient();
}

/**
 * Shared select→compute-ids→delete sweep used by both the pre-run leftover
 * sweep (beforeAll) and the real teardown (afterAll) below — the only
 * difference between the two call sites is the filter used to find games.
 */
async function deleteGamesAndEvents(
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  games: { id: string; event_id: string | null }[] | null,
) {
  const gameIds = (games ?? []).map((g) => g.id);
  const eventIds = (games ?? [])
    .map((g) => g.event_id)
    .filter((id): id is string => Boolean(id));
  if (gameIds.length > 0) {
    await supabase.from('baseball_games').delete().in('id', gameIds);
  }
  if (eventIds.length > 0) {
    await supabase.from('baseball_events').delete().in('id', eventIds);
  }
}

async function loginCoachOrSkip(page: Page) {
  try {
    await loginAsCoach(page);
  } catch {
    test.skip(true, 'coach login fixture unavailable in this environment');
  }
}

async function loginPlayerOrSkip(page: Page) {
  try {
    await loginAsPlayer(page);
  } catch {
    test.skip(true, 'player login fixture unavailable in this environment');
  }
}

// ---------------------------------------------------------------------------
// Group 1: Coach creates a new game
// ---------------------------------------------------------------------------

test.describe('Coach - Create New Game', () => {
  test.skip(!SEEDED, 'no seeded baseball team fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  // Opponent names created by the "create new game" test below — tracked so
  // the afterAll teardown can delete exactly (and only) the rows this file
  // created, never touching the seeded fixture games.
  const createdOpponents: string[] = [];

  // Pre-run sweep: a previous CANCELLED/timed-out run (Playwright's
  // cancel-in-progress) skips the afterAll teardown below, leaving orphaned
  // "E2E Created Opponent …" games (and their linked calendar events) behind
  // on the shared/demo team. Delete any such leftovers before this run so junk
  // can't accumulate across cancelled runs, regardless of whether this run
  // reaches its own afterAll.
  test.beforeAll(async () => {
    const supabase = getServiceRoleClient();
    if (!supabase) return;
    try {
      const { data: games } = await supabase
        .from('baseball_games')
        .select('id, event_id')
        .ilike('opponent_name', 'E2E Created Opponent%');
      await deleteGamesAndEvents(supabase, games);
    } catch (err) {
      // Cleanup must never fail an otherwise-passing run (see file docstring).
      console.warn('[e2e cleanup] leftover-opponent sweep failed:', err);
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginCoachOrSkip(page);
    await page.goto('/baseball/dashboard/stats/games/create');
    await waitForPageLoad(page);
  });

  test.afterAll(async () => {
    if (createdOpponents.length === 0) return;
    const supabase = getServiceRoleClient();
    if (!supabase) return;

    // The create form defaults `create_calendar_event` to true, so each
    // created game also has a linked baseball_events row (event_id) —
    // delete both so no orphaned event survives the game's deletion.
    try {
      const { data: games } = await supabase
        .from('baseball_games')
        .select('id, event_id')
        .in('opponent_name', createdOpponents);
      await deleteGamesAndEvents(supabase, games);
    } catch (err) {
      // Cleanup must never fail an otherwise-passing run (see file docstring).
      console.warn('[e2e cleanup] created-opponent teardown failed:', err);
    }
  });

  test('should display the new game form with date, opponent, and venue fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Add Game/i })).toBeVisible();
    await expect(page.locator('#new-game-date')).toBeVisible();
    await expect(page.locator('#new-game-opponent')).toBeVisible();
    await expect(page.locator('#new-game-venue')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Game/i })).toBeVisible();
  });

  test('should require a game date before submitting', async ({ page }) => {
    await page.locator('#new-game-date').fill('');
    await page.getByRole('button', { name: /Create Game/i }).click();

    // The date input is `required`, so the browser's native constraint
    // validation blocks submission before the client-side guard ever runs —
    // either way, submission must not proceed and the field stays empty.
    await expect(page).toHaveURL(/\/stats\/games\/create$/);
    await expect(page.locator('#new-game-date')).toHaveValue('');
  });

  test('should create a new game and redirect to its box-score entry page', async ({ page }) => {
    const opponent = `E2E Created Opponent ${Date.now()}`;
    createdOpponents.push(opponent);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 45);
    const dateStr = futureDate.toISOString().slice(0, 10);

    await page.locator('#new-game-date').fill(dateStr);
    await page.locator('#new-game-opponent').fill(opponent);
    await page.locator('#new-game-venue').fill('E2E Created Field');
    await page.getByRole('button', { name: /Create Game/i }).click();

    await expect(page).toHaveURL(GAME_DETAIL_URL_RE, { timeout: 8000 });
    await waitForPageLoad(page);

    // Newly created, uncompleted game lands directly on the manual entry form.
    await expect(page.getByText(opponent)).toBeVisible();
    await expect(page.locator('[data-testid="batting-entry-table"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Group 2: Coach enters box score stats (manual entry) on the seeded
// SCHEDULED game. The final test in this group saves real stats, which
// flips the game to "completed" for the remainder of this run.
// ---------------------------------------------------------------------------

test.describe('Coach - Manual Box Score Entry', () => {
  test.skip(!SEEDED, 'no seeded baseball game fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    await loginCoachOrSkip(page);
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);
    const gameCard = page.locator('[data-testid="game-card"]', { hasText: SCHEDULED_OPPONENT });
    await expect(gameCard).toBeVisible();
    await gameCard.getByRole('link').click();
    await waitForPageLoad(page);
  });

  test('should display batting and pitching tabs with the batting table active by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Batting', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pitching', exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="batting-entry-table"]')).toBeVisible();
  });

  test('should show the empty pitching state until a pitcher is added', async ({ page }) => {
    await page.getByRole('button', { name: 'Pitching', exact: true }).click();
    await expect(page.getByText(/Add pitchers using the selector above/i)).toBeVisible();
  });

  test('should add a pitcher using the selector and Add Pitcher button', async ({ page }) => {
    await page.getByRole('button', { name: 'Pitching', exact: true }).click();

    const pitcherSelect = page.locator('select').first();
    const firstOptionValue = await pitcherSelect.locator('option').nth(1).getAttribute('value');
    expect(firstOptionValue).toBeTruthy();
    await pitcherSelect.selectOption(firstOptionValue as string);
    await page.getByRole('button', { name: 'Add Pitcher', exact: true }).click();

    await expect(page.locator('[data-testid="pitching-entry-table"]')).toBeVisible({ timeout: 3000 });
  });

  test('should reflect entered batting stats in the totals row', async ({ page }) => {
    const totalsRow = page.locator('[data-testid="batting-entry-totals-row"]');
    await expect(totalsRow).toBeVisible();
    await expect(totalsRow).toContainText('TOTALS');

    const firstRow = page.locator('[data-testid="batting-entry-table"] tbody tr').first();
    const abInput = firstRow.locator('input').first();
    await abInput.fill('4');

    // AB column is the first numeric column in both the row and totals row.
    await expect(totalsRow.locator('td').nth(1)).toHaveText('4');
  });

  test('should enter a full batting + pitching line, save, and redirect to the completed box score view', async ({ page }) => {
    // Batting: give the first roster row an AB/H/R line so it survives the
    // saveFullBoxScore non-zero filter.
    const firstBattingRow = page.locator('[data-testid="batting-entry-table"] tbody tr').first();
    const battingInputs = firstBattingRow.locator('input');
    await battingInputs.nth(0).fill('4'); // AB
    await battingInputs.nth(1).fill('1'); // R
    await battingInputs.nth(2).fill('2'); // H

    // Pitching: add one pitcher with a simple line.
    await page.getByRole('button', { name: 'Pitching', exact: true }).click();
    const pitcherSelect = page.locator('select').first();
    const firstOptionValue = await pitcherSelect.locator('option').nth(1).getAttribute('value');
    await pitcherSelect.selectOption(firstOptionValue as string);
    await page.getByRole('button', { name: 'Add Pitcher', exact: true }).click();
    const pitchingRow = page.locator('[data-testid="pitching-entry-table"] tbody tr').first();
    await pitchingRow.locator('input').first().fill('6'); // IP

    await page.getByRole('button', { name: /Save Box Score/i }).click();

    await expect(page).toHaveURL(GAME_DETAIL_URL_RE, { timeout: 8000 });
    await waitForPageLoad(page);

    // BoxScoreView now renders the just-completed game (read-only display —
    // distinct from the "batting-entry-table" still rendered further down
    // the page inside the "Update Box Score" panel).
    await expect(page.locator('[data-testid="batting-table"]')).toBeVisible();
    await expect(page.getByText(/^FINAL$/)).toBeVisible();
    await expect(page.getByText(/^[WLT]$/).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Group 3: Coach - CSV upload tab (structural checks only — does not submit
// a real CSV, so it never mutates seeded box-score data).
// ---------------------------------------------------------------------------

test.describe('Coach - CSV Box Score Upload', () => {
  test.skip(!SEEDED, 'no seeded baseball game fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    await loginCoachOrSkip(page);
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);
    const gameCard = page.locator('[data-testid="game-card"]', { hasText: COMPLETED_OPPONENT });
    await expect(gameCard).toBeVisible();
    await gameCard.getByRole('link').click();
    await waitForPageLoad(page);
  });

  test('should switch to the CSV upload tab and show the paste/upload form', async ({ page }) => {
    await page.getByRole('button', { name: /CSV Upload/i }).click();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload.*Match Players/i })).toBeVisible();
  });

  test('should disable the upload button until CSV content is provided', async ({ page }) => {
    await page.getByRole('button', { name: /CSV Upload/i }).click();
    const uploadButton = page.getByRole('button', { name: /Upload.*Match Players/i });
    await expect(uploadButton).toBeDisabled();

    await page.locator('textarea').fill('player_name,ab,r,h\nTest Player,4,1,2');
    await expect(uploadButton).toBeEnabled();
  });

  test('should offer batting/pitching CSV template download buttons', async ({ page }) => {
    await page.getByRole('button', { name: /CSV Upload/i }).click();
    await expect(page.getByText(/Download template/i)).toBeVisible();

    // Switch the CSV column-reference toggle (lowercase "batting"/"pitching"
    // buttons) from its "batting" default to "pitching" — distinct from the
    // (unmounted, while on this tab) Manual Entry "Batting"/"Pitching" tabs.
    await page.getByRole('button', { name: 'pitching', exact: true }).click();
    await expect(page.getByText(/Download template/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Group 4: Coach views game history and the completed box score
// ---------------------------------------------------------------------------

test.describe('Coach - Games List and Box Score View', () => {
  test.skip(!SEEDED, 'no seeded baseball game fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    await loginCoachOrSkip(page);
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);
  });

  test('should display the games list with both seeded games', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Games & Scrimmages' })).toBeVisible();
    await expect(page.locator('[data-testid="game-card"]', { hasText: COMPLETED_OPPONENT })).toBeVisible();
    await expect(page.locator('[data-testid="game-card"]', { hasText: SCHEDULED_OPPONENT })).toBeVisible();
  });

  test('should navigate to the completed game detail page from the games list', async ({ page }) => {
    const gameCard = page.locator('[data-testid="game-card"]', { hasText: COMPLETED_OPPONENT });
    await gameCard.getByRole('link').click();
    await waitForPageLoad(page);
    await expect(page).toHaveURL(GAME_DETAIL_URL_RE);
  });

  test('should display the box score view with the FINAL score and result badge', async ({ page }) => {
    const gameCard = page.locator('[data-testid="game-card"]', { hasText: COMPLETED_OPPONENT });
    await gameCard.getByRole('link').click();
    await waitForPageLoad(page);

    await expect(page.getByRole('heading', { name: new RegExp(`vs ${COMPLETED_OPPONENT}`, 'i') })).toBeVisible();
    await expect(page.getByText(/^FINAL$/)).toBeVisible();
    await expect(page.getByText('5 – 3')).toBeVisible();
    await expect(page.getByText('W', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-testid="batting-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="batting-totals-row"]')).toBeVisible();
    await expect(page.locator('th', { hasText: 'AB' })).toBeVisible();
  });

  test('should display ERA/WHIP columns and a pitching decision badge', async ({ page }) => {
    const gameCard = page.locator('[data-testid="game-card"]', { hasText: COMPLETED_OPPONENT });
    await gameCard.getByRole('link').click();
    await waitForPageLoad(page);

    await expect(page.locator('[data-testid="pitching-table"]')).toBeVisible();
    await expect(page.locator('th', { hasText: 'ERA' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'WHIP' })).toBeVisible();
    await expect(page.locator('[data-testid="pitching-table"]').getByText('W', { exact: true })).toBeVisible();
  });

  test('should display breadcrumb navigation back to Games', async ({ page }) => {
    const gameCard = page.locator('[data-testid="game-card"]', { hasText: COMPLETED_OPPONENT });
    await gameCard.getByRole('link').click();
    await waitForPageLoad(page);

    const breadcrumb = page.getByRole('link', { name: 'Games', exact: true });
    await expect(breadcrumb).toBeVisible();
    await breadcrumb.click();
    await waitForPageLoad(page);
    await expect(page).toHaveURL(/\/stats\/games$/);
  });
});

// ---------------------------------------------------------------------------
// Group 5: Coach - Season stats summary page
//
// REMOVED (not repointed): /baseball/dashboard/stats/season is a 404 — the
// season stats flow now lives at /baseball/dashboard/stats-center
// (/baseball/dashboard/stats redirects there), which renders a card/"plate"
// magazine layout (StatSpread/PlayerRowPlate), not a heading matching
// `/— Stats$/` or a `<table>` element. The old assertions here don't
// translate 1:1 onto that surface, so this block is removed rather than
// repointed at selectors that were never verified against the real page.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Group 6: Player views their personal stats
// ---------------------------------------------------------------------------

test.describe('Player - My Stats Dashboard', () => {
  test.skip(!SEEDED, 'no seeded baseball player fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    await loginPlayerOrSkip(page);
    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);
  });

  test('should display the my-stats page with the seeded player name', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Test Player' })).toBeVisible({ timeout: 8000 });
  });

  test('should show non-zero seeded season batting stats', async ({ page }) => {
    const seasonStats = page.locator('[data-testid="my-season-stats"]');
    await expect(seasonStats).toBeVisible({ timeout: 8000 });

    const battingSection = page.locator('[data-testid="my-season-batting"]');
    await expect(battingSection).toBeVisible();
    await expect(battingSection.getByText('AVG', { exact: true })).toBeVisible();
    // The seeded testplayer batting line is 4 AB / 2 H — AVG must render a
    // real number, not the "no stats" em-dash placeholder.
    await expect(battingSection.getByText('—', { exact: true })).toHaveCount(0);
  });

  test('should have a working Refresh button', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /Refresh/i });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
  });
});
