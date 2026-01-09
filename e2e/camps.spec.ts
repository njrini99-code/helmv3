import { test, expect } from '@playwright/test';

/**
 * Baseball Camps E2E Test
 * Tests camp browsing, registration, and management
 */

const TEST_PLAYER = {
  email: 'player@helmsportslabs.com',
  password: 'TestPassword123!',
};

const TEST_COACH = {
  email: 'coach@helmsportslabs.com',
  password: 'TestPassword123!',
};

test.describe('Camps - Player Flow', () => {
  test.skip('should browse available camps', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    // Navigate to camps
    await page.goto('http://localhost:3000/baseball/dashboard/camps');

    // Should see camps heading
    await expect(page.locator('h1')).toContainText(/Camp/i);

    // Should see list of camps or empty state
    const campCards = page.locator('[data-testid="camp-card"], .camp-card');
    const emptyState = page.locator('text=No camps available, text=No upcoming camps');

    // Either camps exist or empty state is shown
    const hasCamps = await campCards.count() > 0;
    const hasEmptyState = await emptyState.isVisible();

    expect(hasCamps || hasEmptyState).toBe(true);
  });

  test.skip('should filter camps by date', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/camps');

    // Look for date filter
    const dateFilter = page.locator('[data-testid="date-filter"], select[name="month"]');

    if (await dateFilter.isVisible()) {
      // Filter by upcoming month
      await dateFilter.selectOption({ index: 1 });

      // Wait for filter to apply
      await page.waitForTimeout(500);
    }
  });

  test.skip('should view camp details', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/camps');

    // Click on a camp if one exists
    const campCard = page.locator('[data-testid="camp-card"], .camp-card').first();

    if (await campCard.isVisible()) {
      await campCard.click();

      // Should see camp details
      await expect(page.locator('text=Date, text=Location, text=Price').first()).toBeVisible({ timeout: 3000 });

      // Should see registration button
      await expect(page.locator('button:has-text("Register"), button:has-text("Sign Up")').first()).toBeVisible();
    }
  });

  test.skip('should register for a camp', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_PLAYER.email);
    await page.fill('input[type="password"]', TEST_PLAYER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/camps');

    const campCard = page.locator('[data-testid="camp-card"], .camp-card').first();

    if (await campCard.isVisible()) {
      await campCard.click();

      // Click register
      const registerButton = page.locator('button:has-text("Register"), button:has-text("Sign Up")').first();

      if (await registerButton.isVisible()) {
        await registerButton.click();

        // Should see confirmation or payment flow
        await expect(page.locator('text=Confirm, text=Registration, text=Payment').first()).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe('Camps - Coach Flow', () => {
  test.skip('should create a new camp', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/camps');

    // Click create camp
    const createButton = page.locator('button:has-text("Create Camp"), button:has-text("New Camp")');

    if (await createButton.isVisible()) {
      await createButton.click();

      // Fill camp form
      await page.fill('input[name="name"]', 'E2E Test Camp');
      await page.fill('input[name="location"]', 'University Stadium');
      await page.fill('input[name="price"]', '150');
      await page.fill('textarea[name="description"]', 'Test camp for E2E testing');

      // Submit
      await page.click('button:has-text("Create"), button:has-text("Save")');

      // Should see success message or new camp in list
      await expect(page.locator('text=E2E Test Camp')).toBeVisible({ timeout: 3000 });
    }
  });

  test.skip('should view camp registrations', async ({ page }) => {
    await page.goto('http://localhost:3000/baseball/login');
    await page.fill('input[type="email"]', TEST_COACH.email);
    await page.fill('input[type="password"]', TEST_COACH.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/baseball/dashboard**', { timeout: 10000 });

    await page.goto('http://localhost:3000/baseball/dashboard/camps');

    // Click on a camp to view details
    const campCard = page.locator('[data-testid="camp-card"], .camp-card').first();

    if (await campCard.isVisible()) {
      await campCard.click();

      // Look for registrations tab/section
      const registrationsTab = page.locator('button:has-text("Registrations"), a:has-text("Registrations")');

      if (await registrationsTab.isVisible()) {
        await registrationsTab.click();

        // Should see list of registered players
        await expect(page.locator('text=Registered, text=Participants').first()).toBeVisible({ timeout: 3000 });
      }
    }
  });
});
