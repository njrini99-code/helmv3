import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W6-copy (agent footer-auth).
 *
 * The 2026-05-28 ultra-audit master synthesis flagged the marketing footer and
 * the golf auth surface as carrying stale, off-voice brand copy and a dated
 * "floating orb + 60px grid" decorative system that drifted from the painterly
 * scene treatment already shipped on the login page. W6C re-voiced the copy and
 * re-pointed the signup surface at the canonical CoastalScene / CourseScene.
 *
 * This test re-asserts that contract so the copy + scene reuse cannot silently
 * regress:
 *
 *   1. The footer brand line is the new coaching-intelligence sentence and the
 *      old "Premium tools…" line is gone.
 *
 * Its signup cases (2 to 4) went with the old golf signup page when the
 * entrance pages were retired (2026-11-14); Clubhouse's sign-up replaced it.
 *
 * Allowlist (ALLOWLIST RULE): none required here — every asserted string is a
 * plain JSX text node with no CSS-var / canvas / email-HTML constraint.
 *
 * Run via: node --test scripts/__tests__/footer-auth-copy.test.mjs
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const FOOTER_FILE = join(REPO_ROOT, 'src', 'components', 'landing', 'Footer.tsx');

// New, on-voice strings that MUST be present.
const NEW_FOOTER_BRAND_LINE =
  'The coaching intelligence layer for college golf — strokes-gained, qualifiers, and the conversations that matter.';

// Old strings that MUST be gone (regression markers). The signup subtitle is
// authored with HTML entities (&apos;) in source, so the banned form is the
// plain prose only — the new line never contains "golf journey".
const OLD_FOOTER_BRAND_LINE = 'Premium tools for coaches who care about performance and clarity.';

/**
 * The new subtitle uses JSX HTML entities for the apostrophes so React renders
 * a single string. Normalise &apos; / &#39; / &rsquo; back to a plain
 * apostrophe before asserting the human-readable copy is present.
 */
function decodeApos(src) {
  return src
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('footer carries the new coaching-intelligence brand line, not the old one', async () => {
  assert.ok(await exists(FOOTER_FILE), `Expected footer at ${FOOTER_FILE}`);
  const src = decodeApos(await readFile(FOOTER_FILE, 'utf8'));

  assert.ok(
    src.includes(NEW_FOOTER_BRAND_LINE),
    'Footer must render the new brand line:\n' + NEW_FOOTER_BRAND_LINE,
  );
  assert.ok(
    !src.includes(OLD_FOOTER_BRAND_LINE),
    'Footer still contains the OLD brand line (regression): ' + OLD_FOOTER_BRAND_LINE,
  );
});
