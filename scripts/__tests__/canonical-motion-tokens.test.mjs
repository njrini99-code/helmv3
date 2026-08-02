// Regression test: the Tier-1 motion-vocabulary files MUST stay bound to
// the canonical v3 motion library at `src/lib/coachhelm/v3/motion.ts`.
//
// Background: the 2026-05-28 motion audit (`docs/operations/2026-05-28-ui-motion-audit.md`)
// graded the product 4/10 Apple-grade and identified 3 surgical fixes:
//
//   1. `src/components/ui/reveal.tsx` — was re-declaring `PREMIUM_EASE`
//      + a 0.38s duration locally instead of importing canonical tokens.
//   2. `src/app/golf/(dashboard)/dashboard/coachhelm/components/
//      PlayerCoachHelmDashboard.tsx` — had 5 inline `transition={{
//      duration: 0.15 }}` / `0.2` blocks with no easing on AnimatePresence
//      crossfades, jittering the AI flagship dashboard.
//   3. `src/components/golf/dashboard/premium-components.tsx` — defined
//      `APPLE_EASE` + a 0.55s duration locally (no matching DURATION tier),
//      and lifted `y: -3` on hover (canonical lift is `-2`).
//
// After the fix, these 3 files import ONLY from `@/lib/coachhelm/v3/motion`
// and use named tokens (`EASE_CINEMATIC`, `EASE_TAP`, `DURATION.*`,
// `STAGGER_STEP`, `crossfadeVariants`, `crossfadeTransition`). This test
// re-asserts that contract so future drift is caught at CI rather than
// re-discovered in a presentation.
//
// Forbidden patterns inside the three target files:
//   - Locally-declared `cubic-bezier(...)` strings in JS/TS expression
//     position (Tailwind className utilities like
//     `ease-[cubic-bezier(0.16,1,0.3,1)]` are allowed — those are CSS
//     transitions, not framer-motion transitions, and out of scope).
//   - Inline `duration: 0.\d+` literals (any decimal seconds) — must
//     use `DURATION.micro/.short/.medium/.long` instead.
//   - Locally-declared `PREMIUM_EASE`, `APPLE_EASE`, or any other
//     custom ease constant defined inside the file.
//
// Required:
//   - At least one import from `@/lib/coachhelm/v3/motion`.
//
// This previously ran as a bare script via `node
// scripts/__tests__/canonical-motion-tokens.test.mjs` (it never registered
// a `node:test` case, so it was never picked up by `node --test` either —
// nothing invoked it). Promoted to vitest (issue #1194): the top-level
// script logic below is unchanged, only the pass/fail signal moved from
// `process.exit(1)` to a vitest assertion, and the hardcoded `process.chdir`
// was dropped since vitest runs multiple test files in a shared process and
// mutating the global cwd would race with them — every path below was
// already resolved absolute via `repoRoot`, so it did not depend on cwd.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('canonical motion tokens stay bound to v3 motion library', () => {
  const repoRoot = resolve(import.meta.dirname, '../..');

  const TARGETS = [
    'src/components/ui/reveal.tsx',
    'src/components/golf/dashboard/premium-components.tsx',
    // The legacy `PlayerCoachHelmDashboard.tsx` this target used to cover was
    // deleted in Wave W1 (2026-07-09, Fairway-unconditional cutover) — the
    // Fairway-only CoachHelm player surface (FairwayPlayerCoachHelm) is the
    // live replacement and was never part of this Tier-1 motion-vocabulary set.
  ];

  const CANONICAL_IMPORT = '@/lib/coachhelm/v3/motion';

  // Inline `duration: 0.42` style literals. The framer-motion API surface uses
  // `duration:` followed by a number — we forbid bare decimal seconds in the
  // motion-token files so callers must reach for `DURATION.*` tier values.
  const DURATION_LITERAL = /duration:\s*0\.\d+/g;

  // Locally-declared custom ease constants. The canonical library exports
  // `EASE_CINEMATIC` and `EASE_TAP` — anything else assigned to a 4-number
  // tuple in these files is drift.
  const LOCAL_EASE_NAMES = [
    'PREMIUM_EASE',
    'APPLE_EASE',
    'IOS_EASE_CUSTOM',
    'PREMIUM_BEZIER',
    'CINEMATIC_EASE',
  ];

  // Bare `cubic-bezier(...)` string literals in JS expression position.
  // We strip out the Tailwind arbitrary-value class strings
  // (`ease-[cubic-bezier(...)]`) first because they're CSS, not JS — out
  // of scope for the framer-motion token contract.
  const TAILWIND_EASE_ARBITRARY = /ease-\[cubic-bezier\([^\]]+\)\]/g;
  const BARE_CUBIC_BEZIER = /cubic-bezier\([^)]+\)/g;

  const failures = [];
  function fail(msg) {
    failures.push(msg);
  }

  for (const relPath of TARGETS) {
    let src;
    try {
      src = readFileSync(resolve(repoRoot, relPath), 'utf8');
    } catch (err) {
      fail(`could not read ${relPath}: ${err.message}`);
      continue;
    }

    // 1. Required canonical import.
    if (!src.includes(`from '${CANONICAL_IMPORT}'`) && !src.includes(`from "${CANONICAL_IMPORT}"`)) {
      fail(`${relPath}: missing canonical import from '${CANONICAL_IMPORT}'`);
    }

    // Strip line/block comments so a doc-comment example doesn't trip the
    // pattern matchers. JSX strings and template literals are kept — those
    // are real code surface.
    const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const noLineComments = noBlockComments.replace(/(^|[^:])\/\/.*$/gm, '$1');

    // 2. No inline `duration: 0.\d+` literals.
    const durationHits = [...noLineComments.matchAll(DURATION_LITERAL)];
    if (durationHits.length > 0) {
      fail(
        `${relPath}: ${durationHits.length} inline 'duration: 0.\\d+' literal(s) found ` +
          `(use DURATION.micro/.short/.medium/.long): ` +
          durationHits.map((m) => m[0]).join(', '),
      );
    }

    // 3. No locally-declared custom ease names.
    const localEaseHits = LOCAL_EASE_NAMES.filter((name) => {
      // const APPLE_EASE = ..., let PREMIUM_EASE = ..., etc.
      const declRe = new RegExp(`(?:const|let|var)\\s+${name}\\s*=`);
      return declRe.test(noLineComments);
    });
    if (localEaseHits.length > 0) {
      fail(
        `${relPath}: locally-declared ease constant(s): ${localEaseHits.join(', ')} ` +
          `(use EASE_CINEMATIC or EASE_TAP from '@/lib/coachhelm/v3/motion')`,
      );
    }

    // 4. No bare `cubic-bezier(...)` in JS expression position. Strip
    //    Tailwind arbitrary-value class utilities first — those are CSS.
    const noTailwindEase = noLineComments.replace(TAILWIND_EASE_ARBITRARY, '');
    const bareCubicHits = [...noTailwindEase.matchAll(BARE_CUBIC_BEZIER)];
    if (bareCubicHits.length > 0) {
      fail(
        `${relPath}: ${bareCubicHits.length} bare cubic-bezier(...) literal(s) outside ` +
          `Tailwind class strings: ` +
          bareCubicHits.map((m) => m[0]).join(', '),
      );
    }
  }

  assert.equal(
    failures.length,
    0,
    `${failures.length} canonical-motion-token assertion(s) failed:\n${failures.join('\n')}\n` +
      'Re-bind the offending file(s) to @/lib/coachhelm/v3/motion. ' +
      'See docs/operations/2026-05-28-ui-motion-audit.md for the rationale.',
  );
});
