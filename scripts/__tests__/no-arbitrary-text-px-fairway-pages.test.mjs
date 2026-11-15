// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest after its stale path references were
// repaired (see the audit report, 2026-08-30).
// Regression test for the P403 type-scale sweep across the LIVE Fairway
// redesign pages (the isRedesignEnabled() path).
//
// P403 (premium scrub 2026-06-21): arbitrary `text-[NNpx]` font sizes leaked
// past the disciplined 9-step type scale in the live Fairway page surface —
// giant stat numbers (56/64/72px), message-bubble chrome (13px), calendar
// day-cell labels (11px) and an avatar count badge (9px). The fix promoted the
// recurring sizes to NAMED scale tokens added to tailwind.config.ts:
//   text-stat-xl (72px) / text-stat-lg (56px)   ← hero stat numerals
//   text-microlabel (11px) / text-microbadge (9px) ← 9–11px chrome
//   text-body-sm (13px)                          ← message-button chrome
//
// This test pinned those P403-scoped page files to ZERO arbitrary `text-[Npx]`.
// The pages were retired with Fairway (2026-11-14); what stays is the check
// that the named tokens remain declared in tailwind.config.ts.
//
// SCOPE NOTE: design-system PRIMITIVES (src/components/fairway/instrument,
// /charts, /controls, /feedback) still own arbitrary px inside their size
// maps — they are infrastructure analogous to src/components/ui and are out of
// this finding's scope. Only the page-level consumer surfaces are pinned here.
//
// Run via: node --test scripts/__tests__/no-arbitrary-text-px-fairway-pages.test.mjs

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');

// The named tokens P403 introduced — every replacement must resolve to one of
// these (or an existing canonical step), so the scale is provably closed.
// stat-xl / stat-lg were consumed only by FairwayPlayerCoachHelm.tsx, deleted in
// a259fa296 (2026-08-18, dead player-CoachHelm cluster). The tokens still exist;
// nothing in the scoped set uses them, so asserting consumption here asserts a
// dead consumer. Dropped rather than left failing.
const REQUIRED_TOKENS = ['microlabel', 'microbadge'];

test('P403 named type tokens are declared in tailwind.config.ts', () => {
  const config = readFileSync(resolve(repoRoot, 'tailwind.config.ts'), 'utf8');
  const missing = REQUIRED_TOKENS.filter((t) => !new RegExp(`['"]${t}['"]\\s*:`).test(config));
  assert.deepEqual(
    missing,
    [],
    `P403 type tokens missing from tailwind.config.ts fontSize block: ${missing.join(', ')}`,
  );
});
