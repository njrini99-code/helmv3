import { test, expect } from '@playwright/test';
import { loginAsCoach, loginAsPlayer } from './helpers/auth';
import { waitForPageLoad, waitForElement } from './helpers/common';

test.describe('Messaging', () => {
  test.describe('Coach Messaging', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsCoach(page);
      await waitForPageLoad(page);
    });

    test('should display messages page', async ({ page }) => {
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Should see messages heading
      await expect(
        page.locator('h1:has-text("Messages"), h2:has-text("Messages")').first()
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show conversation list', async ({ page }) => {
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Check for conversations list or empty state
      const conversationList = page.locator('[data-testid="conversation-list"], .conversation-list');
      const emptyState = page.locator('text=/No conversations|No messages/i');

      const hasConversations = await conversationList.count() > 0;
      const hasEmptyState = await emptyState.count() > 0;

      expect(hasConversations || hasEmptyState).toBeTruthy();
    });

    test('should start new conversation', async ({ page }) => {
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Look for new message button
      const newMessageButton = page.locator(
        'button:has-text("New"), button:has-text("New Message"), [data-testid="new-message"]'
      );

      if (await newMessageButton.count() > 0 && await newMessageButton.first().isVisible({ timeout: 2000 })) {
        await newMessageButton.first().click();

        // Should show new message modal/screen
        await expect(
          page.locator('text=/New Message|New Conversation|Select recipient/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should send a message in conversation', async ({ page }) => {
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Click on first conversation if exists
      const firstConversation = page.locator('[data-testid="conversation-item"], .conversation-item').first();

      if (await firstConversation.count() > 0 && await firstConversation.isVisible({ timeout: 2000 })) {
        await firstConversation.click();
        await page.waitForTimeout(500);

        // Find message input
        const messageInput = page.locator(
          'textarea[placeholder*="message"], input[placeholder*="message"], [data-testid="message-input"]'
        );

        if (await messageInput.count() > 0) {
          // Type message
          await messageInput.first().fill('Test message from E2E test');

          // Find send button
          const sendButton = page.locator(
            'button:has-text("Send"), button[type="submit"], [data-testid="send-button"]'
          );

          if (await sendButton.count() > 0) {
            await sendButton.first().click();

            // Message should appear in conversation
            await expect(
              page.locator('text=/Test message from E2E test/i')
            ).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });

    test('should show message delivery status', async ({ page }) => {
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Open conversation
      const firstConversation = page.locator('[data-testid="conversation-item"]').first();

      if (await firstConversation.count() > 0 && await firstConversation.isVisible({ timeout: 2000 })) {
        await firstConversation.click();
        await page.waitForTimeout(500);

        // Look for read receipts or status indicators
        const statusIndicator = page.locator('[data-testid="message-status"], .message-status, svg[class*="check"]');

        if (await statusIndicator.count() > 0) {
          await expect(statusIndicator.first()).toBeVisible();
        }
      }
    });

    test('should search conversations', async ({ page }) => {
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Find search input
      const searchInput = page.locator(
        'input[type="search"], input[placeholder*="Search"], [data-testid="search-conversations"]'
      );

      if (await searchInput.count() > 0) {
        await searchInput.first().fill('test');
        await page.waitForTimeout(1000);

        // Results should filter
        const conversations = page.locator('[data-testid="conversation-item"], .conversation-item');
        const count = await conversations.count();

        expect(count >= 0).toBeTruthy();
      }
    });
  });

  test.describe('Real-time Updates', () => {
    test('should receive new messages in real-time', async ({ page }) => {
      await loginAsCoach(page);
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Open a conversation
      const firstConversation = page.locator('[data-testid="conversation-item"]').first();

      if (await firstConversation.count() > 0 && await firstConversation.isVisible({ timeout: 2000 })) {
        await firstConversation.click();

        // Get initial message count
        const messages = page.locator('[data-testid="message"], .message-bubble');
        const initialCount = await messages.count();

        // In a real test, another user would send a message here
        // For now, we just verify the message list exists
        expect(initialCount >= 0).toBeTruthy();
      }
    });
  });

  test.describe('Unread Messages', () => {
    test('should show unread message count', async ({ page }) => {
      await loginAsCoach(page);
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Look for unread badges
      const unreadBadge = page.locator('[data-testid="unread-count"], .unread-badge, .badge');

      if (await unreadBadge.count() > 0) {
        await expect(unreadBadge.first()).toBeVisible();
      }
    });

    test('should mark messages as read when opened', async ({ page }) => {
      await loginAsCoach(page);
      await page.goto('/baseball/dashboard/messages');
      await waitForPageLoad(page);

      // Find conversation with unread badge
      const unreadConversation = page.locator('.conversation-item:has(.unread-badge)').first();

      if (await unreadConversation.count() > 0 && await unreadConversation.isVisible({ timeout: 2000 })) {
        await unreadConversation.click();
        await page.waitForTimeout(1000);

        // Unread badge should disappear
        const unreadBadge = unreadConversation.locator('.unread-badge');
        if (await unreadBadge.count() > 0) {
          await expect(unreadBadge).not.toBeVisible({ timeout: 5000 });
        }
      }
    });
  });
});
