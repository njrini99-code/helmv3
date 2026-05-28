// Regression test for the W1 design-token sweep across src/app.
//
// Wave 1 (2026-05-28) replaced the raw helm-green / red hex, arbitrary
// radius + z-index scale tokens, and arbitrary page-width tokens that
// had drifted across src/app/golf, src/app/baseball, and src/app/actions
// with the canonical design-system tokens introduced in Wave 0
// (src/styles/tokens.css + tailwind.config.ts). See
// docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md §5.
//
// This test stops the banned raw values from drifting back into the
// application surface:
//   - #16A34A / #16a34a  -> var(--color-primary-600) / text-primary-600 etc.
//   - #DC2626            -> var(--color-destructive) / text-destructive
//   - rounded-[<n>px]    -> rounded-(sm|md|lg|xl|2xl|3xl)
//   - z-[<n>]            -> z-(base|raised|overlay|modal|toast|toolbar|tooltip)
//   - max-w-(3xl..7xl)   -> ContainerGrid / ContainerReading (max-w-[1280px]
//                           / max-w-[1536px] / max-w-[720px])
//
// HEX ALLOWLIST: a small set of files must keep literal hex because a CSS
// custom property (`var(--…)`) cannot be resolved in that context:
//   - Resend email HTML strings (email clients don't resolve CSS vars).
//   - Native <input type="color"> values + their text twin + placeholder,
//     which require a literal #rrggbb and store a user's team brand color
//     (data, not a design token).
//
// Run via: node --test scripts/__tests__/sweep-clean-app.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
process.chdir(repoRoot);

// The owned application surface this sweep covers.
const SCOPE = ['src/app/golf', 'src/app/baseball', 'src/app/actions'];

// Files permitted to retain a literal helm-green / red hex. Keep these
// paths canonical (no trailing slash) and matched exactly to grep output.
const HEX_ALLOWLIST = new Set([
  // Resend email HTML — literal hex required for email-client compat.
  'src/app/golf/actions/task-reminders.ts',
  // Native <input type="color"> brand-color pickers (team data default).
  'src/app/baseball/(dashboard)/dashboard/teams/page.tsx',
  'src/app/baseball/(dashboard)/dashboard/program/page.tsx',
]);

// Resolve grep binary once. `git grep` is fast and respects .gitignore in
// a work tree; fall back to plain recursive grep otherwise. We always use
// the system grep at /usr/bin/grep for the fallback to avoid shell aliases
// (e.g. ugrep) that mishandle multiple path args.
function runGrep(pattern) {
  const inGit =
    spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
    }).status === 0;

  let result;
  if (inGit) {
    result = spawnSync(
      'git',
      ['grep', '-n', '--no-color', '-I', '-E', pattern, '--', ...SCOPE],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } else {
    result = spawnSync(
      '/usr/bin/grep',
      ['-rnI', '--color=never', '-E', pattern, ...SCOPE],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  }
  // grep exit 0 = matches, 1 = no matches, >1 = real error.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `grep failed (status=${result.status}): ${result.stderr || '(no stderr)'}`
    );
  }
  return (result.stdout || '').split('\n').filter(Boolean);
}

// Returns the set of distinct files (first colon-delimited field) that
// matched, minus any in the supplied allowlist.
function offendingFiles(pattern, allowlist = new Set()) {
  const files = new Set();
  for (const line of runGrep(pattern)) {
    const idx = line.indexOf(':');
    const file = idx === -1 ? line : line.slice(0, idx);
    if (!allowlist.has(file)) files.add(file);
  }
  return [...files].sort();
}

test('no raw helm-green hex (#16A34A / #16a34a)', () => {
  const offenders = offendingFiles('#16[Aa]34[Aa]', HEX_ALLOWLIST);
  assert.deepEqual(
    offenders,
    [],
    `Raw helm-green hex found — use var(--color-primary-600) / text-primary-600:\n  ${offenders.join('\n  ')}`
  );
});

test('no raw red hex (#DC2626)', () => {
  const offenders = offendingFiles('#[Dd][Cc]2626', HEX_ALLOWLIST);
  assert.deepEqual(
    offenders,
    [],
    `Raw red hex found — use var(--color-destructive) / text-destructive:\n  ${offenders.join('\n  ')}`
  );
});

test('no arbitrary radius (rounded-[<n>px])', () => {
  const offenders = offendingFiles('rounded-\\[[0-9]+px\\]');
  assert.deepEqual(
    offenders,
    [],
    `Arbitrary radius found — snap to rounded-(sm|md|lg|xl|2xl|3xl):\n  ${offenders.join('\n  ')}`
  );
});

test('no arbitrary z-index (z-[<n>])', () => {
  const offenders = offendingFiles('z-\\[[0-9]+\\]');
  assert.deepEqual(
    offenders,
    [],
    `Arbitrary z-index found — use z-(base|raised|overlay|modal|toast|toolbar|tooltip):\n  ${offenders.join('\n  ')}`
  );
});

test('no arbitrary page width (max-w-(3xl|4xl|5xl|6xl|7xl))', () => {
  const offenders = offendingFiles('max-w-[3-7]xl');
  assert.deepEqual(
    offenders,
    [],
    `Arbitrary page width found — use <ContainerGrid> / <ContainerReading> (max-w-[1280px] / max-w-[1536px] / max-w-[720px]):\n  ${offenders.join('\n  ')}`
  );
});
