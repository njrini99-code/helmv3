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
 *   2. The signup "Create your account" subtitle is the new "You're in. Let's
 *      set up your team." line and the old "Start tracking your golf journey"
 *      line is gone.
 *   3. The signup page reuses CoastalScene + CourseScene (the login scenes) and
 *      no longer hand-rolls the floating-orb field or the 60px grid overlay.
 *   4. The signup forms / submit handlers / validation are preserved (the
 *      access-code gate form + GolfSignUpForm + validateAccessCode are intact).
 *
 * Allowlist (ALLOWLIST RULE): none required here — every asserted string is a
 * plain JSX text node with no CSS-var / canvas / email-HTML constraint.
 *
 * Run via: node --test scripts/__tests__/footer-auth-copy.test.mjs
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const FOOTER_FILE = join(REPO_ROOT, 'src', 'components', 'landing', 'Footer.tsx');
const SIGNUP_FILE = join(REPO_ROOT, 'src', 'app', 'golf', '(auth)', 'signup', 'page.tsx');

// New, on-voice strings that MUST be present.
const NEW_FOOTER_BRAND_LINE =
  'The coaching intelligence layer for college golf — strokes-gained, qualifiers, and the conversations that matter.';
const NEW_SIGNUP_SUBTITLE = "You're in. Let's set up your team.";

// Old strings that MUST be gone (regression markers). The signup subtitle is
// authored with HTML entities (&apos;) in source, so the banned form is the
// plain prose only — the new line never contains "golf journey".
const OLD_FOOTER_BRAND_LINE = 'Premium tools for coaches who care about performance and clarity.';
const OLD_SIGNUP_SUBTITLE = 'Start tracking your golf journey';

// Decorative patterns the access-code gate + signup surface must NOT reintroduce.
const BANNED_ORB_CLASS = /\bauth-orb\b/;
const BANNED_ORB_COMMENT = /Animated floating orbs/;
const BANNED_GRID_COMMENT = /Grid pattern overlay/;
const BANNED_GRID_SIZE = /backgroundSize:\s*'60px 60px'/;

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

test('signup subtitle is the new "You\'re in…" line, not the old journey copy', async () => {
  assert.ok(await exists(SIGNUP_FILE), `Expected signup page at ${SIGNUP_FILE}`);
  const src = decodeApos(await readFile(SIGNUP_FILE, 'utf8'));

  assert.ok(
    src.includes(NEW_SIGNUP_SUBTITLE),
    'Signup must render the new subtitle:\n' + NEW_SIGNUP_SUBTITLE,
  );
  assert.ok(
    !src.includes(OLD_SIGNUP_SUBTITLE),
    'Signup still contains the OLD subtitle (regression): ' + OLD_SIGNUP_SUBTITLE,
  );
});

test('signup reuses the login scenes and drops the orb field + 60px grid', async () => {
  const src = await readFile(SIGNUP_FILE, 'utf8');

  // Reuses the canonical login scenes…
  assert.match(
    src,
    /from\s+['"]@\/components\/golf\/scenes\/CoastalScene['"]/,
    'Signup must import CoastalScene from the canonical scenes module',
  );
  assert.match(
    src,
    /from\s+['"]@\/components\/golf\/scenes\/CourseScene['"]/,
    'Signup must import CourseScene from the canonical scenes module',
  );
  assert.match(src, /<CoastalScene\b/, 'Signup must render <CoastalScene>');
  assert.match(src, /<CourseScene\b/, 'Signup must render <CourseScene>');

  // …and no longer hand-rolls the floating-orb field or the 60px grid.
  // Strip block comments so the explanatory comment that *names* the dropped
  // system isn't a false positive.
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(
    !BANNED_ORB_CLASS.test(noBlockComments),
    'Signup still references an `auth-orb` element (the dropped orb field)',
  );
  assert.ok(
    !BANNED_ORB_COMMENT.test(noBlockComments),
    'Signup still labels an "Animated floating orbs" block',
  );
  assert.ok(
    !BANNED_GRID_COMMENT.test(noBlockComments),
    'Signup still labels a "Grid pattern overlay" block',
  );
  assert.ok(
    !BANNED_GRID_SIZE.test(noBlockComments),
    "Signup still paints the 60px grid overlay (backgroundSize: '60px 60px')",
  );
});

test('signup auth functionality is preserved (forms, submit, validation)', async () => {
  const src = await readFile(SIGNUP_FILE, 'utf8');

  // Access-code gate form: onSubmit handler + validation call intact.
  assert.match(src, /onSubmit=\{handleCodeSubmit\}/, 'Access-code <form> onSubmit handler must remain');
  assert.match(src, /async function handleCodeSubmit/, 'handleCodeSubmit handler must remain');
  assert.match(src, /validateAccessCode\(/, 'Access-code validation call must remain');
  assert.match(src, /type="submit"/, 'The gate submit button must remain');

  // Account-creation form + its returnTo-aware sign-in link.
  assert.match(src, /<GolfSignUpForm\b/, 'GolfSignUpForm must still render');
  assert.match(src, /joinCode=\{joinCode\}/, 'GolfSignUpForm must still receive the joinCode prop');
  assert.match(src, /<SignInLink\b/, 'The returnTo-preserving SignInLink must remain');
});
