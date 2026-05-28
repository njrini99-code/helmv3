// Regression test for PR #141 token unification + the inline-cream sweep.
//
// PR #141 unified the cream/linen background to `#F7F5F2` (cream-100) and
// the Geist font system. A follow-up sweep replaced ~50 inline
// `#FFFEFA` / `bg-[#FFFEFA]` hardcodes across loading skeletons, error
// boundaries, admin pages, and dashboard backgrounds.
//
// This test stops the old cream hex from drifting back into the product
// surface. The ALLOWLIST below is the only set of files allowed to keep
// `#FFFEFA`:
//   - Design tokens (globals.css / tokens.css / scenes/palette.ts) own
//     the source of truth — palette.ts feeds the auth splash scene.
//   - Email/notification templates (Resend HTML) can't reference CSS
//     vars; the literal hex is required for email-client compat.
//   - Auth splash pages (welcome/login) intentionally use the legacy
//     3-stop marketing gradient `#FFFEFA → #FFF7E0 → #FDEAC0`.
//
// Anything outside that allowlist (any new `#FFFEFA` or `bg-[#FFFEFA]`
// hardcode under src/) is a regression: replace with `#F7F5F2` or
// `bg-cream-100`.
//
// Run via: node scripts/__tests__/no-stale-cream-hardcodes.test.mjs

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
process.chdir(repoRoot);

// Files explicitly permitted to retain `#FFFEFA`. Keep these paths
// canonical (no trailing slashes) and matched exactly to grep output.
const ALLOWLIST = new Set([
  // Design tokens — source of truth.
  'src/app/globals.css',
  'src/styles/tokens.css',
  // Scene palette feeds the auth splash CourseScene gradient.
  'src/components/golf/scenes/palette.ts',
  // Auth splash pages — intentional marketing gradient.
  'src/app/golf/(auth)/welcome/page.tsx',
  'src/app/golf/(auth)/login/page.tsx',
  // Email + notification templates — literal hex required for email
  // client compat (cannot reference CSS vars).
  'src/lib/email/coach-digest-template.ts',
  'src/lib/email/team-invite.ts',
  'src/lib/notifications/email.ts',
  'src/lib/coachhelm/v3/recap/template.ts',
  'src/app/golf/actions/task-reminders.ts',
]);

function grepHits(pattern) {
  // -R recursive, -n line numbers, --include patterns scoped to src/.
  // We use `git grep` first if available (faster, respects .gitignore);
  // fall back to grep -rn for non-git environments.
  const useGitGrep = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).status === 0;
  const args = useGitGrep
    ? ['grep', '-n', '--no-color', '-E', pattern, '--', 'src/']
    : ['-rn', '--color=never', '-E', pattern, 'src/'];
  const bin = useGitGrep ? 'git' : 'grep';
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status === 0 || result.status === 1) {
    return (result.stdout || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // git grep: src/foo.tsx:12:bg-[#FFFEFA]
        // grep -rn: same shape
        const idx = line.indexOf(':');
        return idx === -1 ? line : line.slice(0, idx);
      });
  }
  throw new Error(`grep failed: status=${result.status} stderr=${result.stderr}`);
}

function uniqueFiles(lines) {
  return Array.from(new Set(lines)).sort();
}

let failures = 0;

// 1. `#FFFEFA` literal — only allowed in ALLOWLIST.
{
  const files = uniqueFiles(grepHits('#FFFEFA'));
  const offenders = files.filter((f) => !ALLOWLIST.has(f));
  if (offenders.length > 0) {
    failures += 1;
    console.error('FAIL: #FFFEFA found in files outside the allowlist:');
    for (const f of offenders) console.error('  - ' + f);
    console.error('Replace with #F7F5F2 (linen-100 cream token).');
  } else {
    console.log(`PASS: #FFFEFA only present in ${files.length} allowlisted files.`);
  }
}

// 2. `bg-[#FFFEFA]` Tailwind arbitrary value — should NEVER appear
// anywhere under src/ (auth splash uses CSS var / style={{}}, not
// Tailwind arbitrary).
{
  const files = uniqueFiles(grepHits('bg-\\[#FFFEFA\\]'));
  if (files.length > 0) {
    failures += 1;
    console.error('FAIL: bg-[#FFFEFA] Tailwind arbitrary value found — replace with bg-cream-100:');
    for (const f of files) console.error('  - ' + f);
  } else {
    console.log('PASS: bg-[#FFFEFA] arbitrary Tailwind value not present in src/.');
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log('\nAll cream-hardcode regression checks passed.');
