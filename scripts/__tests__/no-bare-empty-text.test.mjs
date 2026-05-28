// Regression test for the Tier-1 states audit (2026-05-28).
//
// CoachHelm card-level empty states must route through the shared
// `<EmptyState />` primitive. Bare `<p>No X available</p>` patterns
// look unfinished, leak inconsistent voice across cards, and skip the
// iconography + spacing the design system enforces.
//
// Run via: node --test scripts/__tests__/no-bare-empty-text.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');

function findCoachHelmTsx() {
  const out = execFileSync(
    'find',
    ['src/components/golf/coachhelm', '-name', '*.tsx'],
    { encoding: 'utf8', cwd: repoRoot },
  );
  return out.trim().split('\n').filter(Boolean);
}

const BANNED_PATTERNS = [
  // Tag the audit-cited offenders: "No X available", "No X data", "Not enough data yet" in a bare <p>.
  /<p[^>]*>\s*No[^<]*\bavailable\b[^<]*<\/p>/i,
  /<p[^>]*>\s*No[^<]*\bdata\b[^<]*<\/p>/i,
  /<p[^>]*>\s*Not enough data yet\b[^<]*<\/p>/i,
];

test('no bare <p>No X available</p> or <p>No X data</p> in CoachHelm cards', () => {
  const files = findCoachHelmTsx();
  assert.ok(files.length > 0, 'expected at least one .tsx in src/components/golf/coachhelm');

  const offenders = [];
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    const src = readFileSync(abs, 'utf8');
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(src)) {
        offenders.push(`${rel}  (matched ${pattern})`);
        break;
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These CoachHelm cards render bare empty-state text — replace with <EmptyState variant="minimal" />:\n  - ${offenders.join('\n  - ')}`,
  );
});
