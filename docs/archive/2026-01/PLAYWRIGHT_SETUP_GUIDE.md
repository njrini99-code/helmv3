# Playwright Setup Guide for GolfHelm
**Purpose:** End-to-end testing with real browser automation
**Framework:** Next.js 16 + TypeScript + Supabase

---

## 1. Installation

```bash
# Install Playwright
npm install --save-dev @playwright/test

# Install browsers (Chromium, Firefox, WebKit)
npx playwright install

# Install browser dependencies (Linux only)
npx playwright install-deps
```

---

## 2. Configuration

### **playwright.config.ts** (Root directory)

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Timeout for each action
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile browsers
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    // Tablet
    {
      name: 'iPad',
      use: { ...devices['iPad Pro'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

---

### **tests/e2e/setup/auth.setup.ts** (Authentication helper)

```typescript
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../../.auth/coach.json');
const playerAuthFile = path.join(__dirname, '../../.auth/player.json');

// Coach authentication
setup('authenticate as coach', async ({ page }) => {
  // Navigate to login page
  await page.goto('/golf/login');

  // Fill in credentials
  await page.fill('input[name="email"]', process.env.TEST_COACH_EMAIL!);
  await page.fill('input[name="password"]', process.env.TEST_COACH_PASSWORD!);

  // Click login button
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard**');

  // Verify logged in
  await expect(page.locator('text=Calendar')).toBeVisible();

  // Save authentication state
  await page.context().storageState({ path: authFile });
});

// Player authentication
setup('authenticate as player', async ({ page }) => {
  await page.goto('/golf/login');

  await page.fill('input[name="email"]', process.env.TEST_PLAYER_EMAIL!);
  await page.fill('input[name="password"]', process.env.TEST_PLAYER_PASSWORD!);

  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard**');

  await page.context().storageState({ path: playerAuthFile });
});
```

---

### **.env.test** (Test environment variables)

```bash
# Test Database (use separate test database!)
DATABASE_URL=postgresql://postgres:password@localhost:54322/postgres

# Test Users
TEST_COACH_EMAIL=testcoach@testgolf.com
TEST_COACH_PASSWORD=TestPassword123!

TEST_PLAYER_EMAIL=testplayer@testgolf.com
TEST_PLAYER_PASSWORD=TestPassword123!

# Test Team
TEST_TEAM_ID=1c9ef80d-81bc-499b-8042-bc034b057230

# Base URL
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
```

---

### **.gitignore** (Add test artifacts)

```
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/
/tests/.auth/
```

---

## 3. Helper Functions

### **tests/e2e/utils/test-helpers.ts**

```typescript
import { Page, expect } from '@playwright/test';

/**
 * Wait for Supabase to be ready
 */
export async function waitForSupabase(page: Page) {
  await page.waitForFunction(() => {
    return window.supabase !== undefined;
  }, { timeout: 5000 });
}

/**
 * Login helper
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/golf/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**');
}

/**
 * Logout helper
 */
export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('text=Logout');
  await page.waitForURL('**/login');
}

/**
 * Create test event helper
 */
export async function createTestEvent(page: Page, eventData: {
  title: string;
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
}) {
  await page.goto('/golf/dashboard/calendar');

  // Click create event button
  await page.click('button:has-text("Create Event")');

  // Fill form
  await page.fill('input[name="title"]', eventData.title);
  await page.selectOption('select[name="eventType"]', eventData.type);
  await page.fill('input[name="startDate"]', eventData.date);
  await page.fill('input[name="startTime"]', eventData.startTime);
  await page.fill('input[name="endTime"]', eventData.endTime);

  if (eventData.location) {
    await page.fill('input[name="location"]', eventData.location);
  }

  // Submit
  await page.click('button[type="submit"]:has-text("Create")');

  // Wait for success
  await expect(page.locator('text=Event created')).toBeVisible({ timeout: 5000 });
}

/**
 * Delete all test events
 */
export async function cleanupTestEvents(page: Page) {
  await page.goto('/golf/dashboard/calendar');

  const testEvents = page.locator('[data-testid="event-card"]:has-text("Test")');
  const count = await testEvents.count();

  for (let i = 0; i < count; i++) {
    await testEvents.first().click();
    await page.click('button:has-text("Delete")');
    await page.click('button:has-text("Confirm")');
    await page.waitForTimeout(500);
  }
}

/**
 * Wait for calendar to load
 */
export async function waitForCalendarLoad(page: Page) {
  await page.waitForSelector('[data-testid="calendar-view"]', { state: 'visible' });
  await page.waitForLoadState('networkidle');
}
```

---

## 4. Sample Tests

### **tests/e2e/calendar/event-creation.spec.ts**

```typescript
import { test, expect } from '@playwright/test';
import { createTestEvent, waitForCalendarLoad } from '../utils/test-helpers';

test.describe('Event Creation', () => {
  test.use({ storageState: 'tests/.auth/coach.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/golf/dashboard/calendar');
    await waitForCalendarLoad(page);
  });

  test('should create basic event without RSVP', async ({ page }) => {
    // Click create event button
    await page.click('button:has-text("Create Event")');

    // Verify modal opened
    await expect(page.locator('text=Create Event')).toBeVisible();

    // Fill in event details
    await page.fill('input[name="title"]', 'Team Practice - E2E Test');
    await page.selectOption('select[name="eventType"]', 'practice');

    // Set date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    await page.fill('input[name="startDate"]', dateStr);
    await page.fill('input[name="startTime"]', '15:00');
    await page.fill('input[name="endTime"]', '17:00');
    await page.fill('input[name="location"]', 'West Field');

    // Make sure RSVP is NOT checked
    const rsvpCheckbox = page.locator('input[type="checkbox"]:near(:text("Require RSVP"))');
    if (await rsvpCheckbox.isChecked()) {
      await rsvpCheckbox.click();
    }

    // Submit form
    await page.click('button[type="submit"]:has-text("Create")');

    // Wait for success message
    await expect(page.locator('text=Event created')).toBeVisible({ timeout: 10000 });

    // Verify event appears on calendar
    await expect(page.locator('text=Team Practice - E2E Test')).toBeVisible();

    // Click event to verify details
    await page.click('text=Team Practice - E2E Test');

    await expect(page.locator('text=West Field')).toBeVisible();
    await expect(page.locator('text=3:00 PM')).toBeVisible(); // Start time formatted
  });

  test('should create event with RSVP enabled', async ({ page }) => {
    await page.click('button:has-text("Create Event")');

    await page.fill('input[name="title"]', 'Tournament - E2E Test');
    await page.selectOption('select[name="eventType"]', 'tournament');

    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const dateStr = fiveDaysFromNow.toISOString().split('T')[0];

    await page.fill('input[name="startDate"]', dateStr);
    await page.fill('input[name="startTime"]', '09:00');
    await page.fill('input[name="endTime"]', '15:00');

    // Enable RSVP
    await page.check('input[type="checkbox"]:near(:text("Require RSVP"))');

    // Verify RSVP fields appear
    await expect(page.locator('text=RSVP Deadline')).toBeVisible();
    await expect(page.locator('text=Max Attendees')).toBeVisible();

    // Set RSVP deadline
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const deadlineStr = `${twoDaysFromNow.toISOString().split('T')[0]}T23:59`;

    await page.fill('input[name="rsvpDeadline"]', deadlineStr);
    await page.fill('input[name="maxAttendees"]', '12');

    // Submit
    await page.click('button[type="submit"]:has-text("Create")');

    await expect(page.locator('text=Event created')).toBeVisible({ timeout: 10000 });

    // Verify RSVP badge/indicator
    await expect(page.locator('[data-testid="rsvp-indicator"]')).toBeVisible();
  });

  test('should show validation error for missing required fields', async ({ page }) => {
    await page.click('button:has-text("Create Event")');

    // Try to submit without filling anything
    await page.click('button[type="submit"]:has-text("Create")');

    // Should show validation errors
    await expect(page.locator('text=Title is required')).toBeVisible();
  });

  test('should cancel event creation', async ({ page }) => {
    await page.click('button:has-text("Create Event")');

    // Fill in some data
    await page.fill('input[name="title"]', 'Test Event');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Modal should close
    await expect(page.locator('text=Create Event')).not.toBeVisible();

    // Event should not be created
    await expect(page.locator('text=Test Event')).not.toBeVisible();
  });
});
```

---

### **tests/e2e/calendar/rsvp-flow.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test.describe('RSVP Flow', () => {
  let eventId: string;

  // Coach creates event with RSVP
  test.describe('Coach creates RSVP event', () => {
    test.use({ storageState: 'tests/.auth/coach.json' });

    test('coach creates event requiring RSVP', async ({ page }) => {
      await page.goto('/golf/dashboard/calendar');

      await page.click('button:has-text("Create Event")');

      await page.fill('input[name="title"]', 'RSVP Test Tournament');
      await page.selectOption('select[name="eventType"]', 'tournament');

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await page.fill('input[name="startDate"]', tomorrow.toISOString().split('T')[0]);
      await page.fill('input[name="startTime"]', '10:00');
      await page.fill('input[name="endTime"]', '14:00');

      // Enable RSVP
      await page.check('input[type="checkbox"]:near(:text("Require RSVP"))');

      // Set deadline to 6 hours from now
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 6);
      await page.fill('input[name="rsvpDeadline"]',
        `${deadline.toISOString().slice(0, 16)}`
      );

      await page.click('button[type="submit"]:has-text("Create")');

      await expect(page.locator('text=Event created')).toBeVisible();

      // Get event ID from URL or data attribute
      await page.click('text=RSVP Test Tournament');
      const url = page.url();
      eventId = url.split('/').pop() || '';
    });
  });

  // Player responds to RSVP
  test.describe('Player RSVP response', () => {
    test.use({ storageState: 'tests/.auth/player.json' });

    test('player accepts RSVP', async ({ page }) => {
      await page.goto('/golf/dashboard/calendar');

      // Find and click the event
      await page.click('text=RSVP Test Tournament');

      // Verify RSVP section visible
      await expect(page.locator('text=RSVP')).toBeVisible();

      // Click Accept button
      await page.click('button:has-text("Accept")');

      // Add optional note
      await page.fill('textarea[name="rsvp-note"]', 'Looking forward to it!');

      // Submit RSVP
      await page.click('button:has-text("Submit RSVP")');

      // Verify success
      await expect(page.locator('text=RSVP submitted')).toBeVisible();

      // Verify status shows as "Accepted"
      await expect(page.locator('text=Status: Accepted')).toBeVisible();
    });
  });

  // Coach views responses
  test.describe('Coach views RSVP responses', () => {
    test.use({ storageState: 'tests/.auth/coach.json' });

    test('coach sees player RSVP response', async ({ page }) => {
      await page.goto('/golf/dashboard/calendar');

      await page.click('text=RSVP Test Tournament');

      // Scroll to RSVP Status section
      await page.locator('text=RSVP Status').scrollIntoViewIfNeeded();

      // Verify RSVP count
      await expect(page.locator('text=1 Accepted')).toBeVisible();

      // Verify player name appears in accepted list
      await expect(page.locator('[data-testid="accepted-list"]')).toContainText('Test Player');

      // Verify player's note is visible
      await expect(page.locator('text=Looking forward to it!')).toBeVisible();
    });
  });
});
```

---

### **tests/e2e/calendar/availability-polling.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Availability Polling', () => {
  test.describe('Coach creates poll', () => {
    test.use({ storageState: 'tests/.auth/coach.json' });

    test('should create availability poll', async ({ page }) => {
      await page.goto('/golf/dashboard/calendar');

      // Click create poll button
      await page.click('button:has-text("Create Poll")');

      // Fill poll details
      await page.fill('input[name="title"]', 'Practice Time Poll - E2E');
      await page.fill('textarea[name="description"]', 'Vote for best practice time');
      await page.fill('input[name="duration"]', '120'); // 2 hours

      // Add date options
      await page.click('button:has-text("Add Date")');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await page.fill('input[name="date-option-0"]', tomorrow.toISOString().split('T')[0]);

      await page.click('button:has-text("Add Date")');
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      await page.fill('input[name="date-option-1"]', dayAfter.toISOString().split('T')[0]);

      // Add time options
      await page.click('button:has-text("Add Time")');
      await page.fill('input[name="time-option-0"]', '09:00');

      await page.click('button:has-text("Add Time")');
      await page.fill('input[name="time-option-1"]', '14:00');

      // Set deadline
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 12);
      await page.fill('input[name="deadline"]', deadline.toISOString().slice(0, 16));

      // Create poll
      await page.click('button[type="submit"]:has-text("Create Poll")');

      await expect(page.locator('text=Poll created')).toBeVisible();
    });
  });

  test.describe('Player responds to poll', () => {
    test.use({ storageState: 'tests/.auth/player.json' });

    test('should submit poll responses', async ({ page }) => {
      await page.goto('/golf/dashboard/calendar');

      // Find and open poll
      await page.click('text=Practice Time Poll - E2E');

      // Verify poll grid visible
      await expect(page.locator('[data-testid="poll-grid"]')).toBeVisible();

      // Mark availability for different time slots
      // Tomorrow 9AM - Available, High preference
      await page.click('[data-testid="slot-0-0-available"]');
      await page.selectOption('[data-testid="slot-0-0-preference"]', '5');

      // Tomorrow 2PM - Not available
      await page.click('[data-testid="slot-0-1-not-available"]');

      // Day after 9AM - Available, Medium preference
      await page.click('[data-testid="slot-1-0-available"]');
      await page.selectOption('[data-testid="slot-1-0-preference"]', '3');

      // Add note
      await page.fill('textarea[name="poll-notes"]', 'Prefer mornings');

      // Submit responses
      await page.click('button:has-text("Submit Responses")');

      await expect(page.locator('text=Responses submitted')).toBeVisible();
    });
  });

  test.describe('Coach views results', () => {
    test.use({ storageState: 'tests/.auth/coach.json' });

    test('should view poll results and schedule event', async ({ page }) => {
      await page.goto('/golf/dashboard/calendar');

      await page.click('text=Practice Time Poll - E2E');

      // View results
      await page.click('button:has-text("View Results")');

      // Verify results grid/heatmap
      await expect(page.locator('[data-testid="results-grid"]')).toBeVisible();

      // Verify availability percentages shown
      await expect(page.locator('text=%')).toBeVisible();

      // Check suggested best times
      await expect(page.locator('[data-testid="suggested-times"]')).toBeVisible();

      // Select best time and create event
      await page.click('[data-testid="select-best-time-0"]');
      await page.click('button:has-text("Create Event")');

      // Verify event creation modal opens with pre-filled data
      await expect(page.locator('input[name="title"]')).toHaveValue(/Practice Time Poll/);

      await page.click('button:has-text("Confirm")');

      await expect(page.locator('text=Event created from poll')).toBeVisible();
    });
  });
});
```

---

### **tests/e2e/auth/login.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login as coach successfully', async ({ page }) => {
    await page.goto('/golf/login');

    await page.fill('input[name="email"]', process.env.TEST_COACH_EMAIL!);
    await page.fill('input[name="password"]', process.env.TEST_COACH_PASSWORD!);

    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL('**/dashboard**');

    // Should see coach-specific navigation
    await expect(page.locator('text=Calendar')).toBeVisible();
    await expect(page.locator('text=Roster')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/golf/login');

    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/golf/login');
    await page.fill('input[name="email"]', process.env.TEST_COACH_EMAIL!);
    await page.fill('input[name="password"]', process.env.TEST_COACH_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**');

    // Click user menu
    await page.click('[data-testid="user-menu"]');

    // Click logout
    await page.click('text=Logout');

    // Should redirect to login
    await page.waitForURL('**/login');

    // Should not be able to access dashboard
    await page.goto('/golf/dashboard/calendar');
    await page.waitForURL('**/login');
  });
});
```

---

## 5. Running Tests

### **package.json** (Add scripts)

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report",
    "test:e2e:codegen": "playwright codegen http://localhost:3000"
  }
}
```

### **Run Commands**

```bash
# Run all tests (headless)
npm run test:e2e

# Run tests with UI mode (recommended for development)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Debug specific test
npm run test:e2e:debug tests/e2e/calendar/event-creation.spec.ts

# Generate test code interactively
npm run test:e2e:codegen

# View test report
npm run test:e2e:report

# Run specific test file
npx playwright test tests/e2e/calendar/event-creation.spec.ts

# Run tests in specific browser
npx playwright test --project=chromium

# Run tests with specific tag
npx playwright test --grep @smoke
```

---

## 6. CI/CD Integration

### **GitHub Actions** (.github/workflows/playwright.yml)

```yaml
name: Playwright Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run Playwright tests
        run: npm run test:e2e
        env:
          TEST_COACH_EMAIL: ${{ secrets.TEST_COACH_EMAIL }}
          TEST_COACH_PASSWORD: ${{ secrets.TEST_COACH_PASSWORD }}
          TEST_PLAYER_EMAIL: ${{ secrets.TEST_PLAYER_EMAIL }}
          TEST_PLAYER_PASSWORD: ${{ secrets.TEST_PLAYER_PASSWORD }}

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## 7. Best Practices

### ✅ DO:
- ✅ Use data-testid attributes for reliable selectors
- ✅ Create helper functions for common actions
- ✅ Clean up test data after each test
- ✅ Use separate test database
- ✅ Mock external APIs when possible
- ✅ Take screenshots on failure
- ✅ Use page object model for complex pages

### ❌ DON'T:
- ❌ Test against production database
- ❌ Use fragile selectors (nth-child, etc.)
- ❌ Make tests depend on each other
- ❌ Hardcode test data
- ❌ Skip error handling
- ❌ Ignore flaky tests

---

## 8. Debugging Tests

### **Visual Debugging**

```bash
# Run with UI mode (best for debugging)
npx playwright test --ui

# Run with browser visible
npx playwright test --headed

# Debug mode (step through)
npx playwright test --debug

# Specific test with debug
npx playwright test tests/e2e/calendar/event-creation.spec.ts:10 --debug
```

### **Trace Viewer**

```bash
# Run test with trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

### **Add Debug Points in Tests**

```typescript
test('my test', async ({ page }) => {
  await page.goto('/calendar');

  // Pause execution
  await page.pause();

  // Continue test...
});
```

---

## 9. Advanced Features

### **Page Object Model**

```typescript
// tests/e2e/pages/CalendarPage.ts
import { Page, Locator } from '@playwright/test';

export class CalendarPage {
  readonly page: Page;
  readonly createEventButton: Locator;
  readonly eventModal: Locator;
  readonly titleInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createEventButton = page.locator('button:has-text("Create Event")');
    this.eventModal = page.locator('[data-testid="event-modal"]');
    this.titleInput = page.locator('input[name="title"]');
  }

  async goto() {
    await this.page.goto('/golf/dashboard/calendar');
  }

  async createEvent(data: { title: string; type: string; date: string }) {
    await this.createEventButton.click();
    await this.titleInput.fill(data.title);
    await this.page.selectOption('select[name="eventType"]', data.type);
    await this.page.fill('input[name="startDate"]', data.date);
    await this.page.click('button[type="submit"]:has-text("Create")');
  }
}

// Usage in test
import { CalendarPage } from './pages/CalendarPage';

test('create event', async ({ page }) => {
  const calendarPage = new CalendarPage(page);
  await calendarPage.goto();
  await calendarPage.createEvent({
    title: 'Test Event',
    type: 'practice',
    date: '2026-01-10',
  });
});
```

---

### **Visual Regression Testing**

```typescript
test('calendar should match snapshot', async ({ page }) => {
  await page.goto('/golf/dashboard/calendar');
  await expect(page).toHaveScreenshot('calendar.png');
});
```

---

### **API Testing with Playwright**

```typescript
test('should create event via API', async ({ request }) => {
  const response = await request.post('/api/golf/events', {
    data: {
      title: 'API Test Event',
      team_id: process.env.TEST_TEAM_ID,
      event_type: 'practice',
      start_date: '2026-01-10',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.success).toBe(true);
});
```

---

## 10. Test Data Management

### **Fixtures**

```typescript
// tests/e2e/fixtures/test-data.ts
export const testEvents = {
  practice: {
    title: 'Test Practice',
    type: 'practice',
    date: '2026-01-10',
    startTime: '15:00',
    endTime: '17:00',
  },
  tournament: {
    title: 'Test Tournament',
    type: 'tournament',
    date: '2026-01-15',
    startTime: '09:00',
    endTime: '15:00',
    requiresRsvp: true,
  },
};

export const testUsers = {
  coach: {
    email: process.env.TEST_COACH_EMAIL!,
    password: process.env.TEST_COACH_PASSWORD!,
  },
  player: {
    email: process.env.TEST_PLAYER_EMAIL!,
    password: process.env.TEST_PLAYER_PASSWORD!,
  },
};
```

---

## 11. Performance Testing

```typescript
test('calendar page should load quickly', async ({ page }) => {
  const startTime = Date.now();

  await page.goto('/golf/dashboard/calendar');
  await page.waitForLoadState('networkidle');

  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(3000); // Under 3 seconds
});
```

---

**Setup Time:** ~45 minutes
**Difficulty:** Medium
**Value:** Very High - Automated testing prevents regressions

Your calendar system is now fully testable with Playwright! 🎭