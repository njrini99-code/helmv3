/**
 * Standalone WebKit + Chromium verification for the iOS itinerary-create flow.
 *
 * Usage (from the repo root):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 node scripts/verify-ios-itinerary-create.mjs
 *
 * Requirements:
 *   - Local dev server running (npm run dev)
 *   - Playwright + browsers installed (npx playwright install webkit chromium)
 *
 * What this does, per browser profile:
 *   1. Logs in as the Denison demo coach
 *   2. Navigates to /golf/dashboard/travel (skipping the post-login greeting
 *      animation page by navigating directly once the session is set)
 *   3. Sweeps any leftover "E2E TEST ITINERARY - DELETE ME" rows from prior
 *      failed runs (cleanup-first so reruns stay hermetic)
 *   4. Opens "Add itinerary", fills the form, submits
 *   5. Asserts the new itinerary appears in the trip list
 *   6. Deletes it through the UI and asserts it is gone
 *
 * Profiles:
 *   - iPhone 14 viewport + WebKit engine + ' HelmSportsLabsApp' UA suffix
 *     (matches the Capacitor iOS shell)
 *   - Desktop Chromium (web regression check)
 */

import { chromium, webkit, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const LOGIN_EMAIL = 'grogranl@denison.edu';
const LOGIN_PASSWORD = 'DenisonBigRed2026!';
const TEST_PREFIX = 'E2E TEST ITINERARY - DELETE ME';
const DEPARTURE_DATE = '2027-03-15'; // YYYY-MM-DD — iOS native picker format
const DESTINATION = 'E2E Test Destination';

/**
 * Delete the currently-selected trip via the detail-panel delete control.
 * Handles BOTH UIs:
 *   - Fairway: two-tap confirm on the same button
 *     ("Delete itinerary" → "Tap to confirm delete")
 *   - Legacy: trash IconButton (aria-label "Delete") → confirm modal with a
 *     "Delete" button
 */
async function deleteSelectedTrip(page, label) {
  // First tap. Anchored aria-label regex so the trip CARD (whose accessible
  // name contains "DELETE ME") can never match.
  const deleteButton = page
    .getByRole('button', { name: /^delete( itinerary)?$/i })
    .first();
  await deleteButton.waitFor({ timeout: 5_000 });
  await deleteButton.click();

  // Fairway second tap: the SAME button re-labels to "Tap to confirm delete".
  const fairwayConfirm = page.getByRole('button', { name: /tap to confirm/i }).first();
  if (await fairwayConfirm.isVisible().catch(() => false)) {
    await fairwayConfirm.click();
    console.log(`${label} Two-tap delete confirmed (Fairway).`);
    return;
  }

  // Legacy confirm modal: a "Delete" button next to "Cancel".
  const legacyConfirm = page.getByRole('button', { name: /^delete$/i }).last();
  if (await legacyConfirm.isVisible().catch(() => false)) {
    await legacyConfirm.click();
    console.log(`${label} Modal delete confirmed (legacy).`);
  }
}

/** Remove every trip whose name starts with TEST_PREFIX. Returns count removed. */
async function sweepTestTrips(page, label) {
  let removed = 0;
  for (let i = 0; i < 10; i++) {
    const card = page.locator(`text=${TEST_PREFIX}`).first();
    if (!(await card.isVisible().catch(() => false))) break;
    await card.click(); // select the trip → detail panel
    await page.waitForTimeout(400);
    await deleteSelectedTrip(page, label);
    // Wait for this card to disappear before checking for more.
    await page
      .waitForFunction(
        (prefix) => !document.body.innerText.includes(prefix),
        TEST_PREFIX,
        { timeout: 10_000 },
      )
      .catch(() => {});
    removed++;
  }
  if (removed > 0) console.log(`${label} Swept ${removed} leftover test trip(s).`);
  return removed;
}

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
  const testName = `${TEST_PREFIX} ${Date.now()}`;

  console.log(`\n${label} Starting…`);

  // ── Step 1: login ──────────────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/golf/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"], input[name="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');

  // Successful login routes through /golf/welcome?next=… (a ~4 s greeting
  // animation page) before landing on the dashboard. Do NOT navigate away
  // while on /golf/welcome: leaving mid-flight aborts its client-side
  // getUser() fetch, supabase returns user:null for the aborted call, and the
  // page fires router.replace('/golf/login') which clobbers our navigation.
  // Wait for the animation to settle on the dashboard instead.
  await page.waitForURL((url) => url.pathname.includes('/dashboard'), {
    timeout: 30_000,
  });
  console.log(`${label} Logged in. URL: ${page.url()}`);

  // ── Step 2: navigate to travel ─────────────────────────────────────────────
  await page.goto(`${BASE_URL}/golf/dashboard/travel`, { waitUntil: 'networkidle' });
  // If the session didn't stick we'd bounce back to /login — fail loudly.
  if (page.url().includes('/login')) {
    throw new Error('Session not established — redirected back to /golf/login');
  }
  console.log(`${label} On travel page.`);

  // ── Step 3: clean up any leftovers from previous failed runs ──────────────
  await sweepTestTrips(page, label);

  // ── Step 4: open "Add itinerary" modal ─────────────────────────────────────
  // Button label varies: "Add Itinerary" (legacy desktop), "Add" (legacy
  // mobile — long text hidden below sm), "Add itinerary" (Fairway), or
  // "Create First Itinerary" (legacy empty state).
  const addButton = page
    .getByRole('button', { name: /add itinerary|^add$|create first itinerary/i })
    .first();
  await addButton.waitFor({ timeout: 8_000 });
  await addButton.click();
  console.log(`${label} Opened create modal.`);

  // ── Step 5: fill the form ──────────────────────────────────────────────────
  // Event name. Fairway input has aria-label="Event name"; the legacy modal's
  // labels are NOT programmatically associated, so fall back to placeholder.
  let eventNameInput = page.getByLabel(/event name/i).first();
  if (!(await eventNameInput.isVisible().catch(() => false))) {
    eventNameInput = page.getByPlaceholder(/spring invitational|event name/i).first();
  }
  await eventNameInput.waitFor({ timeout: 5_000 });
  await eventNameInput.fill(testName);

  // Destination (same label-then-placeholder fallback)
  let destinationInput = page.getByLabel(/destination/i).first();
  if (!(await destinationInput.isVisible().catch(() => false))) {
    destinationInput = page.getByPlaceholder(/pebble beach/i).first();
  }
  await destinationInput.fill(DESTINATION);

  // Departure date — fill() with YYYY-MM-DD (iOS picker + Playwright format)
  const departureDateInput = page.locator('input[type="date"]').first();
  await departureDateInput.fill(DEPARTURE_DATE);
  const dateValue = await departureDateInput.inputValue();
  if (dateValue !== DEPARTURE_DATE) {
    console.warn(
      `${label} WARNING: departure date "${dateValue}" != "${DEPARTURE_DATE}" after fill — retrying with type()`,
    );
    await departureDateInput.click();
    await departureDateInput.press('Control+A');
    await departureDateInput.type(DEPARTURE_DATE);
  }

  // ── Step 6: submit ─────────────────────────────────────────────────────────
  const submitButton = page.getByRole('button', { name: /create itinerary/i });
  await submitButton.scrollIntoViewIfNeeded();
  await submitButton.click();
  console.log(`${label} Clicked "Create itinerary".`);

  // ── Step 7: assert the new row appears in the trip list ────────────────────
  await page.waitForFunction(
    (name) => document.body.innerText.includes(name),
    testName,
    { timeout: 15_000 },
  );
  console.log(`${label} ✓ CREATED — "${testName}" visible in trip list.`);

  // ── Step 8: delete it and assert it is gone ────────────────────────────────
  const tripCard = page.locator(`text="${testName}"`).first();
  await tripCard.click();
  await page.waitForTimeout(400);
  await deleteSelectedTrip(page, label);

  await page.waitForFunction(
    (name) => !document.body.innerText.includes(name),
    testName,
    { timeout: 15_000 },
  );
  console.log(`${label} ✓ DELETED — "${testName}" no longer present.`);

  // ── Step 9: reload and double-check the DB really has no test rows ────────
  await page.reload({ waitUntil: 'networkidle' });
  const leftover = await page
    .locator(`text=${TEST_PREFIX}`)
    .first()
    .isVisible()
    .catch(() => false);
  if (leftover) {
    // One more sweep, then re-verify.
    await sweepTestTrips(page, label);
    await page.reload({ waitUntil: 'networkidle' });
    const still = await page
      .locator(`text=${TEST_PREFIX}`)
      .first()
      .isVisible()
      .catch(() => false);
    if (still) throw new Error('Cleanup failed — test itinerary still present after sweep');
  }
  console.log(`${label} ✓ CLEAN — no test itineraries remain after reload.`);

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
    errors.push(`WebKit: ${(err.message ?? String(err)).split('\n')[0]}`);
  }

  // ── Run 2: Desktop Chromium (regression check) ────────────────────────────
  try {
    await runFlow(chromium, null, '');
    console.log('\n✅ Chromium / Desktop — PASSED\n');
  } catch (err) {
    console.error('\n❌ Chromium / Desktop — FAILED');
    console.error(err.message ?? err);
    errors.push(`Chromium: ${(err.message ?? String(err)).split('\n')[0]}`);
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
