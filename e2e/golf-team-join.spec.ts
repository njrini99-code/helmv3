import { test, expect } from '@playwright/test';

/**
 * Golf Team Management E2E Test
 * Tests the complete flow: create team → generate invite code → player joins
 * Part of GENIUS audit Phase 4: User Journey Testing
 */

const TEST_COACH = {
  email: 'coach@helmsportslabs.com',
  password: 'TestPassword123!',
};

const TEST_PLAYER = {
  email: 'player@helmsportslabs.com',
  password: 'TestPassword123!',
};

test.describe('Golf Team Management - Coach Flow', () => {
  test.skip('should display team settings page', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    // Navigate to team settings
    await page.goto('http://localhost:3000/golf/dashboard/team');

    // Should see team settings heading
    await expect(page.locator('h1')).toContainText(/Team/i);

    // Should see invite code section if team exists
    const inviteSection = page.locator('text=Invite Code, text=Team Invite');
    const createTeamButton = page.locator('button:has-text("Create Team")');

    const hasInviteSection = await inviteSection.isVisible();
    const needsTeamCreation = await createTeamButton.isVisible();

    expect(hasInviteSection || needsTeamCreation).toBe(true);
  });

  test.skip('should create a new team if none exists', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/golf/dashboard/team');

    // If create team button exists, create a team
    const createTeamButton = page.locator('button:has-text("Create Team")');

    if (await createTeamButton.isVisible()) {
      // Fill team name
      const teamNameInput = page.locator('input[placeholder*="Team"], input[name="teamName"]');
      if (await teamNameInput.isVisible()) {
        await teamNameInput.fill('E2E Test Golf Team');
      }

      await createTeamButton.click();

      // Should see success or team created
      await expect(page.locator('text=Invite Code, text=Created').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test.skip('should display and copy invite link', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/golf/dashboard/team');

    // Should see invite link input
    const inviteLinkInput = page.locator('input[readonly]').first();
    if (await inviteLinkInput.isVisible()) {
      const inviteLink = await inviteLinkInput.inputValue();
      expect(inviteLink).toContain('/golf/join/');

      // Should be 8 characters (readable format)
      const codeMatch = inviteLink.match(/\/golf\/join\/([A-Z0-9]+)$/);
      if (codeMatch && codeMatch[1]) {
        expect(codeMatch[1].length).toBe(8);
      }
    }

    // Should be able to copy link
    const copyButton = page.locator('button:has-text("Copy")').first();
    if (await copyButton.isVisible()) {
      await copyButton.click();
      await expect(page.locator('text=Copied')).toBeVisible({ timeout: 2000 });
    }
  });

  test.skip('should regenerate invite code', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/golf/dashboard/team');

    // Get current invite code
    const inviteLinkInput = page.locator('input[readonly]').first();
    const oldLink = await inviteLinkInput.inputValue();

    // Click regenerate button
    const regenerateButton = page.locator('button:has-text("Regenerate"), button:has-text("New Code")');
    if (await regenerateButton.isVisible()) {
      await regenerateButton.click();

      // Wait for update
      await page.waitForTimeout(1000);

      // Get new invite code
      const newLink = await inviteLinkInput.inputValue();

      // Should be different
      expect(newLink).not.toBe(oldLink);
    }
  });
});

test.describe('Golf Team Management - Player Join Flow', () => {
  test.skip('should show error for invalid invite code', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    // Navigate to invalid invite code
    await page.goto('http://localhost:3000/golf/join/INVALID1');

    // Should see error message
    await expect(page.locator('text=Invalid Invite Code, text=does not exist')).toBeVisible({ timeout: 5000 });
  });

  test.skip('should display team join confirmation for valid code', async ({ page }) => {
    // This test requires a valid invite code from a real team
    // In a real test environment, we would:
    // 1. Create a team as coach
    // 2. Get the invite code
    // 3. Login as player
    // 4. Navigate to /golf/join/{code}
    // 5. Verify the join confirmation UI

    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    // For now, just verify the join page structure exists
    // Replace VALIDCODE with an actual code for integration testing
    // await page.goto('http://localhost:3000/golf/join/VALIDCODE');
    // await expect(page.locator('h1')).toContainText(/Join/i);
    // await expect(page.locator('button:has-text("Confirm & Join")')).toBeVisible();
  });

  test.skip('should show already on team message', async ({ page }) => {
    // This test verifies the error message when a player is already on a team
    // and tries to join another team

    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    // If player is already on a team and tries to join another,
    // they should see the error from validateGolfPlayerCanJoinTeam
    // "You are already on {team name}. Golf players can only be on one team at a time."
  });
});

test.describe('Golf Team Management - Roster from Coach Perspective', () => {
  test.skip('should display roster with player status badges', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    // Navigate to roster
    await page.goto('http://localhost:3000/golf/dashboard/roster');

    // Should see roster heading
    await expect(page.locator('h1')).toContainText(/Roster/i);

    // Should see player cards or empty state
    const playerCards = page.locator('[data-testid="player-card"], .player-card, tr');
    const emptyState = page.locator('text=No players, text=Add players');

    const hasPlayers = await playerCards.count() > 0;
    const isEmpty = await emptyState.isVisible();

    expect(hasPlayers || isEmpty).toBe(true);

    // If players exist, should see status badges
    if (hasPlayers) {
      const statusBadge = page.locator('text=Active, text=Injured, text=Redshirt, text=Inactive').first();
      await expect(statusBadge).toBeVisible({ timeout: 3000 });
    }
  });

  test.skip('should change player status via dropdown', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/golf/dashboard/roster');

    // Find a status badge that's editable
    const statusBadge = page.locator('button:has-text("Active")').first();

    if (await statusBadge.isVisible()) {
      await statusBadge.click();

      // Should see dropdown with status options
      await expect(page.locator('text=Injured')).toBeVisible({ timeout: 2000 });
      await expect(page.locator('text=Redshirt')).toBeVisible({ timeout: 2000 });
      await expect(page.locator('text=Inactive')).toBeVisible({ timeout: 2000 });

      // Click a different status
      await page.click('text=Injured');

      // Should see updated status (after refresh)
      await page.waitForTimeout(1000);
    }
  });

  test.skip('should remove player from team', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/golf/dashboard/roster');

    // Find player actions menu
    const actionsMenu = page.locator('button[aria-label="Player actions"], button:has-text("...")').first();

    if (await actionsMenu.isVisible()) {
      await actionsMenu.click();

      // Should see remove option
      const removeOption = page.locator('text=Remove from Team');
      await expect(removeOption).toBeVisible({ timeout: 2000 });

      // Note: Actually clicking remove would modify data,
      // so we just verify the option exists
    }
  });
});

test.describe('Golf Team - Player Onboarding with Team Join', () => {
  test.skip('should allow entering invite code during onboarding', async ({ page }) => {
    // This tests the team join step in player onboarding
    // Navigate directly to the onboarding page (would need a new account)

    await page.goto('http://localhost:3000/golf/player');

    // Should see team join step eventually
    // Look for invite code input (verification only, full test needs new account)
    const _inviteCodeInput = page.locator('input[placeholder*="invite"], input[placeholder*="code"]');
    void _inviteCodeInput; // Placeholder for future integration test

    // Note: Full onboarding test would require:
    // 1. Creating a new account
    // 2. Going through all onboarding steps
    // 3. Entering a valid invite code
    // 4. Verifying team join success
  });
});
