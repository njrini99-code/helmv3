import { test, expect } from '@playwright/test';

/**
 * Golf Dashboard E2E Test
 * Tests the complete golf dashboard flow with enhanced features
 */

const TEST_USER = {
  email: 'rinin376@gmail.com',
  password: 'Pirates#09!!',
};

test.describe('Golf Dashboard - Player Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3000/golf/login');

    // Login
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
  });

  test('should load dashboard successfully', async ({ page }) => {
    // Verify dashboard loaded
    await expect(page).toHaveURL(/\/golf\/dashboard/);

    // Should see dashboard heading
    await expect(page.locator('h1')).toContainText(/Good (morning|afternoon|evening)/);
  });

  test('should navigate to rounds page', async ({ page }) => {
    // Click on rounds link
    await page.click('text=My Rounds');

    // Should navigate to rounds page
    await expect(page).toHaveURL(/\/golf\/dashboard\/rounds/);

    // Should see rounds heading
    await expect(page.locator('h1')).toContainText('Rounds');
  });

  test('should access new round page and see all steps', async ({ page }) => {
    // Navigate to new round page
    await page.goto('http://localhost:3000/golf/dashboard/rounds/new');

    // Step 1: Setup - Should see course setup form
    await expect(page.locator('h1')).toContainText('New Round');
    await expect(page.locator('input[name="courseName"]')).toBeVisible();

    // Fill in course setup
    await page.fill('input[name="courseName"]', 'E2E Test Course');
    await page.fill('input[name="courseCity"]', 'Test City');
    await page.fill('input[name="courseState"]', 'CA');

    // Should see emerald-colored button (modern design)
    const nextButton = page.locator('button:has-text("Next: Configure Holes")');
    await expect(nextButton).toBeVisible();
    await expect(nextButton).toHaveClass(/bg-emerald-600/);

    // Click next
    await nextButton.click();

    // Step 2: Holes - Should see hole configuration form
    await expect(page.locator('text=E2E Test Course')).toBeVisible();
    await expect(page.locator('text=Total Par')).toBeVisible();

    // Should see hole configuration grid
    await expect(page.locator('text=Hole')).toBeVisible();
    await expect(page.locator('text=Par')).toBeVisible();
    await expect(page.locator('text=Yardage')).toBeVisible();

    // Should see Front 9 / Back 9 tabs
    await expect(page.locator('button:has-text("Front 9")')).toBeVisible();
    await expect(page.locator('button:has-text("Back 9")')).toBeVisible();

    // Should see par selector buttons with modern styling
    const parButtons = page.locator('button:has-text("3"), button:has-text("4"), button:has-text("5")').first();
    await expect(parButtons).toBeVisible();

    // Should see save button with emerald styling
    const saveButton = page.locator('button:has-text("Save Course & Start Round")');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toHaveClass(/bg-emerald-600/);

    // Click save to proceed to shot tracking
    await saveButton.click();

    // Step 3: Shot Tracking - Should see ShotTrackingComprehensive
    await expect(page.locator('text=Hole 1')).toBeVisible({ timeout: 5000 });

    // Should see shot tracking interface
    // (Note: Full shot tracking test would be more complex,
    // this just verifies the component loaded)
  });

  test('should navigate to stats page', async ({ page }) => {
    // Navigate to stats page
    await page.goto('http://localhost:3000/golf/dashboard/stats');

    // Should see stats page
    await expect(page.locator('h1')).toContainText('Stats');

    // Should see category pills (modern design)
    await expect(page.locator('button:has-text("Scoring")')).toBeVisible();
    await expect(page.locator('button:has-text("Driving")')).toBeVisible();
    await expect(page.locator('button:has-text("Approach")')).toBeVisible();
    await expect(page.locator('button:has-text("Putting")')).toBeVisible();
    await expect(page.locator('button:has-text("Scrambling")')).toBeVisible();
  });

  test('should verify emerald color scheme throughout', async ({ page }) => {
    // Go to new round page
    await page.goto('http://localhost:3000/golf/dashboard/rounds/new');

    // Check for emerald focus rings on inputs
    const courseNameInput = page.locator('input[name="courseName"]');
    await courseNameInput.click();

    // Check button has emerald background
    const nextButton = page.locator('button:has-text("Next: Configure Holes")');
    await expect(nextButton).toHaveClass(/bg-emerald-600/);

    // Navigate to holes step
    await page.fill('input[name="courseName"]', 'Color Test Course');
    await nextButton.click();

    // Verify hole configuration uses emerald colors
    await expect(page.locator('text=Total Par')).toBeVisible();

    // Check save button uses emerald
    const saveButton = page.locator('button:has-text("Save Course & Start Round")');
    await expect(saveButton).toHaveClass(/bg-emerald-600/);
  });
});

test.describe('Golf Dashboard - Route Consolidation', () => {
  test('should not have player-golf routes', async ({ page }) => {
    // Attempt to access old player-golf routes
    const oldRoutes = [
      '/player-golf/rounds/new',
      '/player-golf/stats',
      '/player-golf/rounds',
    ];

    for (const route of oldRoutes) {
      const response = await page.goto(`http://localhost:3000${route}`);
      // Should get 404 or redirect
      expect(response?.status()).not.toBe(200);
    }
  });

  test('login should redirect to golf dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/golf/login');

    // Login
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Should redirect to golf dashboard (not player-golf)
    await page.waitForURL('**/golf/dashboard**', { timeout: 10000 });
    await expect(page).toHaveURL(/\/golf\/dashboard$/);
  });
});
