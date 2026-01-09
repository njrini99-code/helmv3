import { test, expect } from '@playwright/test';

/**
 * Roster Management E2E Test
 * Tests roster CRUD operations for HS and Showcase coaches
 */

const TEST_COACH = {
  email: 'coach@helmsportslabs.com',
  password: 'TestPassword123!',
};

test.describe('Roster Management - HS Coach Flow', () => {
  test.skip('should display roster list', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    // Navigate to roster
    await page.goto('http://localhost:3000/baseball/dashboard/roster');

    // Should see roster heading
    await expect(page.locator('h1')).toContainText(/Roster/i);

    // Should see roster table or empty state
    const rosterTable = page.locator('table, [data-testid="roster-table"]');
    const emptyState = page.locator('text=No players, text=Add your first player');

    const hasRoster = await rosterTable.isVisible();
    const hasEmptyState = await emptyState.isVisible();

    expect(hasRoster || hasEmptyState).toBe(true);
  });

  test.skip('should add a new player to roster', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/roster');

    // Click add player
    const addButton = page.locator('button:has-text("Add Player"), button:has-text("Invite Player")');

    if (await addButton.isVisible()) {
      await addButton.click();

      // Fill player form or invite modal
      const emailInput = page.locator('input[type="email"], input[name="email"]');

      if (await emailInput.isVisible()) {
        await emailInput.fill('newplayer@test.com');

        // Submit invitation
        await page.click('button:has-text("Send"), button:has-text("Invite")');

        // Should see success message
        await expect(page.locator('text=sent, text=invited').first()).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test.skip('should generate team join link', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/roster');

    // Look for generate link button
    const generateLinkButton = page.locator('button:has-text("Generate Link"), button:has-text("Invite Link")');

    if (await generateLinkButton.isVisible()) {
      await generateLinkButton.click();

      // Should see join link
      await expect(page.locator('input[readonly], .join-link')).toBeVisible({ timeout: 3000 });

      // Should be able to copy link
      const copyButton = page.locator('button:has-text("Copy")');
      if (await copyButton.isVisible()) {
        await copyButton.click();
        await expect(page.locator('text=Copied')).toBeVisible({ timeout: 2000 });
      }
    }
  });

  test.skip('should view player details from roster', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/roster');

    // Click on a player row
    const playerRow = page.locator('tr[data-testid="player-row"], .player-row').first();

    if (await playerRow.isVisible()) {
      await playerRow.click();

      // Should open player detail panel or navigate to profile
      await expect(page.locator('[data-testid="player-panel"], .player-detail, h1:has-text("Profile")').first()).toBeVisible({ timeout: 3000 });
    }
  });

  test.skip('should remove player from roster', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/roster');

    // Find remove button for a player
    const removeButton = page.locator('button:has-text("Remove"), button[aria-label="Remove player"]').first();

    if (await removeButton.isVisible()) {
      await removeButton.click();

      // Should see confirmation dialog
      await expect(page.locator('text=Are you sure, text=Confirm removal')).toBeVisible({ timeout: 3000 });

      // Confirm removal
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      await confirmButton.click();

      // Should see success message
      await expect(page.locator('text=removed, text=deleted').first()).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Roster Management - College Interest Tracking', () => {
  test.skip('should show college interest per player', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    // Navigate to college interest page
    await page.goto('http://localhost:3000/baseball/dashboard/college-interest');

    // Should see interest tracking section
    await expect(page.locator('h1, h2')).toContainText(/Interest|Activity/i);

    // Should see list of players with interest counts
    const interestRows = page.locator('[data-testid="interest-row"], .interest-row');
    const emptyState = page.locator('text=No interest yet, text=No activity');

    const hasInterest = await interestRows.count() > 0;
    const hasEmptyState = await emptyState.isVisible();

    expect(hasInterest || hasEmptyState).toBe(true);
  });

  test.skip('should view interest details for a player', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/college-interest');

    // Click on a player to see details
    const playerName = page.locator('[data-testid="interest-row"], .interest-row').first();

    if (await playerName.isVisible()) {
      await playerName.click();

      // Should see list of interested schools
      await expect(page.locator('text=Schools, text=Programs, text=Views').first()).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Roster Management - Batch Operations', () => {
  test.skip('should upload videos for multiple players', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/roster');

    // Look for batch upload button
    const batchUploadButton = page.locator('button:has-text("Batch Upload"), button:has-text("Upload Videos")');

    if (await batchUploadButton.isVisible()) {
      await batchUploadButton.click();

      // Should see batch upload modal
      await expect(page.locator('text=Select Players, text=Upload for multiple')).toBeVisible({ timeout: 3000 });
    }
  });
});
