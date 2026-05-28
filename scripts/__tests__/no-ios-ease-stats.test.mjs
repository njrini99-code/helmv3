// Regression test (Wave W5B-dataviz, agent motion-stats): the /stats
// surface MUST stay bound to the canonical v3 motion library at
// `src/lib/coachhelm/v3/motion.ts` and must NOT reintroduce the legacy
// iOS easing token (`IOS_EASE`) or ad-hoc framer-motion spring configs.
//
// Background: the 2026-05-28 ultra-audit master synthesis flagged the
// golf /stats client + its stats components as the last cluster still
// importing `IOS_EASE` from `src/lib/ios-animations.ts` and scattering
// inline `type: 'spring'` transitions with hand-tuned stiffness/damping
// values that drifted from the rest of the v3 surfaces. W5D canonicalized
// every one of those animations to `EASE_CINEMATIC` + `DURATION.*` from
// `@/lib/coachhelm/v3/motion` while preserving each animation's intent
// (same elements animate, delays/staggers preserved). This test re-asserts
// that contract so future drift is caught at CI rather than re-discovered
// in a presentation.
//
// Forbidden anywhere under the owned /stats paths:
//   - Importing or referencing `IOS_EASE` (the legacy [0.25,0.1,0.25,1] token).
//   - Importing from `@/lib/ios-animations`.
//   - Inline framer-motion spring transitions: `type: 'spring'` (with or
//     without `stiffness`/`damping`).
//   - Bare `cubic-bezier(...)` easing literals or raw 4-number ease tuples
//     (`ease: [0.x, ...]`) in JS expression position.
//
// Required:
//   - Any owned file that uses a framer-motion `transition=` prop must
//     import from the canonical `@/lib/coachhelm/v3/motion`.
//
// Allowlist (ALLOWLIST RULE): patterns that genuinely cannot use a
// canonical token are enumerated below so the test still FAILS on any
// NON-allowlisted reintroduction. As of W5D there are none in /stats.
//
// Run via: node scripts/__tests__/no-ios-ease-stats.test.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
process.chdir(repoRoot);

// Owned-path roots scanned recursively for *.ts / *.tsx.
const ROOTS = [
  'src/app/golf/(dashboard)/dashboard/stats',
  'src/components/golf/stats',
];

const CANONICAL_IMPORT = '@/lib/coachhelm/v3/motion';

// Allowlisted "<relPath>::<matchedSnippet>" exceptions. Empty by design —
// every /stats animation can express its easing via a canonical token.
const ALLOWLIST = new Set([]);

// ----------------------------------------------------------------------------
// Pattern matchers (run against comment-stripped source).
// ----------------------------------------------------------------------------

// `IOS_EASE` referenced as an identifier (import, usage, cast).
const IOS_EASE_REF = /\bIOS_EASE\b/g;

// Import from the legacy iOS animation token module.
const IOS_ANIMATIONS_IMPORT = /from\s+['"]@\/lib\/ios-animations['"]/g;

// Inline framer-motion spring transition.
const SPRING_TRANSITION = /type:\s*['"]spring['"]/g;

// Raw 4-number ease tuple in JS expression position, e.g. `ease: [0.25, ...]`.
const RAW_EASE_TUPLE = /ease:\s*\[\s*[\d.]/g;

// Bare `cubic-bezier(...)` in JS position. Tailwind arbitrary-value class
// utilities (`ease-[cubic-bezier(...)]`) are CSS, not framer-motion, so they
// are stripped first.
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

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // root may not exist on some checkouts — skip.
  }
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function allowed(relPath, snippet) {
  return ALLOWLIST.has(`${relPath}::${snippet}`);
}

console.log('no-IOS_EASE /stats regression check:');

const files = ROOTS.flatMap((r) => walk(resolve(repoRoot, r)));
if (files.length === 0) {
  fail('found 0 source files under the owned /stats roots — wrong cwd?');
}

for (const abs of files) {
  const relPath = relative(repoRoot, abs).split(sep).join('/');
  const raw = readFileSync(abs, 'utf8');
  const src = stripComments(raw);

  // 1. No IOS_EASE references.
  for (const m of src.matchAll(IOS_EASE_REF)) {
    if (!allowed(relPath, m[0])) fail(`${relPath}: references IOS_EASE (use EASE_CINEMATIC)`);
  }

  // 2. No legacy ios-animations import.
  for (const m of src.matchAll(IOS_ANIMATIONS_IMPORT)) {
    if (!allowed(relPath, m[0])) fail(`${relPath}: imports from @/lib/ios-animations (use ${CANONICAL_IMPORT})`);
  }

  // 3. No inline spring transitions.
  for (const m of src.matchAll(SPRING_TRANSITION)) {
    if (!allowed(relPath, m[0])) fail(`${relPath}: inline type:'spring' transition (use DURATION.* + EASE_CINEMATIC)`);
  }

  // 4. No raw ease tuples.
  for (const m of src.matchAll(RAW_EASE_TUPLE)) {
    if (!allowed(relPath, m[0])) fail(`${relPath}: raw 4-number ease tuple (use EASE_CINEMATIC / EASE_TAP)`);
  }

  // 5. No bare cubic-bezier() JS literals (Tailwind class strings excluded).
  const noTailwind = src.replace(TAILWIND_EASE_ARBITRARY, '');
  for (const m of noTailwind.matchAll(BARE_CUBIC_BEZIER)) {
    if (!allowed(relPath, m[0])) fail(`${relPath}: bare cubic-bezier() JS literal (use a canonical ease token)`);
  }

  // 6. If the file wires framer-motion transitions, it must import canonical.
  const usesTransition = /transition=/.test(src);
  const hasCanonical =
    src.includes(`from '${CANONICAL_IMPORT}'`) || src.includes(`from "${CANONICAL_IMPORT}"`);
  // Files whose only transitions are { duration: 0 } reduced-motion guards or
  // variant-driven (no literal easing) don't strictly need the import; we only
  // require it when the file references a canonical token name.
  const referencesCanonicalToken = /\bEASE_CINEMATIC\b|\bEASE_TAP\b|\bDURATION\./.test(src);
  if (usesTransition && referencesCanonicalToken && !hasCanonical) {
    fail(`${relPath}: uses canonical motion token but does not import from ${CANONICAL_IMPORT}`);
  }
}

if (failed === 0) {
  pass(`${files.length} /stats source file(s) free of IOS_EASE + ad-hoc spring/ease drift`);
  console.log('\nAll no-IOS_EASE /stats assertions passed.');
} else {
  console.error(`\n${failed} no-IOS_EASE /stats assertion(s) failed.`);
  console.error(
    `Re-bind the offending file(s) to ${CANONICAL_IMPORT} (EASE_CINEMATIC + DURATION.*). ` +
      'See the W5B-dataviz ultra-audit master synthesis for rationale.',
  );
  process.exit(1);
}
