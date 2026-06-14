/**
 * Standalone WebKit + Chromium verification for the iOS itinerary-create flow.
 *
 * Usage (from the repo root):
 *   node scripts/verify-ios-itinerary-create.mjs
 *
 * Requirements:
 *   - Local dev server running on http://localhost:3000  (npm run dev)
 *   - Playwright + webkit browser installed
 *       npx playwright install webkit chromium
 *
 * What this does:
 *   1. Logs in as the Denison demo coach (grogranl@denison.edu)
 *   2. Navigates to /golf/dashboard/travel
 *   3. Opens "Add itinerary", fills out the form (date fields via keyboard
 *      since iOS WKWebView date pickers fire onChange only on commit)
 *   4. Submits and asserts the new itinerary row appears in the list
 *   5. Deletes the test itinerary through the UI
 *   6. Repeats steps 1-5 with the Chromium desktop profile
 *
 * Runs twice:
 *   - iPhone 14 viewport + WebKit engine + HelmSportsLabsApp UA suffix
 *   - Desktop Chrome viewport + Chromium engine
 */

import { chromium, webkit, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const LOGIN_EMAIL = 'grogranl@denison.edu';
const LOGIN_PASSWORD = 'DenisonBigRed2026!';
const TEST_ITINERARY_NAME = `E2E TEST ITINERARY - DELETE ME ${Date.now()}`;
const DEPARTURE_DATE = '2027-03-15'; // YYYY-MM-DD — iOS native picker format
const DESTINATION = 'E2E Test Destination';

async function runFlow(browserType, deviceDescriptor, uaSuffix = '') {
  const browser = await browserType.launch({ headless: true });
  const ctx = await browser.newContext({
    ...deviceDescriptor,
    userAgent: deviceDescriptor?.userAgent
      ? `${deviceDescriptor.userAgent} ${uaSuffix}`.trim()
      : uaSuffix || undefined,
  });
  const page = await ctx.newPage();

  const label = `[${browserType.name()} ${deviceDescriptor?.viewport ? `${deviceDescriptor.viewport.width}x${deviceDescriptor.viewport.height}` : 'desktop'}]`;

  console.log(`\n${label} Starting…`);

  // ── Step 1: login ──────────────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/golf/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"], input[name="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for dashboard redirect
  await page.waitForURL(
    (url) => url.pathname.includes('/dashboard') || url.pathname.includes('/golf/dashboard'),
    { timeout: 15_000 },
  );
  console.log(`${label} Logged in. URL: ${page.url()}`);

  // ── Step 2: navigate to travel ─────────────────────────────────────────────
  await page.goto(`${BASE_URL}/golf/dashboard/travel`, { waitUntil: 'networkidle' });
  console.log(`${label} On travel page.`);

  // ── Step 3: open "Add itinerary" modal ─────────────────────────────────────
  // The button label varies: "Add Itinerary" (legacy) or "Add itinerary" (Fairway)
  const addButton = page.getByRole('button', { name: /add itinerary/i });
  await addButton.waitFor({ timeout: 8_000 });
  await addButton.click();
  console.log(`${label} Opened create modal.`);

  // ── Step 4: fill the form ──────────────────────────────────────────────────
  // Event name
  const eventNameInput = page.getByLabel(/event name/i).first();
  await eventNameInput.waitFor({ timeout: 5_000 });
  await eventNameInput.fill(TEST_ITINERARY_NAME);

  // Destination
  const destinationInput = page.getByLabel(/destination/i).first();
  await destinationInput.fill(DESTINATION);

  // Departure date — use fill() with YYYY-MM-DD, which is the format iOS
  // date pickers and Playwright both accept for type="date" inputs.
  const departureDateInput = page.locator('input[type="date"]').first();
  await departureDateInput.fill(DEPARTURE_DATE);
  // Verify the value stuck (iOS WKWebView can silently clear on focus-out)
  const dateValue = await departureDateInput.inputValue();
  if (dateValue !== DEPARTURE_DATE) {
    console.warn(
      `${label} WARNING: departure date input value "${dateValue}" != "${DEPARTURE_DATE}" after fill — trying type()`,
    );
    await departureDateInput.click();
    await departureDateInput.press('Control+A');
    await departureDateInput.type(DEPARTURE_DATE);
  }

  // ── Step 5: submit ─────────────────────────────────────────────────────────
  // Scroll into view in case the submit button is behind the keyboard / safe area
  const submitButton = page.getByRole('button', { name: /create itinerary/i });
  await submitButton.scrollIntoViewIfNeeded();
  await submitButton.click();
  console.log(`${label} Clicked "Create itinerary".`);

  // ── Step 6: assert the new row appears in the trip list ────────────────────
  // Give the server action + router.refresh() up to 10 s
  await page.waitForFunction(
    (name) => document.body.innerText.includes(name),
    TEST_ITINERARY_NAME,
    { timeout: 10_000 },
  );
  console.log(`${label} ✓ Itinerary "${TEST_ITINERARY_NAME}" visible in list.`);

  // ── Step 7: click into the new itinerary, then delete it ──────────────────
  const tripCard = page.locator(`text="${TEST_ITINERARY_NAME}"`).first();
  await tripCard.click();

  // Wait for the detail panel to load
  await page.waitForTimeout(500);

  // Click the delete (trash) button
  const deleteButton = page.getByRole('button', { name: /delete/i }).first();
  await deleteButton.waitFor({ timeout: 5_000 });
  await deleteButton.click();

  // Handle confirmation dialog if present
  const confirmDeleteButton = page
    .getByRole('button', { name: /delete/i })
    .filter({ hasNotText: /cancel/i })
    .last();
  const confirmVisible = await confirmDeleteButton.isVisible().catch(() => false);
  if (confirmVisible) {
    await confirmDeleteButton.click();
  }

  // Verify the row is gone
  await page.waitForFunction(
    (name) => !document.body.innerText.includes(name),
    TEST_ITINERARY_NAME,
    { timeout: 10_000 },
  );
  console.log(`${label} ✓ Itinerary deleted — no test data remains.`);

  await ctx.close();
  await browser.close();
  return true;
}

async function main() {
  const errors = [];

  // ── Run 1: iOS WebKit with HelmSportsLabsApp UA ────────────────────────────
  const iphone = devices['iPhone 14'];
  try {
    await runFlow(webkit, iphone, 'HelmSportsLabsApp');
    console.log('\n✅ WebKit / iPhone 14 / HelmSportsLabsApp UA — PASSED\n');
  } catch (err) {
    console.error('\n❌ WebKit / iPhone 14 / HelmSportsLabsApp UA — FAILED');
    console.error(err.message ?? err);
    errors.push(`WebKit: ${err.message ?? err}`);
  }

  // ── Run 2: Desktop Chromium (regression check) ────────────────────────────
  try {
    await runFlow(chromium, null, '');
    console.log('\n✅ Chromium / Desktop — PASSED\n');
  } catch (err) {
    console.error('\n❌ Chromium / Desktop — FAILED');
    console.error(err.message ?? err);
    errors.push(`Chromium: ${err.message ?? err}`);
  }

  if (errors.length) {
    console.error('\n=== VERIFICATION FAILED ===');
    for (const e of errors) console.error(' •', e);
    process.exit(1);
  } else {
    console.log('=== ALL VERIFICATION CHECKS PASSED ===');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
