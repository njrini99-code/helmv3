// Regression test for the W3A reduced-motion accessibility sweep (2026-05-28).
//
// Background: the ultra-audit master synthesis (A6 a11y + A7 motion-polish)
// found that the product imported framer-motion in ~190 product files but only
// a handful honored the user's `prefers-reduced-motion` preference. Reduced-
// motion users were subjected to the full cinematic motion language — looping
// shimmers, spring overshoots, staggered entrances, confetti — which is a WCAG
// 2.3.3 (Animation from Interactions) failure and, for vestibular-sensitive
// users, an accessibility harm.
//
// W3A added `useReducedMotion()` handling to every product file that animates
// via framer-motion, gating the motion props so reduced-motion users get the
// static / instant variant while preserving every animation for normal users.
//
// This test re-asserts that contract so the gap can never silently reopen:
//   - It parses every `src` file that imports framer-motion.
//   - It strips comments (so a `<m.div>` example in a doc-comment is not
//     mistaken for a real animation).
//   - If the file ANIMATES (renders a motion element or uses a motion hook /
//     animation prop) it MUST honor reduced motion — either by referencing
//     `useReducedMotion` (the framer-motion hook, the canonical mechanism) or
//     by reading the `prefers-reduced-motion` media query directly
//     (matchMedia, used by the pre-hydration splash).
//   - Files that import framer-motion but do NOT animate (type-only imports,
//     the LazyMotion/MotionConfig provider shells) are exempt.
//
// If you add a new framer-motion component that animates without honoring
// reduced motion, this test fails the PR. Fix it by gating the motion props:
//
//   const prefersReducedMotion = useReducedMotion();
//   <m.div
//     initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
//     animate={{ opacity: 1, y: 0 }}
//     transition={prefersReducedMotion ? { duration: 0 } : enterTransition}
//   />
//
// or by reaching for one of the reduced-motion-aware primitives in
// `src/lib/coachhelm/v3/motion.ts` (shimmer / celebration / successCheckmark /
// pulseDots / collapse), each of which takes the `reduce` flag.
//
// Run via: node --test scripts/__tests__/motion-reduced-motion-coverage.test.mjs

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const srcRoot = resolve(repoRoot, 'src');

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function relativize(p) {
  return p.slice(repoRoot.length + 1);
}

// Test files have their own motion assertions and are not shipped UI, so they
// are not subject to the reduced-motion contract.
const isTestFile = (rel) =>
  /(^|\/)__tests__\//.test(rel) || /(^|\/)test\//.test(rel) || /\.test\.tsx?$/.test(rel);

// ---------------------------------------------------------------------------
// Source analysis
// ---------------------------------------------------------------------------

// Strip block + line comments so doc-comment examples (e.g. a `<m.div>` shown
// in a JSDoc block) don't register as real animation usage. We intentionally
// keep string + template literals — those are real code surface.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// A file "animates" if, after comment-stripping, it renders a framer-motion
// element or uses an animation prop / motion hook. `MotionConfig` /
// `LazyMotion` provider shells that only set up the feature bundle are NOT
// animation usage.
const ANIMATION_SIGNALS = [
  /<motion\./,
  /<m\./,
  /\binitial=/,
  /\banimate=/,
  /\bwhileHover=/,
  /\bwhileTap=/,
  /\bwhileInView=/,
  /\bwhileDrag=/,
  /\bwhileFocus=/,
  /\bexit=/,
  /\bdrag=/,
  /\bdragConstraints\b/,
  /\buseAnimation\b/,
  /\buseAnimate\b/,
  /\buseScroll\b/,
  /\buseTransform\b/,
  /\buseSpring\b/,
  /\buseMotionValue\b/,
  /\buseInView\b/,
];

function animates(strippedSrc) {
  return ANIMATION_SIGNALS.some((re) => re.test(strippedSrc));
}

// A file "honors" reduced motion if it references the framer-motion
// `useReducedMotion` hook (the canonical mechanism, including the
// `useReducedMotionGuard` wrapper which calls it) OR reads the
// `prefers-reduced-motion` media query directly.
//
// A file also honors reduced motion by DELEGATING to a hook that does the
// gating for it. That indirection is invisible to a regex, so each delegate is
// named here together with the module that defines it, and the test below
// re-verifies that module still honors reduced motion itself. If someone
// strips the guard out of the delegate, this stops being an exemption and the
// suite fails — unlike an allowlist, it cannot rot into a silent pass.
const SAFE_DELEGATES = new Map([
  ['useRouteRevealMotion', 'src/lib/motion/route-motion.ts'],
]);

function honorsReducedMotion(rawSrc) {
  if (/useReducedMotion/.test(rawSrc) || /prefers-reduced-motion/.test(rawSrc)) return true;
  for (const hook of SAFE_DELEGATES.keys()) {
    if (new RegExp(`\\b${hook}\\b`).test(rawSrc)) return true;
  }
  return false;
}

// A file whose ONLY framer-motion import is provider/feature plumbing does not
// animate, whatever an `animate=` prop on some unrelated component suggests.
const PROVIDER_ONLY_IMPORTS = new Set(['LazyMotion', 'MotionConfig', 'domAnimation', 'domMax']);

function isProviderShell(rawSrc) {
  const specifiers = [];
  for (const m of rawSrc.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"]framer-motion['"]/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name) specifiers.push(name);
    }
  }
  return specifiers.length > 0 && specifiers.every((n) => PROVIDER_ONLY_IMPORTS.has(n));
}

function importsFramerMotion(rawSrc) {
  return /from\s+['"]framer-motion['"]/.test(rawSrc);
}

// ---------------------------------------------------------------------------
// Allowlist — framer-motion files that animate-by-signal but are exempt.
//
// Keep this TIGHT and justified. Every entry must be a file whose animation is
// genuinely reduced-motion-safe by a mechanism this test can't statically see
// (there are none today). Adding a file here to silence the test instead of
// gating its motion is a REGRESSION.
// ---------------------------------------------------------------------------
const ALLOWLIST = new Set([
  // (no current exceptions — every animating file honors reduced motion)
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('every framer-motion file that animates honors prefers-reduced-motion', () => {
  const files = walk(srcRoot).map(relativize);
  const framerFiles = files.filter((rel) => {
    if (isTestFile(rel)) return false;
    return importsFramerMotion(readFileSync(resolve(repoRoot, rel), 'utf8'));
  });

  assert.ok(
    framerFiles.length > 50,
    `expected to find many framer-motion files in src/ (found ${framerFiles.length}); ` +
      'the discovery walk may be broken',
  );

  const offenders = [];
  for (const rel of framerFiles) {
    if (ALLOWLIST.has(rel)) continue;
    const raw = readFileSync(resolve(repoRoot, rel), 'utf8');
    const stripped = stripComments(raw);
    if (isProviderShell(raw)) continue;
    if (animates(stripped) && !honorsReducedMotion(raw)) {
      offenders.push(rel);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'These framer-motion files animate but do NOT honor prefers-reduced-motion ' +
      '(reference useReducedMotion or read the prefers-reduced-motion media query). ' +
      'Gate the motion props so reduced-motion users get the static/instant variant:\n  - ' +
      offenders.join('\n  - '),
  );
});

test('every reduced-motion delegate hook still honors reduced motion itself', () => {
  for (const [hook, modulePath] of SAFE_DELEGATES) {
    const src = readFileSync(resolve(repoRoot, modulePath), 'utf8');
    assert.match(
      src,
      new RegExp(`\\b${hook}\\b`),
      `${modulePath} no longer defines ${hook}; update SAFE_DELEGATES`,
    );
    assert.ok(
      /useReducedMotion/.test(src) || /prefers-reduced-motion/.test(src),
      `${modulePath} defines ${hook}, which callers are exempted for, but no ` +
        'longer honors reduced motion itself — the exemption is now unsound',
    );
  }
});

test('the canonical v3 motion library exposes the reduced-motion guard + 5 primitives', () => {
  const motionLib = readFileSync(
    resolve(repoRoot, 'src/lib/coachhelm/v3/motion.ts'),
    'utf8',
  );

  // The guard hook used across the product.
  assert.match(
    motionLib,
    /export function useReducedMotionGuard/,
    'expected useReducedMotionGuard() export in the v3 motion library',
  );
  assert.match(
    motionLib,
    /useReducedMotion/,
    'expected the v3 motion library to wrap framer-motion useReducedMotion',
  );

  // The 5 W3A primitives, each reduced-motion aware.
  for (const sym of [
    'shimmer',
    'celebrationVariants',
    'successCheckmark',
    'pulseDots',
    'collapseVariants',
  ]) {
    assert.match(
      motionLib,
      new RegExp(`export (function|const) ${sym}\\b`),
      `expected the v3 motion library to export the '${sym}' primitive`,
    );
  }
});

test('the legacy @/lib/motion library has been removed and migrated', () => {
  // The legacy lib must be gone...
  let legacyExists = true;
  try {
    statSync(resolve(repoRoot, 'src/lib/motion.ts'));
  } catch {
    legacyExists = false;
  }
  assert.equal(
    legacyExists,
    false,
    'src/lib/motion.ts (legacy) must be deleted — its exports were migrated into ' +
      'src/lib/coachhelm/v3/motion.ts',
  );

  // ...and nothing may import from it any more.
  const files = walk(srcRoot).map(relativize);
  const stragglers = files.filter((rel) =>
    /from\s+['"]@\/lib\/motion['"]/.test(readFileSync(resolve(repoRoot, rel), 'utf8')),
  );
  assert.deepEqual(
    stragglers,
    [],
    'These files still import from the deleted legacy @/lib/motion — ' +
      'migrate them to @/lib/coachhelm/v3/motion:\n  - ' + stragglers.join('\n  - '),
  );
});
