// Regression test for the W1.5 arbitrary-font-size sweep across src/app.
//
// Wave 1.5 (2026-05-28) replaced ~641 arbitrary `text-[Npx]` font-size
// overrides that had drifted across src/app/golf and src/app/baseball with
// the canonical 9-step type scale introduced in Wave 0
// (tailwind.config.ts fontSize + --text-{display,h1,h2,h3,body-lg,body,
// body-sm,caption,eyebrow}-* in src/styles/tokens.css). See the ultra-audit
// master synthesis §5 (canonical type scale) cited in the W0 fontSize block.
//
// Canonical mapping applied:
//   10/11 -> text-eyebrow   12 -> text-caption   13/14 -> text-body-sm
//   15/16 -> text-body      17 -> text-body-lg   18/19/20 -> text-h3
//   22/24/26 -> text-h2     28/30/32 -> text-h1  36/40/44/48 -> text-display
// Outliers snapped to the nearest step (designer should revisit — TODO(design)):
//   8, 9   -> text-eyebrow  (below the smallest step; intentional micro labels)
//   12.5   -> text-body-sm  (nearest 13)
//
// This test stops arbitrary `text-[Npx]` font-size classes from drifting
// back into the application surface. It will FAIL on any non-allowlisted
// reintroduction.
//
// ALLOWLIST: a small set of lines keep an intentional oversized display
// numeral / headline whose responsive ramp exceeds the canonical scale
// (no fitting two-step pair exists: 38/56, 44/52). These are matched by
// EXACT line content so any *other* new arbitrary text-[Npx] still fails.
//
// Run via: node --test scripts/__tests__/no-arbitrary-text-px-app.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
process.chdir(repoRoot);

// The owned application surface this sweep covers: TS/TSX under src/app
// ONLY. Raw CSS declarations in src/app/globals.css (e.g. `@apply
// text-[15px]` inside an @layer) are owned by the design-tokens agent and
// are an allowed exception per the ultra-audit allowlist rule (CSS @apply
// cannot reference a Tailwind utility token the same way JSX className can),
// so .css is intentionally excluded from the scan scope below.
const SCOPE = ['src/app/**/*.ts', 'src/app/**/*.tsx'];

// Banned pattern: any Tailwind arbitrary font-size utility, including a
// responsive prefix (sm:/md:/lg:/xl:/2xl:) and decimal px values.
const BANNED = 'text-\\[[0-9]+(\\.[0-9]+)?px\\]';

// Lines explicitly permitted to retain an arbitrary text-[Npx]: intentional
// oversized display numerals / headlines whose responsive ramp has no
// fitting canonical two-step pair. Matched against the trimmed grep line
// content (everything after `path:lineno:`), so the size/styling is pinned —
// any other new arbitrary text-[Npx] anywhere is still a regression.
const LINE_ALLOWLIST = new Set([
  // PlayerDashboard "Submit your first round." empty-state hero headline.
  '<h2 className="text-[38px] md:text-[56px] leading-[1.02] font-light tracking-[-0.035em] text-warm-900 mb-5">',
  // Live round total-score numerals (continue-round + new-round) — oversized
  // tabular display figure with a 44->52 responsive ramp.
  'className="text-[44px] md:text-[52px] font-light tracking-[-0.025em] text-white tabular-nums"',
]);

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
    // Non-git fallback: scan src/app recursively but restrict to TS/TSX so
    // raw CSS (.css) declarations are excluded, matching the git pathspec.
    result = spawnSync(
      '/usr/bin/grep',
      [
        '-rnI',
        '--color=never',
        '--include=*.ts',
        '--include=*.tsx',
        '-E',
        pattern,
        'src/app',
      ],
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

// Each grep line is `path:lineno:<content>`. Returns offending lines whose
// trimmed content is NOT in the allowlist, formatted `path:lineno`.
function offendingLines(pattern, allowlist = new Set()) {
  const offenders = [];
  for (const line of runGrep(pattern)) {
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    if (firstColon === -1 || secondColon === -1) continue;
    const location = line.slice(0, secondColon);
    const content = line.slice(secondColon + 1).trim();
    if (!allowlist.has(content)) offenders.push(`${location}  ${content}`);
  }
  return offenders.sort();
}

test('no arbitrary font-size (text-[Npx]) in src/app', () => {
  const offenders = offendingLines(BANNED, LINE_ALLOWLIST);
  assert.deepEqual(
    offenders,
    [],
    'Arbitrary font-size found — snap to the canonical scale ' +
      '(text-eyebrow|caption|body-sm|body|body-lg|h3|h2|h1|display):\n  ' +
      offenders.join('\n  ')
  );
});

test('allowlisted display-numeral lines still exist (allowlist not stale)', () => {
  // Guard against the allowlist rotting: if these intentional lines are
  // refactored away, prune the allowlist instead of leaving dead entries.
  const present = new Set(
    runGrep(BANNED).map((line) => {
      const firstColon = line.indexOf(':');
      const secondColon = line.indexOf(':', firstColon + 1);
      return line.slice(secondColon + 1).trim();
    })
  );
  const stale = [...LINE_ALLOWLIST].filter((entry) => !present.has(entry));
  assert.deepEqual(
    stale,
    [],
    `Stale allowlist entries (no longer present — remove them):\n  ${stale.join('\n  ')}`
  );
});
