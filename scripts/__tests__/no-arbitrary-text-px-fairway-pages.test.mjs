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
// This test pins those P403-scoped page files to ZERO arbitrary `text-[Npx]`
// so the type system stays closed and the helm/no-arbitrary-text-px lint rule
// can move from warn → error for these surfaces. It will FAIL on any
// reintroduction of an arbitrary font-size utility in these files.
//
// SCOPE NOTE: design-system PRIMITIVES (src/components/fairway/instrument,
// /charts, /controls, /feedback) still own arbitrary px inside their size
// maps — they are infrastructure analogous to src/components/ui and are out of
// this finding's scope. Only the page-level consumer surfaces are pinned here.
//
// Run via: node --test scripts/__tests__/no-arbitrary-text-px-fairway-pages.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');

// The exact P403-scoped live-path page files (isRedesignEnabled() === true).
const SCOPED_FILES = [
  'src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx',
  'src/components/fairway/pages/coachhelm/PlayersGridView.tsx',
  'src/components/fairway/pages/coachhelm/FairwayPlayerCoachHelm.tsx',
  'src/components/fairway/pages/messages/MessageConversationRail.tsx',
  'src/components/fairway/pages/messages/MessageThreadPane.tsx',
  'src/components/fairway/pages/calendar/FairwayMonthGrid.tsx',
  'src/components/fairway/pages/calendar/FairwayCalendarMemberRail.tsx',
];

// Any Tailwind arbitrary font-size utility (incl. responsive prefix + decimals).
const BANNED = /text-\[[0-9]+(\.[0-9]+)?px\]/;

// The named tokens P403 introduced — every replacement must resolve to one of
// these (or an existing canonical step), so the scale is provably closed.
const REQUIRED_TOKENS = ['stat-xl', 'stat-lg', 'microlabel', 'microbadge'];

test('no arbitrary font-size (text-[Npx]) in the P403-scoped Fairway pages', () => {
  const offenders = [];
  for (const rel of SCOPED_FILES) {
    const src = readFileSync(resolve(repoRoot, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (BANNED.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'Arbitrary font-size found in a live Fairway page — snap to a named scale ' +
      'token (text-stat-xl|stat-lg|microlabel|microbadge|body-sm|caption|eyebrow|h3|h2|h1|display):\n  ' +
      offenders.join('\n  '),
  );
});

test('P403 named type tokens are declared in tailwind.config.ts', () => {
  const config = readFileSync(resolve(repoRoot, 'tailwind.config.ts'), 'utf8');
  const missing = REQUIRED_TOKENS.filter((t) => !new RegExp(`['"]${t}['"]\\s*:`).test(config));
  assert.deepEqual(
    missing,
    [],
    `P403 type tokens missing from tailwind.config.ts fontSize block: ${missing.join(', ')}`,
  );
});

test('P403 named tokens are actually consumed by the scoped pages', () => {
  // Guard against the tokens rotting unused: at least the two stat steps and
  // the two micro steps each appear in the live pages they were added for.
  const allSrc = SCOPED_FILES.map((rel) => readFileSync(resolve(repoRoot, rel), 'utf8')).join('\n');
  const unused = REQUIRED_TOKENS.filter((t) => !allSrc.includes(`text-${t}`));
  assert.deepEqual(
    unused,
    [],
    `P403 tokens declared but never consumed in the scoped pages: ${unused.join(', ')}`,
  );
});
