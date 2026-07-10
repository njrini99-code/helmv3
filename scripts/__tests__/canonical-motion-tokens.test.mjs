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
// Run via: node scripts/__tests__/canonical-motion-tokens.test.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
process.chdir(repoRoot);

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

let failed = 0;
function fail(msg) {
  console.log(`  FAIL ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`  ok   ${msg}`);
}

console.log('Canonical motion-token regression check:');

for (const relPath of TARGETS) {
  console.log(`\n- ${relPath}`);
  let src;
  try {
    src = readFileSync(resolve(repoRoot, relPath), 'utf8');
  } catch (err) {
    fail(`could not read ${relPath}: ${err.message}`);
    continue;
  }

  // 1. Required canonical import.
  if (!src.includes(`from '${CANONICAL_IMPORT}'`) && !src.includes(`from "${CANONICAL_IMPORT}"`)) {
    fail(`missing canonical import from '${CANONICAL_IMPORT}'`);
  } else {
    pass(`imports from '${CANONICAL_IMPORT}'`);
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
      `${durationHits.length} inline 'duration: 0.\\d+' literal(s) found ` +
        `(use DURATION.micro/.short/.medium/.long): ` +
        durationHits.map((m) => m[0]).join(', '),
    );
  } else {
    pass('no inline duration: 0.\\d+ literals');
  }

  // 3. No locally-declared custom ease names.
  const localEaseHits = LOCAL_EASE_NAMES.filter((name) => {
    // const APPLE_EASE = ..., let PREMIUM_EASE = ..., etc.
    const declRe = new RegExp(`(?:const|let|var)\\s+${name}\\s*=`);
    return declRe.test(noLineComments);
  });
  if (localEaseHits.length > 0) {
    fail(
      `locally-declared ease constant(s): ${localEaseHits.join(', ')} ` +
        `(use EASE_CINEMATIC or EASE_TAP from '@/lib/coachhelm/v3/motion')`,
    );
  } else {
    pass('no locally-declared custom ease constants');
  }

  // 4. No bare `cubic-bezier(...)` in JS expression position. Strip
  //    Tailwind arbitrary-value class utilities first — those are CSS.
  const noTailwindEase = noLineComments.replace(TAILWIND_EASE_ARBITRARY, '');
  const bareCubicHits = [...noTailwindEase.matchAll(BARE_CUBIC_BEZIER)];
  if (bareCubicHits.length > 0) {
    fail(
      `${bareCubicHits.length} bare cubic-bezier(...) literal(s) outside ` +
        `Tailwind class strings: ` +
        bareCubicHits.map((m) => m[0]).join(', '),
    );
  } else {
    pass('no bare cubic-bezier(...) JS literals');
  }
}

if (failed > 0) {
  console.error(`\n${failed} canonical-motion-token assertion(s) failed.`);
  console.error(
    'Re-bind the offending file(s) to @/lib/coachhelm/v3/motion. ' +
      'See docs/operations/2026-05-28-ui-motion-audit.md for the rationale.',
  );
  process.exit(1);
}

console.log('\nAll canonical-motion-token assertions passed.');
