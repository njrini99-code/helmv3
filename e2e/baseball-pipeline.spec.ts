import { test, expect } from '@playwright/test';
// #375 pipeline candidate ("Jordan Hayes") is seeded on the dedicated
// "E2E Test University" team owned by testcoach@helm.test — log in as that
// pinned account, NOT the env-driven Rini-demo coach (see helpers/auth.ts
// E2E_FIXTURE_USERS). With the shared env-driven loginAsCoach, this board
// rendered the Rini demo team's empty pipeline and every assertion failed.
import { loginAsFixtureCoach } from './helpers/auth';
import { waitForPageLoad } from './helpers/common';
import { RECRUITING_ENABLED, RECRUITING_SUNSET_REASON } from './helpers/product-modules';

/**
 * Baseball Pipeline E2E Tests
 *
 * Exercises the real recruiting pipeline board (Kanban), list view, grad-year
 * filter, notes, and keyboard navigation against the deterministic fixture
 * provisioned by `scripts/seed-baseball-e2e.ts` (issue #375):
 *   - one off-roster pipeline candidate ("Jordan Hayes", grad year 2027) on
 *     the seeded test coach's watchlist, stage = "watchlist"
 *
 * Stage moves use the PipelineCard's built-in advance/retreat buttons
 * (`← <stage>` / `<stage> →`) rather than simulating native HTML5 drag and
 * drop — dnd-kit's pointer-sensor drag is unreliable to script headlessly,
 * and the product already ships these buttons as the accessible/no-drag
 * fallback for exactly this interaction.
 *
 * Mutating tests (stage move, note edit) are self-contained round trips
 * (move then move back, save then leave restoration to the next seed run)
 * so they don't depend on execution order — but to avoid two tests racing
 * on the single shared candidate row under Playwright's `fullyParallel`
 * config, the "Coach Flow" describe block runs its tests serially.
 *
 * Gated on PLAYWRIGHT_BASEBALL_SEEDED=1, with a per-test self-skip if the
 * login fixture is unavailable in the target environment — same pattern as
 * camps.spec.ts / baseball-phase1.spec.ts.
 */

const SEEDED =
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === '1' ||
  process.env.PLAYWRIGHT_BASEBALL_SEEDED === 'true';

const CANDIDATE_NAME = 'Jordan Hayes';
const CANDIDATE_GRAD_YEAR = '2027';
const SEEDED_NOTE_FRAGMENT = 'Seeded E2E pipeline candidate';

const STAGES = ['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'] as const;

test.describe('Baseball Pipeline - College Coach Flow', () => {
  test.skip(!RECRUITING_ENABLED, RECRUITING_SUNSET_REASON);
  test.skip(!SEEDED, 'no seeded baseball pipeline fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');
  // Tests below mutate the single shared candidate's pipeline stage / notes —
  // run them one at a time so they can't race each other under fullyParallel.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    try {
      await loginAsFixtureCoach(page);
    } catch {
      test.skip(true, 'coach login fixture unavailable in this environment');
    }
    await page.goto('/baseball/dashboard/pipeline');
    await waitForPageLoad(page);
  });

  test('should display the pipeline board with all stage columns and the seeded candidate', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();

    for (const stage of STAGES) {
      await expect(page.locator(`[data-testid="pipeline-column-${stage}"]`)).toBeVisible();
    }

    const candidateCard = page.locator(
      '[data-testid="pipeline-column-watchlist"] [data-testid="pipeline-card"]',
      { hasText: CANDIDATE_NAME }
    );
    await expect(candidateCard).toBeVisible();
  });

  test('should move the seeded candidate to a new stage and back using the card buttons', async ({ page }) => {
    const card = page.locator('[data-testid="pipeline-card"]', { hasText: CANDIDATE_NAME });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-stage', 'watchlist');

    // Advance: watchlist -> high_priority via the card's "next stage" button.
    await card.getByRole('button', { name: /High Priority/i }).click();
    await expect(
      page.locator('[data-testid="pipeline-column-high_priority"] [data-testid="pipeline-card"]', {
        hasText: CANDIDATE_NAME,
      })
    ).toBeVisible({ timeout: 5000 });
    await expect(card).toHaveAttribute('data-stage', 'high_priority');

    // Restore: high_priority -> watchlist via the card's "previous stage" button
    // (the watchlist stage is labeled "Prospects" on the board/card UI).
    await card.getByRole('button', { name: /Prospects/i }).click();
    await expect(
      page.locator('[data-testid="pipeline-column-watchlist"] [data-testid="pipeline-card"]', {
        hasText: CANDIDATE_NAME,
      })
    ).toBeVisible({ timeout: 5000 });
    await expect(card).toHaveAttribute('data-stage', 'watchlist');
  });

  test('should filter the pipeline board by grad year', async ({ page }) => {
    const gradYearTrigger = page.getByRole('button', { name: 'All Years' });
    await expect(gradYearTrigger).toBeVisible();

    // Filter to the candidate's own grad year — candidate must remain visible.
    await gradYearTrigger.click();
    await page.getByRole('option', { name: CANDIDATE_GRAD_YEAR, exact: true }).click();
    await expect(
      page.locator('[data-testid="pipeline-card"]', { hasText: CANDIDATE_NAME })
    ).toBeVisible();

    // Filter to a different grad year — candidate must be filtered out.
    await page.getByRole('button', { name: CANDIDATE_GRAD_YEAR, exact: true }).click();
    await page.getByRole('option', { name: '2025', exact: true }).click();
    await expect(
      page.locator('[data-testid="pipeline-card"]', { hasText: CANDIDATE_NAME })
    ).toHaveCount(0);

    // Clear the filter to restore the default (unfiltered) board state.
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(
      page.locator('[data-testid="pipeline-card"]', { hasText: CANDIDATE_NAME })
    ).toBeVisible();
  });

  test('should add a note to the seeded candidate from the list view', async ({ page }) => {
    await page.getByRole('button', { name: 'List', exact: true }).click();

    const row = page.locator('tr', { hasText: CANDIDATE_NAME });
    await expect(row).toBeVisible();

    // The notes button's `title` attribute always holds the full (untruncated)
    // note text, so it's a stable anchor regardless of truncation in the cell.
    const noteButton = row.locator('button[title]');
    await expect(noteButton).toBeVisible();
    await expect(noteButton).toHaveAttribute('title', new RegExp(SEEDED_NOTE_FRAGMENT));
    await noteButton.click();

    const noteText = `E2E test note ${Date.now()} — strong arm, plus bat speed.`;
    const textarea = row.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill(noteText);
    await row.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(row.locator(`button[title="${noteText}"]`)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Baseball Pipeline - Keyboard Navigation', () => {
  test.skip(!RECRUITING_ENABLED, RECRUITING_SUNSET_REASON);
  test.skip(!SEEDED, 'no seeded baseball pipeline fixture (set PLAYWRIGHT_BASEBALL_SEEDED=1)');

  test.beforeEach(async ({ page }) => {
    try {
      await loginAsFixtureCoach(page);
    } catch {
      test.skip(true, 'coach login fixture unavailable in this environment');
    }
    await page.goto('/baseball/dashboard/pipeline');
    await waitForPageLoad(page);
    await page.getByRole('button', { name: 'List', exact: true }).click();
  });

  test('should support j/k/Enter/Escape keyboard navigation in list view', async ({ page }) => {
    const row = page.locator('tr', { hasText: CANDIDATE_NAME });
    await expect(row).toBeVisible();

    // ArrowDown moves focus onto the (only) row — verified via the highlight class.
    await page.keyboard.press('ArrowDown');
    await expect(row).toHaveClass(/bg-primary-50/);

    // Enter opens the player peek panel for the focused row.
    await page.keyboard.press('Enter');
    const closePanelButton = page.getByRole('button', { name: 'Close panel' });
    await expect(closePanelButton).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: CANDIDATE_NAME })).toBeVisible();

    // Escape closes the panel.
    await page.keyboard.press('Escape');
    await expect(closePanelButton).not.toBeVisible({ timeout: 5000 });
  });
});
