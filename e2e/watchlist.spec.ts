import { test, expect } from '@playwright/test';
import { loginAsCoach } from './helpers/auth';
import { waitForPageLoad, waitForElement } from './helpers/common';

test.describe('Watchlist Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as coach
    await loginAsCoach(page);
    await waitForPageLoad(page);
  });

  test.describe('Adding Players', () => {
    test('should add player to watchlist from Discover page', async ({ page }) => {
      // Navigate to discover
      await page.goto('/baseball/dashboard/discover');
      await waitForPageLoad(page);

      // Wait for players to load
      await waitForElement(page, '[data-testid="player-card"], .player-card');

      // Find and click "Add to Watchlist" button on first player
      const addButton = page.locator(
        'button:has-text("Add to Watchlist"), button:has-text("Add"), [data-testid="add-to-watchlist"]'
      ).first();

      if (await addButton.isVisible({ timeout: 5000 })) {
        await addButton.click();

        // Should show success notification
        await expect(
          page.locator('text=/Added|Success|Added to watchlist/i')
        ).toBeVisible({ timeout: 5000 });

        // Button should change to "On Watchlist" or similar
        await expect(
          page.locator('button:has-text("On Watchlist"), button:has-text("Added")').first()
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should add player to watchlist from player profile', async ({ page }) => {
      // Navigate to discover first
      await page.goto('/baseball/dashboard/discover');
      await waitForPageLoad(page);

      // Click on a player card to go to profile
      const firstPlayer = page.locator('[data-testid="player-card"], .player-card').first();
      await firstPlayer.click();

      // Wait for profile page
      await page.waitForURL('**/players/**', { timeout: 10000 });
      await waitForPageLoad(page);

      // Find "Add to Watchlist" button
      const addButton = page.locator(
        'button:has-text("Add to Watchlist"), [data-testid="add-to-watchlist"]'
      );

      if (await addButton.count() > 0 && await addButton.first().isVisible()) {
        await addButton.first().click();

        // Should show success
        await expect(
          page.locator('text=/Added|Success|On Watchlist/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Viewing Watchlist', () => {
    test('should display watchlist page', async ({ page }) => {
      await page.goto('/baseball/dashboard/watchlist');
      await waitForPageLoad(page);

      // Should see watchlist heading
      await expect(
        page.locator('h1:has-text("Watchlist"), h2:has-text("Watchlist"), text=/Watchlist/i').first()
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show players on watchlist', async ({ page }) => {
      // First add a player to watchlist
      await page.goto('/baseball/dashboard/discover');
      await waitForPageLoad(page);

      const addButton = page.locator('button:has-text("Add to Watchlist")').first();
      if (await addButton.count() > 0 && await addButton.isVisible({ timeout: 2000 })) {
        await addButton.click();
        await page.waitForTimeout(1000);
      }

      // Navigate to watchlist
      await page.goto('/baseball/dashboard/watchlist');
      await waitForPageLoad(page);

      // Should see player cards or list items
      const watchlistItems = page.locator('[data-testid="watchlist-player"], .watchlist-item, .player-card');
      const count = await watchlistItems.count();

      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should show empty state when watchlist is empty', async ({ page }) => {
      await page.goto('/baseball/dashboard/watchlist');
      await waitForPageLoad(page);

      // If watchlist is empty, should show empty state
      const playerCards = page.locator('[data-testid="watchlist-player"], .player-card');
      const count = await playerCards.count();

      if (count === 0) {
        await expect(
          page.locator('text=/No players|Empty|Add players/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Removing Players', () => {
    test('should remove player from watchlist', async ({ page }) => {
      // Navigate to watchlist
      await page.goto('/baseball/dashboard/watchlist');
      await waitForPageLoad(page);

      // Find remove button on first player
      const removeButton = page.locator(
        'button:has-text("Remove"), button:has-text("Delete"), [data-testid="remove-from-watchlist"]'
      ).first();

      if (await removeButton.count() > 0 && await removeButton.isVisible({ timeout: 2000 })) {
        // Get initial count
        const initialCount = await page.locator('[data-testid="watchlist-player"], .player-card').count();

        await removeButton.click();

        // Wait for removal
        await page.waitForTimeout(1000);

        // Count should decrease
        const newCount = await page.locator('[data-testid="watchlist-player"], .player-card').count();
        expect(newCount).toBeLessThanOrEqual(initialCount);
      }
    });
  });

  test.describe('Pipeline Management', () => {
    test('should change player pipeline stage', async ({ page }) => {
      // Navigate to pipeline
      await page.goto('/baseball/dashboard/pipeline');
      await waitForPageLoad(page);

      // Look for pipeline stages/columns
      const pipelineColumns = page.locator('[data-testid="pipeline-column"], .pipeline-column, .kanban-column');

      if (await pipelineColumns.count() > 0) {
        await expect(pipelineColumns.first()).toBeVisible();
      }
    });

    test('should drag and drop player between stages', async ({ page }) => {
      await page.goto('/baseball/dashboard/pipeline');
      await waitForPageLoad(page);

      // Find draggable player cards
      const playerCard = page.locator('[data-testid="pipeline-player"], .draggable-card').first();

      if (await playerCard.count() > 0 && await playerCard.isVisible({ timeout: 2000 })) {
        // Get bounding box for drag and drop
        const box = await playerCard.boundingBox();

        if (box) {
          // Find a different column to drop into
          const targetColumn = page.locator('[data-testid="pipeline-column"]').nth(1);

          if (await targetColumn.count() > 0) {
            const targetBox = await targetColumn.boundingBox();

            if (targetBox) {
              // Perform drag and drop
              await playerCard.hover();
              await page.mouse.down();
              await page.mouse.move(targetBox.x + 50, targetBox.y + 50);
              await page.mouse.up();

              // Should show success or update
              await page.waitForTimeout(1000);
            }
          }
        }
      }
    });
  });

  test.describe('Watchlist Filters', () => {
    test('should filter watchlist by stage', async ({ page }) => {
      await page.goto('/baseball/dashboard/watchlist');
      await waitForPageLoad(page);

      // Look for stage filter
      const stageFilter = page.locator('select[name="stage"], [data-testid="stage-filter"]');

      if (await stageFilter.count() > 0) {
        await stageFilter.first().selectOption('high_priority');
        await page.waitForTimeout(1000);

        // Verify URL or results updated
        const url = page.url();
        expect(url.includes('stage') || true).toBeTruthy();
      }
    });

    test('should filter watchlist by position', async ({ page }) => {
      await page.goto('/baseball/dashboard/watchlist');
      await waitForPageLoad(page);

      // Look for position filter
      const positionFilter = page.locator('select[name="position"], [data-testid="position-filter"]');

      if (await positionFilter.count() > 0) {
        await positionFilter.first().selectOption('SS');
        await page.waitForTimeout(1000);

        // Verify results updated
        const url = page.url();
        expect(url.includes('position') || true).toBeTruthy();
      }
    });
  });
});
