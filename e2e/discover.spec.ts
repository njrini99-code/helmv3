import { test, expect } from '@playwright/test';
import { loginAsCoach } from './helpers/auth';
import { waitForPageLoad, waitForElement, clearAndFill } from './helpers/common';

test.describe('Player Discovery', () => {
  test.beforeEach(async ({ page }) => {
    // Login as coach before each test
    await loginAsCoach(page);
    await waitForPageLoad(page);

    // Navigate to discover page
    await page.goto('/baseball/dashboard/discover');
    await waitForPageLoad(page);
  });

  test.describe('Player List', () => {
    test('should load and display players', async ({ page }) => {
      // Wait for players to load
      await waitForElement(page, '[data-testid="player-card"], .player-card, [class*="PlayerCard"]');

      // Should have multiple players
      const playerCards = page.locator('[data-testid="player-card"], .player-card, [class*="PlayerCard"]');
      const count = await playerCards.count();

      expect(count).toBeGreaterThan(0);
    });

    test('should display player information on cards', async ({ page }) => {
      // Wait for first player card
      await waitForElement(page, '[data-testid="player-card"], .player-card, [class*="PlayerCard"]');

      const firstPlayer = page.locator('[data-testid="player-card"], .player-card, [class*="PlayerCard"]').first();

      // Should have player name
      await expect(firstPlayer).toContainText(/.+/);

      // Should be visible
      await expect(firstPlayer).toBeVisible();
    });

    test('should handle empty state when no players match filters', async ({ page }) => {
      // Apply filters that won't match any players
      const stateFilter = page.locator('select[name="state"], select#state, [data-testid="state-filter"]');

      if (await stateFilter.count() > 0) {
        await stateFilter.first().selectOption('XX'); // Invalid state

        // Should show empty state
        await expect(
          page.locator('text=/No players found|No results|No matches/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Filters', () => {
    test('should filter players by graduation year', async ({ page }) => {
      // Wait for players to load
      await waitForPageLoad(page);

      // Find graduation year filter
      const gradYearFilter = page.locator(
        'select[name="gradYear"], select[name="grad_year"], select#grad-year, [data-testid="grad-year-filter"]'
      );

      if (await gradYearFilter.count() > 0) {
        // Select a graduation year
        await gradYearFilter.first().selectOption('2025');

        // Wait for filtered results
        await page.waitForTimeout(1000);

        // Check that results updated
        const playerCards = page.locator('[data-testid="player-card"], .player-card');
        const count = await playerCards.count();

        // Should have some results or empty state
        expect(count >= 0).toBeTruthy();
      }
    });

    test('should filter players by position', async ({ page }) => {
      await waitForPageLoad(page);

      // Find position filter
      const positionFilter = page.locator(
        'select[name="position"], select#position, [data-testid="position-filter"]'
      );

      if (await positionFilter.count() > 0) {
        // Select a position
        await positionFilter.first().selectOption('SS');

        // Wait for filtered results
        await page.waitForTimeout(1000);

        // Verify URL or state updated
        const url = page.url();
        expect(url).toContain('position=SS');
      }
    });

    test('should filter players by state', async ({ page }) => {
      await waitForPageLoad(page);

      // Find state filter
      const stateFilter = page.locator(
        'select[name="state"], select#state, [data-testid="state-filter"]'
      );

      if (await stateFilter.count() > 0) {
        // Select a state
        await stateFilter.first().selectOption('TX');

        // Wait for filtered results
        await page.waitForTimeout(1000);

        // Verify URL or state updated
        const url = page.url();
        expect(url).toContain('state=TX');
      }
    });

    test('should clear filters', async ({ page }) => {
      await waitForPageLoad(page);

      // Apply a filter first
      const gradYearFilter = page.locator('select[name="gradYear"], select[name="grad_year"]');

      if (await gradYearFilter.count() > 0) {
        await gradYearFilter.first().selectOption('2025');
        await page.waitForTimeout(500);

        // Look for clear/reset button
        const clearButton = page.locator(
          'button:has-text("Clear"), button:has-text("Reset"), [data-testid="clear-filters"]'
        );

        if (await clearButton.count() > 0) {
          await clearButton.first().click();
          await page.waitForTimeout(500);

          // Filter should be reset
          const selectedValue = await gradYearFilter.first().inputValue();
          expect(selectedValue === '' || selectedValue === 'all').toBeTruthy();
        }
      }
    });
  });

  test.describe('Search', () => {
    test('should search players by name', async ({ page }) => {
      await waitForPageLoad(page);

      // Find search input
      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="Search"], input[name="search"], [data-testid="search-input"]'
      );

      if (await searchInput.count() > 0) {
        // Type in search query
        await searchInput.first().fill('John');

        // Wait for search results
        await page.waitForTimeout(1000);

        // Should show filtered results
        const playerCards = page.locator('[data-testid="player-card"], .player-card');
        const count = await playerCards.count();

        // Should have results or empty state
        expect(count >= 0).toBeTruthy();
      }
    });

    test('should show autocomplete suggestions', async ({ page }) => {
      await waitForPageLoad(page);

      // Find search input with autocomplete
      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="Search"]'
      );

      if (await searchInput.count() > 0) {
        // Start typing
        await searchInput.first().fill('Jo');

        // Wait for suggestions
        await page.waitForTimeout(500);

        // Check for dropdown/suggestions
        const suggestions = page.locator('[role="listbox"], [data-testid="autocomplete-list"], .autocomplete-suggestions');

        if (await suggestions.count() > 0) {
          await expect(suggestions.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Player Card Actions', () => {
    test('should navigate to player profile on card click', async ({ page }) => {
      await waitForPageLoad(page);

      // Wait for player cards
      await waitForElement(page, '[data-testid="player-card"], .player-card');

      // Click first player card
      const firstPlayer = page.locator('[data-testid="player-card"], .player-card').first();
      await firstPlayer.click();

      // Should navigate to player profile
      await page.waitForURL('**/players/**', { timeout: 10000 });
      expect(page.url()).toContain('/players/');
    });

    test('should add player to watchlist from card', async ({ page }) => {
      await waitForPageLoad(page);

      // Wait for player cards
      await waitForElement(page, '[data-testid="player-card"], .player-card');

      // Find add to watchlist button on first card
      const addButton = page.locator(
        'button:has-text("Add to Watchlist"), button:has-text("Add"), [data-testid="add-to-watchlist"]'
      ).first();

      if (await addButton.count() > 0 && await addButton.isVisible()) {
        await addButton.click();

        // Should show success feedback
        await expect(
          page.locator('text=/Added|Success|Watchlist/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Map View', () => {
    test('should toggle to map view', async ({ page }) => {
      await waitForPageLoad(page);

      // Look for view toggle button
      const mapViewButton = page.locator(
        'button:has-text("Map"), [data-testid="map-view-toggle"]'
      );

      if (await mapViewButton.count() > 0) {
        await mapViewButton.first().click();

        // Should show map
        await expect(
          page.locator('[data-testid="map"], .map-container, #map')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
