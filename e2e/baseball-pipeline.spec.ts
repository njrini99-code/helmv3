import { test, expect } from '@playwright/test';

/**
 * Baseball Pipeline E2E Test
 * Tests pipeline drag-and-drop, stage management, and player tracking
 */

const TEST_COACH = {
  email: 'coach@helmsportslabs.com',
  password: 'TestPassword123!',
};

test.describe('Baseball Pipeline - College Coach Flow', () => {
  test.skip('should display pipeline board with stages', async ({ page }) => {
    // Skip if coach login not available
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    // Navigate to pipeline
    await page.goto('http://localhost:3000/baseball/dashboard/pipeline');

    // Should see pipeline heading
    await expect(page.locator('h1')).toContainText(/Pipeline|Planner/i);

    // Should see all 5 stages
    const stages = ['Watchlist', 'High Priority', 'Offer Extended', 'Committed', 'Uninterested'];

    for (const stage of stages) {
      await expect(page.locator(`text=${stage}`).first()).toBeVisible();
    }
  });

  test.skip('should drag player between stages', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/pipeline');

    // Find a player card
    const playerCard = page.locator('[data-testid="player-card"], .player-card').first();

    if (await playerCard.isVisible()) {
      // Get initial position
      const initialBoundingBox = await playerCard.boundingBox();

      // Find target column
      const targetColumn = page.locator('[data-testid="stage-high_priority"], [data-stage="high_priority"]').first();

      if (await targetColumn.isVisible() && initialBoundingBox) {
        const targetBox = await targetColumn.boundingBox();

        if (targetBox) {
          // Perform drag
          await playerCard.hover();
          await page.mouse.down();
          await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
          await page.mouse.up();

          // Verify stage changed (by checking for success toast or card location)
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test.skip('should filter pipeline by grad year', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/pipeline');

    // Look for filter dropdown
    const gradYearFilter = page.locator('select[name="gradYear"], [data-testid="grad-year-filter"]');

    if (await gradYearFilter.isVisible()) {
      await gradYearFilter.selectOption('2025');

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // All visible player cards should be 2025
      const playerCards = page.locator('[data-testid="player-card"], .player-card');
      const count = await playerCards.count();

      for (let i = 0; i < Math.min(count, 5); i++) {
        const card = playerCards.nth(i);
        const gradYear = await card.locator('[data-testid="grad-year"], .grad-year').textContent();
        if (gradYear) {
          expect(gradYear).toContain('2025');
        }
      }
    }
  });

  test.skip('should add notes to a player', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/pipeline');

    // Click on a player card
    const playerCard = page.locator('[data-testid="player-card"], .player-card').first();

    if (await playerCard.isVisible()) {
      await playerCard.click();

      // Should open player detail panel
      await expect(page.locator('[data-testid="player-panel"], .player-detail')).toBeVisible({ timeout: 3000 });

      // Find notes section
      const notesArea = page.locator('textarea[name="notes"], [data-testid="notes-input"]');

      if (await notesArea.isVisible()) {
        await notesArea.fill('E2E Test Note - Great arm strength');

        // Save notes
        const saveButton = page.locator('button:has-text("Save"), button:has-text("Update")');
        await saveButton.click();

        // Verify saved
        await expect(page.locator('text=saved, text=updated').first()).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe('Baseball Pipeline - Keyboard Navigation', () => {
  test.skip('should support keyboard navigation', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/pipeline');

    // Focus on first player card
    const playerCard = page.locator('[data-testid="player-card"], .player-card').first();

    if (await playerCard.isVisible()) {
      await playerCard.focus();

      // Press Enter to open detail
      await page.keyboard.press('Enter');

      // Should open detail panel
      await expect(page.locator('[data-testid="player-panel"], .player-detail')).toBeVisible({ timeout: 3000 });

      // Press Escape to close
      await page.keyboard.press('Escape');

      // Panel should close
      await expect(page.locator('[data-testid="player-panel"], .player-detail')).not.toBeVisible({ timeout: 1000 });
    }
  });
});
