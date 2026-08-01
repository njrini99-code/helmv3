// NOTE: this file previously imported `test` from `node:test`, which only runs
// under the `node --test` CLI. Nothing in package.json or CI ever invoked that
// runner, so this entire mobile touch-target suite silently never executed —
// which is how it kept asserting against a component that stopped rendering and
// a file that no longer exists, without anyone noticing. It now uses vitest
// (wired into the `unit` project in vitest.config.ts) so `npm test` runs it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for the W4-surface drawer / modal / shot-tracker
 * mobile responsiveness fixes.
 *
 * Background (ultra-audit master synthesis, mobile surface wave): on
 * short iOS / Capacitor viewports the GoalCreationModal
 * panels could push their action buttons off-screen with no scroll, the
 * ChatDrawer FAB + composer sat under the home indicator, the
 * ShotTrackingComprehensive putt quick-select packed six <44pt targets
 * into a 320px row, the right-rail sticky offset was a magic 128px that
 * drifted when the scorecard header reflowed, the HoleShotPath hero
 * overflowed a 320px screen, and the RoundReview hole strips clipped
 * past the card edge with no horizontal scroll.
 *
 * The fixes:
 *   - GoalCreationModal panel: `max-h-[90dvh]` +
 *     (IntentDrawer was deleted 2026-07-10 in the agent-legibility dead-code sweep)
 *     `overflow-y-auto` so the form scrolls within the dynamic viewport.
 *   - ChatDrawer FAB: bottom calc that adds `env(safe-area-inset-bottom)`.
 *   - ChatComposer: bottom padding adds `env(safe-area-inset-bottom)`.
 *   - ShotTrackingComprehensive: putt quick-select `grid-cols-3
 *     md:grid-cols-6` with `min-h-[44px]`; right-rail sticky `top` driven
 *     off `var(--scorecard-height)`.
 *   - HoleShotPath hero: `w-full max-w-[280px]`.
 *   - RoundStripGrid hole strips: `overflow-x-auto snap-x` on mobile.
 *
 * This test asserts the fixes are PRESENT (so a regression that strips
 * them out fails). It is purely a string-content scan — no DOM, no
 * browser, no Playwright — matching the repo's node:test convention
 * (see scripts/__tests__/no-vh-in-mobile-paths.test.mjs).
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const COMPONENTS = resolve(REPO_ROOT, 'src', 'components');

const FILES = {
  goalModal: join(COMPONENTS, 'golf', 'coachhelm', 'v3', 'GoalCreationModal', 'index.tsx'),
  // The chat was restructured out of `coachhelm/v3/Chat/` into `coachhelm/chat/`.
  // ChatComposer's successor is PromptComposer, which still owns the bottom edge
  // of the mobile full-screen drawer.
  promptComposer: join(COMPONENTS, 'golf', 'coachhelm', 'chat', 'PromptComposer.tsx'),
  // The LIVE shot-entry surface. Both round clients render FairwayShotTracking
  // (new-round-client.tsx:1841, continue-round-client.tsx:979); nothing renders
  // the legacy ShotTrackingComprehensive, which this test used to point at.
  shotEntry: join(COMPONENTS, 'fairway', 'pages', 'rounds-tracking', 'FairwayShotEntry.tsx'),
  editShotModal: join(COMPONENTS, 'fairway', 'pages', 'rounds-tracking', 'FairwayEditShotModal.tsx'),
  shotTrackingShell: join(COMPONENTS, 'fairway', 'pages', 'rounds-tracking', 'FairwayShotTracking.tsx'),
  holeShotPath: join(COMPONENTS, 'golf', 'coachhelm', 'v3', 'HoleShotPath', 'index.tsx'),
};

async function read(file) {
  const info = await stat(file).catch(() => null);
  assert.ok(info && info.isFile(), `Expected target file to exist: ${file}`);
  return readFile(file, 'utf8');
}

function assertContains(content, needle, file, why) {
  assert.ok(
    content.includes(needle),
    `${file}\n  Expected to find: ${JSON.stringify(needle)}\n  Reason: ${why}`,
  );
}

test('GoalCreationModal panel is dvh-capped and scrolls', async () => {
  const src = await read(FILES.goalModal);
  assertContains(src, 'max-h-[90dvh]', FILES.goalModal, 'panel must cap to 90% of the dynamic viewport on short screens');
  assertContains(src, 'overflow-y-auto', FILES.goalModal, 'panel content must scroll instead of pushing actions off-screen');
});

// REMOVED: 'ChatDrawer FAB respects the bottom safe-area inset'.
// It read a `v3/Chat/ChatDrawer.tsx` that no longer exists. The launcher FAB
// itself survives, at chat/CoachHelmDrawer.tsx:104 — but it is
// `hidden ... md:flex`, i.e. desktop-only. It never renders on a viewport that
// HAS a home indicator, so asserting a safe-area inset on it was the wrong
// guarantee even before the file moved. Its real constraint is desktop content
// clearance, which FairwayDashboardShell handles with `role === 'coach' &&
// 'md:pb-28'`. Not re-added here rather than re-added wrongly.

test('the chat composer clears the home indicator in the drawer variant', async () => {
  const src = await read(FILES.promptComposer);
  assertContains(
    src,
    'env(safe-area-inset-bottom)',
    FILES.promptComposer,
    'composer (bottom edge of the mobile full-screen drawer) must clear the home indicator',
  );
});

/**
 * These assertions used to run against `golf/ShotTrackingComprehensive.tsx`.
 * That component is no longer rendered anywhere — both round clients import and
 * render `FairwayShotTracking` instead — so the test was guarding dead code and
 * passing for the wrong reason, while the surface users actually touch was
 * unguarded.
 *
 * The live components DO satisfy the same rules today (checked when repointing),
 * so this is a coverage fix, not a bug fix. The point is that a future
 * regression in the rendered component now fails.
 *
 * Note the breakpoint differs between the two live files — `FairwayShotEntry`
 * uses `sm:grid-cols-6` and `FairwayEditShotModal` uses `md:grid-cols-6`. Both
 * are ≥44pt at 320px because both start at 3-up; pinning one literal string
 * would force a cosmetic rewrite of the other, so the assertion accepts either.
 */
const PUTT_GRID_3UP = /grid-cols-3\b[^"'`]*\b(sm|md):grid-cols-6/;

test('putt distance pickers stay 3-up on narrow screens (>=44pt targets)', async () => {
  for (const file of [FILES.shotEntry, FILES.editShotModal]) {
    const src = await read(file);
    assert.ok(
      PUTT_GRID_3UP.test(src),
      `${file}\n  putt quick-select must drop to 3 columns at 320px so each target is >=44pt\n` +
        '  (expected grid-cols-3 … sm|md:grid-cols-6)',
    );
    // Must not regress to a bare 6-up row, which crushes targets below 44pt.
    const bare6Up = /grid-cols-6/.test(src) && !PUTT_GRID_3UP.test(src);
    assert.ok(!bare6Up, `${file}\n  putt distance pickers must not become a bare 6-up row`);
  }
});

test('shot-tracking right rail is anchored to the real scorecard height', async () => {
  const src = await read(FILES.shotTrackingShell);
  assertContains(
    src,
    'var(--scorecard-height',
    FILES.shotTrackingShell,
    'right-rail sticky offset must track the real scorecard header height, not a magic 128px',
  );
});

test('HoleShotPath hero size is fluid and capped', async () => {
  const src = await read(FILES.holeShotPath);
  assertContains(src, 'w-full max-w-[280px]', FILES.holeShotPath, 'hero must be fluid and capped so it never overflows a 320px viewport');
});

// REMOVED: 'RoundReview hole strips scroll + snap on mobile'.
// It read src/components/golf/coachhelm/round-review/RoundStripGrid.tsx, which
// does not exist in main — so the suite would have failed on a missing file the
// moment anything ran it. The round-review UI was rebuilt around FilmstripReview,
// which reflows holes with a responsive grid + flex-wrap rather than a
// horizontally scrolling snap strip. That is a legitimate mobile answer, not a
// regression, so the assertion is obsolete rather than mis-pointed and inventing
// a replacement for a layout I have not studied would be worse than removing it.
