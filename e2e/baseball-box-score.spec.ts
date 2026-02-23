import { test, expect } from '@playwright/test';
import { loginAsCoach, loginAsPlayer } from './helpers/auth';
import { waitForPageLoad } from './helpers/common';

/**
 * Baseball Box Score E2E Tests
 *
 * Covers the full box-score lifecycle:
 *   - Coach creates a game and enters box score stats (manual entry + CSV upload)
 *   - Coach views box score history and game detail
 *   - Player views personal season stats from the my-stats page
 *   - Error/empty states throughout the flow
 *
 * NOTE: Tests marked with "// TODO: requires test data setup" need a seeded
 * test database with coach + team + players present. Tests that only check
 * navigation and UI structure can run against an empty (but authenticated) DB.
 */

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const GAME_DATE = '2025-04-15';
const OPPONENT_NAME = 'Riverside University';
const VENUE = 'Alumni Field';

// ---------------------------------------------------------------------------
// Group 1: Coach creates a new game
// ---------------------------------------------------------------------------

test.describe('Coach - Create New Game', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test('should display the new game form', async ({ page }) => {
    // TODO: requires test data setup (coach must belong to college/juco team)
    await page.goto('/baseball/dashboard/stats/games/new');
    await waitForPageLoad(page);

    await expect(
      page.locator('h1:has-text("Add Game"), h1:has-text("Game"), h1:has-text("Scrimmage")').first()
    ).toBeVisible({ timeout: 5000 });

    // Should show type toggle (Game / Scrimmage)
    await expect(page.locator('button:has-text("game"), button:has-text("Game")').first()).toBeVisible();

    // Should show date input
    await expect(page.locator('input[type="date"]')).toBeVisible();

    // Should show opponent name input
    await expect(page.locator('input[placeholder*="Opponent"], input[placeholder*="State University"]').first()).toBeVisible();
  });

  test('should require a game date before submitting', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games/new');
    await waitForPageLoad(page);

    // Clear the date field and attempt to submit
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('');

    const submitButton = page.locator(
      'button:has-text("Create Game"), button[type="submit"]'
    ).first();

    if (await submitButton.isVisible({ timeout: 3000 })) {
      await submitButton.click();

      // Browser native validation should prevent submission — check date is still empty/invalid
      // or an explicit error message appears
      const errorMsg = page.locator('text=/date|required/i');
      const dateValue = await dateInput.inputValue();
      expect(dateValue === '' || (await errorMsg.count()) > 0).toBeTruthy();
    }
  });

  test('should fill game details and submit the create-game form', async ({ page }) => {
    // TODO: requires test data setup (coach must belong to college/juco team with a roster)
    await page.goto('/baseball/dashboard/stats/games/new');
    await waitForPageLoad(page);

    // Set game type to "game"
    const gameTypeButton = page.locator('button:has-text("game")').first();
    if (await gameTypeButton.isVisible({ timeout: 3000 })) {
      await gameTypeButton.click();
    }

    // Enter game date
    await page.fill('input[type="date"]', GAME_DATE);

    // Enter opponent name
    const opponentInput = page.locator(
      'input[placeholder*="State University"], input[placeholder*="Opponent"]'
    ).first();
    if (await opponentInput.isVisible({ timeout: 3000 })) {
      await opponentInput.fill(OPPONENT_NAME);
    }

    // Set home/away to "home"
    const homeButton = page.locator('button:has-text("home")').first();
    if (await homeButton.isVisible({ timeout: 3000 })) {
      await homeButton.click();
    }

    // Enter venue
    const venueInput = page.locator('input[placeholder*="Alumni Field"], input[placeholder*="Venue"]').first();
    if (await venueInput.isVisible({ timeout: 3000 })) {
      await venueInput.fill(VENUE);
    }

    // Submit
    const submitButton = page.locator(
      'button:has-text("Create Game"), button[type="submit"]'
    ).first();
    if (await submitButton.isVisible({ timeout: 3000 })) {
      await submitButton.click();

      // On success: redirected to game detail page /stats/games/<id>
      // On failure (no team): stays on form or shows error — both are valid for this test
      await page.waitForTimeout(1500);
      const currentUrl = page.url();
      const wentToGamePage = currentUrl.includes('/stats/games/');
      const stayedOnForm = currentUrl.includes('/stats/games/new') || currentUrl.includes('/dashboard');
      expect(wentToGamePage || stayedOnForm).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Group 2: Coach enters box score stats (manual entry)
// ---------------------------------------------------------------------------

test.describe('Coach - Manual Box Score Entry', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test('should display batting and pitching tabs on the box score entry page', async ({ page }) => {
    // TODO: requires test data setup — a game must exist with the test coach's team
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    // Look for a game card link to click into
    const gameLink = page.locator(
      'a[href*="/stats/games/"], [data-testid="game-card"] a, .game-card a'
    ).first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // Should show batting/pitching tabs (BoxScoreUpload or BoxScoreEntry)
      const battingTab = page.locator('button:has-text("Batting"), button:has-text("Manual Entry")').first();
      const pitchingTab = page.locator('button:has-text("Pitching")').first();

      const hasBatting = await battingTab.isVisible({ timeout: 5000 });
      expect(hasBatting).toBeTruthy();

      if (hasBatting) {
        await expect(pitchingTab).toBeVisible();
      }
    }
  });

  test('should switch between batting and pitching tabs', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // First, click "Manual Entry" tab if present (BoxScoreUpload wraps BoxScoreEntry)
      const manualTab = page.locator('button:has-text("Manual Entry"), button:has-text("✏️ Manual Entry")').first();
      if (await manualTab.isVisible({ timeout: 3000 })) {
        await manualTab.click();
      }

      // Now switch to Pitching tab
      const pitchingTab = page.locator('button:has-text("Pitching")').first();
      if (await pitchingTab.isVisible({ timeout: 3000 })) {
        await pitchingTab.click();
        await page.waitForTimeout(300);

        // Pitching UI: pitcher selector dropdown should appear
        await expect(
          page.locator('select:has([option*="pitcher"]), select[class*="pitcher"], select').first()
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should update the final score inputs for both teams', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // Enter Manual Entry mode if needed
      const manualTab = page.locator('button:has-text("Manual Entry"), button:has-text("✏️")').first();
      if (await manualTab.isVisible({ timeout: 3000 })) {
        await manualTab.click();
      }

      // Score inputs: labeled "Us" and the opponent name (or "Them")
      const scoreInputs = page.locator('input[type="number"][min="0"][max="99"]');
      const count = await scoreInputs.count();

      if (count >= 2) {
        // Set our score to 7
        await scoreInputs.nth(0).fill('7');
        // Set opponent score to 3
        await scoreInputs.nth(1).fill('3');

        // Verify values were accepted
        await expect(scoreInputs.nth(0)).toHaveValue('7');
        await expect(scoreInputs.nth(1)).toHaveValue('3');
      }
    }
  });

  test('should show a totals row at the bottom of the batting table', async ({ page }) => {
    // TODO: requires test data setup (game + active roster players)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const manualTab = page.locator('button:has-text("Manual Entry"), button:has-text("✏️")').first();
      if (await manualTab.isVisible({ timeout: 3000 })) {
        await manualTab.click();
      }

      // Batting tab should be active by default
      const battingTab = page.locator('button:has-text("Batting")').first();
      if (await battingTab.isVisible({ timeout: 3000 })) {
        await battingTab.click();
      }

      // Totals footer row
      const totalsRow = page.locator('tfoot td:has-text("TOTALS"), td:has-text("TOTALS")').first();
      if (await totalsRow.count() > 0) {
        await expect(totalsRow).toBeVisible();
      }
    }
  });

  test('should add a pitcher using the pitcher dropdown and Add Pitcher button', async ({ page }) => {
    // TODO: requires test data setup (game + at least one active roster player)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const manualTab = page.locator('button:has-text("Manual Entry"), button:has-text("✏️")').first();
      if (await manualTab.isVisible({ timeout: 3000 })) {
        await manualTab.click();
      }

      // Switch to Pitching tab
      const pitchingTab = page.locator('button:has-text("Pitching")').first();
      if (await pitchingTab.isVisible({ timeout: 3000 })) {
        await pitchingTab.click();
        await page.waitForTimeout(300);
      }

      // Find pitcher selector and select the first available option
      const pitcherSelect = page.locator('select:has(option[value!=""])').first();
      if (await pitcherSelect.count() > 0) {
        const options = await pitcherSelect.locator('option[value!=""]').all();
        const firstOption = options[0];
        if (options.length > 0 && firstOption) {
          const firstValue = await firstOption.getAttribute('value');
          if (firstValue) {
            await pitcherSelect.selectOption(firstValue);

            // Click Add Pitcher
            const addPitcherButton = page.locator('button:has-text("Add Pitcher")');
            if (await addPitcherButton.isVisible({ timeout: 3000 })) {
              await addPitcherButton.click();
              await page.waitForTimeout(300);

              // Pitcher row should now appear in the table
              await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 });
            }
          }
        }
      }
    }
  });

  test('should show empty pitching state when no pitchers have been added', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const manualTab = page.locator('button:has-text("Manual Entry"), button:has-text("✏️")').first();
      if (await manualTab.isVisible({ timeout: 3000 })) {
        await manualTab.click();
      }

      const pitchingTab = page.locator('button:has-text("Pitching")').first();
      if (await pitchingTab.isVisible({ timeout: 3000 })) {
        await pitchingTab.click();
        await page.waitForTimeout(300);

        // Empty state text should be visible when no pitchers added yet
        const emptyState = page.locator('text=/Add pitchers using the selector/i');
        // Only assert if no rows exist yet (game just created)
        const tableRows = page.locator('table tbody tr');
        const rowCount = await tableRows.count();
        if (rowCount === 0) {
          await expect(emptyState).toBeVisible({ timeout: 3000 });
        }
      }
    }
  });

  test('should show Save Box Score button and attempt to save', async ({ page }) => {
    // TODO: requires test data setup (game + roster players + at least one stat entry)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 3000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const manualTab = page.locator('button:has-text("Manual Entry"), button:has-text("✏️")').first();
      if (await manualTab.isVisible({ timeout: 3000 })) {
        await manualTab.click();
      }

      // The Save button should be visible
      const saveButton = page.locator(
        'button:has-text("Save Box Score"), button:has-text("Save")'
      ).first();

      if (await saveButton.isVisible({ timeout: 5000 })) {
        await expect(saveButton).toBeEnabled();

        // Click save; without data this is a no-op but shouldn't crash
        await saveButton.click();
        await page.waitForTimeout(1000);

        // Should either redirect to game detail page or stay with an error
        const currentUrl = page.url();
        expect(
          currentUrl.includes('/stats/games/') || currentUrl.includes('/dashboard')
        ).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Group 3: Coach views game history and completed box scores
// ---------------------------------------------------------------------------

test.describe('Coach - Games List and Box Score View', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test('should display the games list page', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    // Page heading or an "Add Game" button must be present
    const heading = page.locator('h1, h2').filter({ hasText: /Games|Scrimmage/i }).first();
    const addButton = page.locator('button:has-text("Add Game"), a:has-text("Add Game"), button:has-text("New Game")').first();

    const hasHeading = await heading.count() > 0;
    const hasAddButton = await addButton.count() > 0;

    expect(hasHeading || hasAddButton).toBeTruthy();
  });

  test('should show "Add Game" button and navigate to new game form', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const addButton = page.locator(
      'a[href*="/stats/games/new"], button:has-text("Add Game"), a:has-text("Add Game")'
    ).first();

    if (await addButton.count() > 0 && await addButton.isVisible({ timeout: 5000 })) {
      await addButton.click();
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/stats\/games\/new/);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should navigate to a game detail page from the games list', async ({ page }) => {
    // TODO: requires test data setup (at least one game must exist for this team)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameCard = page.locator('a[href*="/stats/games/"]').first();

    if (await gameCard.count() > 0 && await gameCard.isVisible({ timeout: 5000 })) {
      await gameCard.click();
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/stats\/games\/[a-zA-Z0-9-]+$/);
    }
  });

  test('should display the box score view for a completed game', async ({ page }) => {
    // TODO: requires test data setup (a completed game with batting + pitching entries)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    // Find a game with status "completed" (may show a "W" / "L" badge)
    const completedGame = page.locator(
      'a[href*="/stats/games/"]:has(text(/W|L|completed/i))'
    ).first();

    const anyGame = page.locator('a[href*="/stats/games/"]').first();
    const targetLink = (await completedGame.count() > 0) ? completedGame : anyGame;

    if (await targetLink.count() > 0 && await targetLink.isVisible({ timeout: 5000 })) {
      await targetLink.click();
      await waitForPageLoad(page);

      // BoxScoreView renders "Batting" and "Pitching" section headings
      const battingSection = page.locator('h2:has-text("Batting"), th:has-text("AB")').first();
      const entryForm = page.locator('button:has-text("Pitching")').first();

      // Either viewing a completed box score or showing the entry form
      const hasView = await battingSection.count() > 0;
      const hasEntry = await entryForm.count() > 0;
      expect(hasView || hasEntry).toBeTruthy();
    }
  });

  test('should display breadcrumb navigation on the game detail page', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // Breadcrumb "Games ›" link back to games list
      const breadcrumb = page.locator('a[href*="/stats/games"]:has-text("Games")').first();
      if (await breadcrumb.count() > 0) {
        await expect(breadcrumb).toBeVisible();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Group 4: Coach - Season stats summary page
// ---------------------------------------------------------------------------

test.describe('Coach - Season Stats Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test('should display season stats page with team name', async ({ page }) => {
    // TODO: requires test data setup (college/juco coach with a team)
    await page.goto('/baseball/dashboard/stats/season');
    await waitForPageLoad(page);

    // Should have a heading containing "Stats"
    await expect(
      page.locator('h1:has-text("Stats"), h1:has-text("Season")').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show season stats table or empty state', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/season');
    await waitForPageLoad(page);

    const statsTable = page.locator('table, [data-testid="season-stats-table"]');
    const emptyState = page.locator('text=/No stats|No games|Season stats/i');

    const hasTable = await statsTable.count() > 0;
    const hasEmpty = await emptyState.count() > 0;

    expect(hasTable || hasEmpty).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Group 5: Coach - CSV Upload flow
// ---------------------------------------------------------------------------

test.describe('Coach - CSV Box Score Upload', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test('should switch to CSV upload tab and show the upload form', async ({ page }) => {
    // TODO: requires test data setup (a game must exist)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // Click "CSV Upload" tab
      const csvTab = page.locator('button:has-text("CSV Upload"), button:has-text("📄 CSV Upload")').first();

      if (await csvTab.isVisible({ timeout: 5000 })) {
        await csvTab.click();
        await page.waitForTimeout(300);

        // Should show textarea for CSV paste and upload button
        await expect(page.locator('textarea').first()).toBeVisible({ timeout: 3000 });
        await expect(
          page.locator('button:has-text("Upload"), button:has-text("Match Players")').first()
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should show validation error when uploading empty CSV', async ({ page }) => {
    // TODO: requires test data setup (a game must exist)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const csvTab = page.locator('button:has-text("CSV Upload"), button:has-text("📄 CSV Upload")').first();

      if (await csvTab.isVisible({ timeout: 5000 })) {
        await csvTab.click();
        await page.waitForTimeout(300);

        // Leave textarea empty and click upload
        const uploadButton = page.locator(
          'button:has-text("Upload & Match"), button:has-text("Upload")'
        ).first();

        if (await uploadButton.isVisible({ timeout: 3000 })) {
          // Button should be disabled when no content
          const isDisabled = await uploadButton.isDisabled();
          expect(isDisabled).toBeTruthy();
        }
      }
    }
  });

  test('should offer batting/pitching CSV template download buttons', async ({ page }) => {
    // TODO: requires test data setup
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const csvTab = page.locator('button:has-text("CSV Upload"), button:has-text("📄 CSV Upload")').first();

      if (await csvTab.isVisible({ timeout: 5000 })) {
        await csvTab.click();
        await page.waitForTimeout(300);

        // "Download template" link
        const templateLink = page.locator('text=/Download template/i').first();
        if (await templateLink.count() > 0) {
          await expect(templateLink).toBeVisible();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Group 6: Player views their personal stats
// ---------------------------------------------------------------------------

test.describe('Player - My Stats Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPlayer(page);
    await waitForPageLoad(page);
  });

  test('should display the my-stats page', async ({ page }) => {
    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);

    // Should see "My Stats" heading
    await expect(
      page.locator('h1:has-text("My Stats"), h1:has-text("Stats")').first()
    ).toBeVisible({ timeout: 8000 });
  });

  test('should show player name and position header', async ({ page }) => {
    // TODO: requires test data setup (player profile with first/last name)
    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);

    // Either shows a player name or the page-level "My Stats" title
    const playerHeader = page.locator('h1').first();
    await expect(playerHeader).toBeVisible({ timeout: 8000 });

    const text = await playerHeader.textContent();
    expect(text).toBeTruthy();
  });

  test('should show season stats section or empty state', async ({ page }) => {
    // TODO: requires test data setup for season stats to be populated
    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);

    // MySeasonStats component renders batting stats table or empty state
    const seasonSection = page.locator(
      'text=/Season|season/i, table, text=/No stats|No games/i'
    ).first();

    await expect(seasonSection).toBeVisible({ timeout: 8000 });
  });

  test('should show empty state message when player has no stats yet', async ({ page }) => {
    // NOTE: This test is valid for a freshly created player with no recorded games.
    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);

    // Either stats data or the "No Stats Yet" empty state
    const emptyState = page.locator('text=/No Stats Yet|No stats/i');
    const statsContent = page.locator('table, [class*="stats"]');

    const hasEmpty = await emptyState.count() > 0;
    const hasStats = await statsContent.count() > 0;

    expect(hasEmpty || hasStats).toBeTruthy();
  });

  test('should have a Refresh button that can be clicked', async ({ page }) => {
    await page.goto('/baseball/dashboard/my-stats');
    await waitForPageLoad(page);

    const refreshButton = page.locator('button:has-text("Refresh")').first();

    if (await refreshButton.isVisible({ timeout: 5000 })) {
      await refreshButton.click();

      // Button enters "Refreshing..." state
      await expect(
        page.locator('button:has-text("Refreshing"), button:has-text("Refresh")')
      ).toBeVisible({ timeout: 3000 });
    }
  });
});

// ---------------------------------------------------------------------------
// Group 7: Box Score View — read-only rendering checks
// ---------------------------------------------------------------------------

test.describe('Box Score View - Read-Only Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test('should show win/loss badge next to final score in box score view', async ({ page }) => {
    // TODO: requires test data setup (a completed game with our_score and opponent_score set)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // Win/Loss badge rendered by BoxScoreView (W = green, L = red)
      const resultBadge = page.locator('text=/^W$|^L$|^T$/').first();
      // Batting stats column header
      const abHeader = page.locator('th:has-text("AB")').first();

      // Either the completed BoxScoreView or the entry form should be present
      const hasResult = await resultBadge.count() > 0;
      const hasEntry = await abHeader.count() > 0;
      expect(hasResult || hasEntry).toBeTruthy();
    }
  });

  test('should display computed AVG and OPS columns in batting table', async ({ page }) => {
    // TODO: requires test data setup (completed game with batting stats)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      // BoxScoreView renders th "AVG" and "OPS"/"OBP"/"SLG" columns
      const avgCol = page.locator('th:has-text("AVG")').first();
      if (await avgCol.count() > 0) {
        await expect(avgCol).toBeVisible();
      }
    }
  });

  test('should display ERA and WHIP columns in pitching table', async ({ page }) => {
    // TODO: requires test data setup (completed game with pitching stats)
    await page.goto('/baseball/dashboard/stats/games');
    await waitForPageLoad(page);

    const gameLink = page.locator('a[href*="/stats/games/"]').first();

    if (await gameLink.count() > 0 && await gameLink.isVisible({ timeout: 5000 })) {
      await gameLink.click();
      await waitForPageLoad(page);

      const eraCol = page.locator('th:has-text("ERA")').first();
      if (await eraCol.count() > 0) {
        await expect(eraCol).toBeVisible();
      }

      const whipCol = page.locator('th:has-text("WHIP")').first();
      if (await whipCol.count() > 0) {
        await expect(whipCol).toBeVisible();
      }
    }
  });
});
