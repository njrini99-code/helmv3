import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for the W4-surface drawer / modal mobile responsiveness fixes.
 *
 * Background (ultra-audit master synthesis, mobile surface wave): on short iOS / Capacitor viewports a panel could push
 * its action buttons off-screen with no scroll. The fix moved panels onto the Fairway Sheet, which caps to the dynamic
 * viewport and scrolls its body.
 *
 * The other surfaces this file pinned (GoalCreationModal, the CoachHelm chat composer, Fairway's shot entry, edit-shot
 * modal and shot-tracking shell, HoleShotPath) were retired with Fairway on 2026-11-14; Clubhouse's round entry and
 * CoachHelm are their replacements. What stays is the primitive's own guarantee. A string-content scan: no DOM, no
 * browser.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SHEET = join(REPO_ROOT, 'src', 'components', 'fairway', 'overlays', 'Sheet.tsx');

async function read(file) {
  const info = await stat(file).catch(() => null);
  assert.ok(info && info.isFile(), `Expected target file to exist: ${file}`);
  return readFile(file, 'utf8');
}

function assertContains(content, needle, file, why) {
  assert.ok(content.includes(needle), `${file}\n  Expected to find: ${JSON.stringify(needle)}\n  Reason: ${why}`);
}

test('the Fairway Sheet caps to the dynamic viewport and its body scrolls', async () => {
  const sheet = await read(SHEET);
  assertContains(sheet, 'max-h-[calc(88dvh', SHEET, 'bottom sheet must cap to the dynamic viewport on short screens');
  assertContains(sheet, 'overflow-y-auto', SHEET, 'Sheet.Body must scroll instead of pushing actions off-screen');
});
