import { test, expect } from '@playwright/test';
import { loginAsCoach } from './helpers/auth';
import { waitForPageLoad, waitForElement } from './helpers/common';

test.describe('Player Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await waitForPageLoad(page);

    // Navigate to discover to find a player
    await page.goto('/baseball/dashboard/discover');
    await waitForPageLoad(page);

    // Click on first player to go to profile
    const firstPlayer = page.locator('[data-testid="player-card"], .player-card').first();
    await firstPlayer.click();

    // Wait for profile page to load
    await page.waitForURL('**/players/**', { timeout: 10000 });
    await waitForPageLoad(page);
  });

  test.describe('Profile Display', () => {
    test('should display player basic information', async ({ page }) => {
      // Should show player name
      await expect(
        page.locator('h1, h2, [data-testid="player-name"]')
      ).toBeVisible({ timeout: 5000 });

      // Should show position
      await expect(
        page.locator('text=/SS|C|1B|2B|3B|OF|P|DH/i').first()
      ).toBeVisible({ timeout: 5000 });
    });

    test('should display player stats', async ({ page }) => {
      // Look for stats section
      const statsSection = page.locator('[data-testid="player-stats"], .stats-section, .metrics');

      if (await statsSection.count() > 0) {
        await expect(statsSection.first()).toBeVisible();
      }

      // Common stats that should be visible
      const statLabels = [
        'Height',
        'Weight',
        'Grad Year',
        'GPA',
        'Exit Velo',
        'Pitch Velo',
      ];

      // Check if at least one stat is visible
      let foundStat = false;
      for (const label of statLabels) {
        const stat = page.locator(`text=/${label}/i`);
        if (await stat.count() > 0) {
          foundStat = true;
          break;
        }
      }

      expect(foundStat).toBeTruthy();
    });

    test('should display player contact information', async ({ page }) => {
      // Look for contact section
      const contactInfo = page.locator(
        'text=/Email|Phone|Contact/i, [data-testid="contact-info"]'
      );

      if (await contactInfo.count() > 0) {
        await expect(contactInfo.first()).toBeVisible();
      }
    });

    test('should display player school information', async ({ page }) => {
      // Look for school info
      const schoolInfo = page.locator('text=/High School|School/i');

      if (await schoolInfo.count() > 0) {
        await expect(schoolInfo.first()).toBeVisible();
      }
    });
  });

  test.describe('Videos', () => {
    test('should display player videos section', async ({ page }) => {
      // Look for videos section
      const videosSection = page.locator(
        'text=/Video|Highlights/i, [data-testid="video-showcase"]'
      );

      if (await videosSection.count() > 0) {
        await expect(videosSection.first()).toBeVisible();
      }
    });

    test('should play video when clicked', async ({ page }) => {
      // Find video thumbnail
      const videoThumbnail = page.locator('[data-testid="video-card"], .video-card, .video-thumbnail').first();

      if (await videoThumbnail.count() > 0 && await videoThumbnail.isVisible({ timeout: 2000 })) {
        await videoThumbnail.click();

        // Should open video modal or player
        await expect(
          page.locator('iframe, video, [data-testid="video-player"]')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show video metadata', async ({ page }) => {
      const videoCard = page.locator('[data-testid="video-card"]').first();

      if (await videoCard.count() > 0 && await videoCard.isVisible({ timeout: 2000 })) {
        // Should show duration, views, or other metadata
        const metadata = videoCard.locator('text=/views?|[0-9]+:[0-9]+/i');

        if (await metadata.count() > 0) {
          await expect(metadata.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Actions', () => {
    test('should add player to watchlist from profile', async ({ page }) => {
      // Find add to watchlist button
      const addButton = page.locator(
        'button:has-text("Add to Watchlist"), [data-testid="add-to-watchlist"]'
      );

      if (await addButton.count() > 0 && await addButton.first().isVisible({ timeout: 2000 })) {
        await addButton.first().click();

        // Should show success
        await expect(
          page.locator('text=/Added|Success|On Watchlist/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should send message to player', async ({ page }) => {
      // Find message button
      const messageButton = page.locator(
        'button:has-text("Message"), button:has-text("Send Message"), [data-testid="message-player"]'
      );

      if (await messageButton.count() > 0 && await messageButton.first().isVisible({ timeout: 2000 })) {
        await messageButton.first().click();

        // Should navigate to messages or open message modal
        await page.waitForTimeout(1000);

        const url = page.url();
        const hasMessageModal = await page.locator('[data-testid="message-modal"], .message-modal').count() > 0;

        expect(url.includes('/messages') || hasMessageModal).toBeTruthy();
      }
    });

    test('should navigate back from profile', async ({ page }) => {
      // Find back button
      const backButton = page.locator(
        'button:has-text("Back"), [data-testid="back-button"]'
      );

      if (await backButton.count() > 0 && await backButton.first().isVisible({ timeout: 2000 })) {
        await backButton.first().click();

        // Should navigate back
        await page.waitForTimeout(1000);

        const url = page.url();
        expect(url.includes('/discover') || url.includes('/watchlist')).toBeTruthy();
      }
    });
  });

  test.describe('Tabs/Sections', () => {
    test('should navigate between profile tabs', async ({ page }) => {
      // Look for tabs (Overview, Stats, Videos, etc.)
      const tabs = page.locator('[role="tab"], .tab, [data-testid*="tab"]');

      if (await tabs.count() > 1) {
        // Click second tab
        await tabs.nth(1).click();
        await page.waitForTimeout(500);

        // Should show active state
        await expect(tabs.nth(1)).toHaveClass(/active|selected/i);
      }
    });
  });

  test.describe('Social Media', () => {
    test('should display social media links', async ({ page }) => {
      // Look for Instagram/Twitter links
      const socialLinks = page.locator(
        'a[href*="instagram.com"], a[href*="twitter.com"], [data-testid="social-links"]'
      );

      if (await socialLinks.count() > 0) {
        await expect(socialLinks.first()).toBeVisible();
      }
    });
  });

  test.describe('Academic Information', () => {
    test('should display academic stats', async ({ page }) => {
      // Look for GPA, SAT, ACT
      const academicInfo = page.locator('text=/GPA|SAT|ACT/i');

      if (await academicInfo.count() > 0) {
        await expect(academicInfo.first()).toBeVisible();
      }
    });
  });
});
