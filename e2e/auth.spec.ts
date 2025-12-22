import { test, expect } from '@playwright/test';
import { loginAsCoach, loginAsPlayer, logout, TEST_USERS } from './helpers/auth';
import { waitForPageLoad, waitForElement } from './helpers/common';

test.describe('Authentication', () => {
  test.describe('Login', () => {
    test('should successfully log in as a coach', async ({ page }) => {
      await page.goto('/baseball/login');

      // Fill in credentials
      await page.fill('input[name="email"]', TEST_USERS.coach.email);
      await page.fill('input[name="password"]', TEST_USERS.coach.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await page.waitForURL('**/dashboard/**', { timeout: 10000 });

      // Verify we're on the dashboard
      expect(page.url()).toContain('/dashboard');

      // Verify user is logged in (check for user menu or profile element)
      await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 5000 });
    });

    test('should successfully log in as a player', async ({ page }) => {
      await page.goto('/baseball/login');

      // Fill in credentials
      await page.fill('input[name="email"]', TEST_USERS.player.email);
      await page.fill('input[name="password"]', TEST_USERS.player.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await page.waitForURL('**/dashboard/**', { timeout: 10000 });

      // Verify we're on the dashboard
      expect(page.url()).toContain('/dashboard');
    });

    test('should show error with invalid credentials', async ({ page }) => {
      await page.goto('/baseball/login');

      // Fill in invalid credentials
      await page.fill('input[name="email"]', 'invalid@email.com');
      await page.fill('input[name="password"]', 'wrongpassword');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(
        page.locator('text=/Invalid credentials|Invalid email|Login failed/i')
      ).toBeVisible({ timeout: 5000 });

      // Should still be on login page
      expect(page.url()).toContain('/login');
    });

    test('should show validation error for empty email', async ({ page }) => {
      await page.goto('/baseball/login');

      // Leave email empty, fill password
      await page.fill('input[name="password"]', 'somepassword');

      // Try to submit
      await page.click('button[type="submit"]');

      // Should show validation error (either HTML5 or custom)
      const emailInput = page.locator('input[name="email"]');
      const validationMessage = await emailInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage
      );

      // Either HTML5 validation or visible error message
      expect(
        validationMessage.length > 0 ||
          (await page.locator('text=/email.*required/i').isVisible())
      ).toBeTruthy();
    });
  });

  test.describe('Logout', () => {
    test('should successfully log out', async ({ page }) => {
      // Login first
      await loginAsCoach(page);
      await waitForPageLoad(page);

      // Click user menu (adjust selector based on your UI)
      const userMenuSelectors = [
        '[data-testid="user-menu"]',
        'button[aria-label="User menu"]',
        'button:has-text("Profile")',
        'button:has-text("Settings")',
      ];

      let menuOpened = false;
      for (const selector of userMenuSelectors) {
        try {
          await page.click(selector, { timeout: 2000 });
          menuOpened = true;
          break;
        } catch {
          continue;
        }
      }

      if (!menuOpened) {
        console.warn('Could not find user menu button');
      }

      // Click logout button
      const logoutSelectors = [
        '[data-testid="logout-button"]',
        'button:has-text("Logout")',
        'button:has-text("Sign out")',
        'text=Logout',
        'text=Sign out',
      ];

      let loggedOut = false;
      for (const selector of logoutSelectors) {
        try {
          await page.click(selector, { timeout: 2000 });
          loggedOut = true;
          break;
        } catch {
          continue;
        }
      }

      if (!loggedOut) {
        console.warn('Could not find logout button');
      }

      // Should redirect to login page
      await page.waitForURL('**/login', { timeout: 10000 });
      expect(page.url()).toContain('/login');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing protected route while logged out', async ({
      page,
    }) => {
      // Try to access dashboard directly
      await page.goto('/baseball/dashboard');

      // Should redirect to login
      await page.waitForURL('**/login', { timeout: 10000 });
      expect(page.url()).toContain('/login');
    });

    test('should allow access to protected routes when logged in', async ({ page }) => {
      // Login
      await loginAsCoach(page);

      // Try to access various protected routes
      await page.goto('/baseball/dashboard/discover');
      expect(page.url()).toContain('/discover');

      await page.goto('/baseball/dashboard/watchlist');
      expect(page.url()).toContain('/watchlist');

      // Should not redirect to login
      expect(page.url()).not.toContain('/login');
    });
  });

  test.describe('Session Persistence', () => {
    test('should maintain session across page reloads', async ({ page }) => {
      // Login
      await loginAsCoach(page);
      await waitForPageLoad(page);

      // Get current URL
      const dashboardUrl = page.url();

      // Reload page
      await page.reload();
      await waitForPageLoad(page);

      // Should still be on dashboard (not redirected to login)
      expect(page.url()).toBe(dashboardUrl);
      expect(page.url()).toContain('/dashboard');
      expect(page.url()).not.toContain('/login');
    });
  });
});
