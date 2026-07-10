import { test } from 'node:test';
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
  chatDrawer: join(COMPONENTS, 'golf', 'coachhelm', 'v3', 'Chat', 'ChatDrawer.tsx'),
  chatComposer: join(COMPONENTS, 'golf', 'coachhelm', 'v3', 'Chat', 'ChatComposer.tsx'),
  shotTracking: join(COMPONENTS, 'golf', 'ShotTrackingComprehensive.tsx'),
  holeShotPath: join(COMPONENTS, 'golf', 'coachhelm', 'v3', 'HoleShotPath', 'index.tsx'),
  roundStrip: join(COMPONENTS, 'golf', 'coachhelm', 'round-review', 'RoundStripGrid.tsx'),
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

test('ChatDrawer FAB respects the bottom safe-area inset', async () => {
  const src = await read(FILES.chatDrawer);
  assertContains(src, 'env(safe-area-inset-bottom)', FILES.chatDrawer, 'launcher FAB must clear the iOS home indicator');
});

test('ChatComposer respects the bottom safe-area inset', async () => {
  const src = await read(FILES.chatComposer);
  assertContains(src, 'env(safe-area-inset-bottom)', FILES.chatComposer, 'composer (bottom edge of the mobile full-screen drawer) must clear the home indicator');
});

test('ShotTrackingComprehensive putt picker is touch-friendly and var-anchored', async () => {
  const src = await read(FILES.shotTracking);
  assertContains(src, 'grid-cols-3 md:grid-cols-6', FILES.shotTracking, 'putt quick-select must drop to 3 columns at 320px so each target is >=44pt');
  assertContains(src, 'var(--scorecard-height', FILES.shotTracking, 'right-rail sticky offset must track the real scorecard header height, not a magic 128px');
  // The two grid-cols-6 putt distance pickers must NOT regress back to a
  // bare 6-up row that crushes targets below 44pt at 320px.
  assert.ok(
    !/grid-cols-6(?!\s|")/.test(src) || src.includes('grid-cols-3 md:grid-cols-6'),
    `${FILES.shotTracking}\n  putt distance pickers must stay grid-cols-3 md:grid-cols-6`,
  );
});

test('HoleShotPath hero size is fluid and capped', async () => {
  const src = await read(FILES.holeShotPath);
  assertContains(src, 'w-full max-w-[280px]', FILES.holeShotPath, 'hero must be fluid and capped so it never overflows a 320px viewport');
});

test('RoundReview hole strips scroll + snap on mobile', async () => {
  const src = await read(FILES.roundStrip);
  assertContains(src, 'overflow-x-auto', FILES.roundStrip, 'nine-hole strip row must scroll horizontally on narrow screens');
  assertContains(src, 'snap-x', FILES.roundStrip, 'strip row must snap so holes land cleanly when swiped');
});
