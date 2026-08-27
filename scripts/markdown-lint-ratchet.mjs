#!/usr/bin/env node
/**
 * markdown-lint-ratchet.mjs
 *
 * review-gate.yml's `markdownlint` job used to lint only the files changed
 * in a PR, and its lint step ended in `|| true` — so the job could never
 * fail, regardless of what it found. It was listed in the `all` required
 * aggregate anyway, meaning it "gated" nothing while looking like a real
 * check. Measured 2026-08-19: 34,576 violations across 291 of 296 in-scope
 * files (docs/ + CLAUDE.md + AGENTS.md, excluding archive/ and dot-prefixed
 * "full-review" dirs), dominated by MD013 line-length (20,425) and MD060
 * table-column-style (6,833) — rules this repo has clearly never enforced
 * on prose docs.
 *
 * That backlog is far too large to unmask as a hard "zero violations" gate
 * without a repo-wide docs reformat nobody asked for. Instead this mirrors
 * lint-ratchet.mjs's shape: lint the FULL scope (not just the PR's changed
 * files — a per-rule count only means something as a stable baseline if the
 * scope it's measured over doesn't shift under it), tally violations
 * per-rule, and fail only if any rule's count goes UP versus
 * .markdownlint-baseline.json. Existing violations are grandfathered; new
 * ones block.
 *
 * Exit codes:
 *   0 — no regression (every rule's count <= baseline)
 *   1 — regression detected (at least one rule's count > baseline)
 *
 * Flags:
 *   --update  Rewrite .markdownlint-baseline.json from the current run and exit 0.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, '.markdownlint-baseline.json');

const UPDATE = process.argv.includes('--update');

// ---------------------------------------------------------------------------
// 1. Resolve the file scope — same pattern the old job's changed-files
//    filter used (`^docs/.*\.md$|^(CLAUDE|AGENTS|CLAUDE_CODE_GUIDE)\.md$`),
//    just walked over the whole tree instead of the PR's changed files.
// ---------------------------------------------------------------------------
/** @type {{ path: string; reason: string }[]} */
const excluded = [];

/**
 * Every tracked .md path under `dir`, from git — not from the filesystem.
 *
 * WHY GIT AND NOT readdirSync (measured 2026-08-27)
 *
 * This gate judges COMMITTED repository content, so the universe of files it
 * may inspect is the set git tracks. A filesystem walk inspects whatever
 * happens to exist on this machine today, which made the gate depend on the
 * checkout rather than on the commit:
 *
 *   canonical checkout   markdown:ratchet FAILS  (+393 over baseline)
 *   fresh worktree       markdown:ratchet PASSES
 *   tracked content      IDENTICAL in both
 *
 * The whole difference was 21 gitignored files under docs/redesign/ holding
 * 1,850 violations. They are not in the repository; they were on one Mac.
 *
 * Scoped to tracked files, with those 21 excluded, the count came out 1,457
 * BELOW the recorded baseline — so the walk had also been inflating the
 * baseline itself.
 *
 * A gate whose result depends on untracked local files cannot be reproduced in
 * CI, and a local red that CI does not see teaches people to ignore it.
 */
function markdownFilesUnder(dir) {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-z', '--', `${dir}/*.md`], {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }

  // Same two exclusions as before, applied to the tracked set. `archive` is
  // historical evidence; `.full-review*` is generated audit output.
  const kept = [];
  const excludedCounts = new Map();
  for (const rel of out) {
    const seg = rel.split('/');
    const hit = seg.findIndex(
      (part, i) => i > 0 && (part === 'archive' || part.startsWith('.full-review')),
    );
    if (hit === -1) {
      kept.push(rel);
      continue;
    }
    const prefix = seg.slice(0, hit + 1).join('/');
    excludedCounts.set(prefix, (excludedCounts.get(prefix) ?? 0) + 1);
  }
  for (const [prefix, count] of excludedCounts) {
    excluded.push({
      path: prefix,
      reason: `${count} .md file${count !== 1 ? 's' : ''}, deliberately excluded directory`,
    });
  }
  return kept;
}

const files = markdownFilesUnder('docs');
for (const name of ['CLAUDE.md', 'AGENTS.md', 'CLAUDE_CODE_GUIDE.md']) {
  if (existsSync(resolve(ROOT, name))) files.push(name);
  else excluded.push({ path: name, reason: 'not present in this checkout' });
}
files.sort();

// ---------------------------------------------------------------------------
// Report scope honestly, every run. A silent scope reduction would read as
// "N violations under control" when it might mean "we stopped looking at
// some files." archive/ and .full-review*/ are excluded ON PURPOSE
// (superseded/in-progress docs), not a tool limitation like sqlfluff's — but
// "on purpose" still deserves visible, current numbers, not just a code
// comment nobody re-checks.
// ---------------------------------------------------------------------------
if (excluded.length > 0) {
  console.log(`markdown-lint-ratchet: NOT COVERED — ${excluded.length} exclusion${excluded.length !== 1 ? 's' : ''} from scope:`);
  for (const { path, reason } of excluded) console.log(`  - ${path} (${reason})`);
} else {
  console.log('markdown-lint-ratchet: full coverage — no exclusions from scope.');
}

if (files.length === 0) {
  console.log('markdown-lint-ratchet: no Markdown files found in scope — nothing to lint.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Run markdownlint-cli2 and collect per-rule violation counts.
//    Violations print to stderr, one per line; the summary goes to stdout.
// ---------------------------------------------------------------------------
let output;
try {
  execFileSync('markdownlint-cli2', files, {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  output = '';
} catch (err) {
  // markdownlint-cli2 exits non-zero when it finds violations; that's the
  // expected path whenever the backlog is non-empty.
  output = err.stderr || '';
  if (!output && err.status !== 0 && err.status !== 1) {
    console.error('markdown-lint-ratchet: markdownlint-cli2 failed to run.');
    console.error(err.message);
    process.exit(1);
  }
}

/** @type {Record<string, number>} */
const current = {};
let totalNow = 0;
// Violation lines look like: "docs/foo.md:12:81 error MD013/line-length ..."
const VIOLATION_RE = /\bMD\d+\/[a-z0-9-]+\b/;
for (const line of output.split('\n')) {
  const m = VIOLATION_RE.exec(line);
  if (m) {
    const rule = m[0];
    current[rule] = (current[rule] ?? 0) + 1;
    totalNow += 1;
  }
}

const sortedCurrent = Object.fromEntries(
  Object.entries(current).sort(([a], [b]) => a.localeCompare(b))
);

// ---------------------------------------------------------------------------
// 3. --update: overwrite baseline and exit
// ---------------------------------------------------------------------------
if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(sortedCurrent, null, 2) + '\n', 'utf-8');
  console.log(
    `markdown-lint-ratchet: baseline updated — ${totalNow} violation${totalNow !== 1 ? 's' : ''} across ${Object.keys(sortedCurrent).length} rule${Object.keys(sortedCurrent).length !== 1 ? 's' : ''} locked in ${BASELINE_PATH}`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 4. Load baseline
// ---------------------------------------------------------------------------
/** @type {Record<string, number>} */
let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
} catch {
  console.error(
    `markdown-lint-ratchet: baseline file not found at ${BASELINE_PATH}.\n` +
      'Run `npm run markdown:ratchet -- --update` to create it.'
  );
  process.exit(1);
}

const totalBaseline = Object.values(baseline).reduce((s, n) => s + n, 0);

// ---------------------------------------------------------------------------
// 5. Per-rule comparison
// ---------------------------------------------------------------------------
/** @type {Array<{rule: string, baseline: number, now: number, delta: number}>} */
const regressions = [];
for (const [rule, nowCount] of Object.entries(current)) {
  const baseCount = baseline[rule] ?? 0;
  if (nowCount > baseCount) {
    regressions.push({ rule, baseline: baseCount, now: nowCount, delta: nowCount - baseCount });
  }
}

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
if (regressions.length > 0) {
  console.error('markdown-lint-ratchet: VIOLATION COUNT REGRESSION DETECTED\n');
  console.error(
    'The following markdownlint rules have MORE violations than the baseline.\n' +
      'Fix the new violations, or run `npm run markdown:ratchet -- --update` only\n' +
      'after the net violation count has decreased.\n'
  );

  const maxRuleLen = Math.max(...regressions.map((r) => r.rule.length));
  console.error(
    `  ${'Rule'.padEnd(maxRuleLen)}  ${'Baseline'.padStart(8)}  ${'Now'.padStart(8)}  ${'Delta'.padStart(6)}`
  );
  console.error(`  ${'-'.repeat(maxRuleLen + 28)}`);

  for (const { rule, baseline: b, now, delta } of regressions.sort(
    (a, b_) => b_.delta - a.delta
  )) {
    console.error(
      `  ${rule.padEnd(maxRuleLen)}  ${String(b).padStart(8)}  ${String(now).padStart(8)}  +${String(delta).padStart(5)}`
    );
  }

  console.error(`\n  Total: ${totalBaseline} → ${totalNow} (net ${totalNow >= totalBaseline ? '+' : ''}${totalNow - totalBaseline})`);
  process.exit(1);
}

if (totalNow < totalBaseline) {
  console.log(
    `markdown-lint-ratchet: violations dropped (${totalBaseline} → ${totalNow}) — run \`npm run markdown:ratchet -- --update\` to lock in the gains`
  );
} else {
  console.log(`markdown-lint-ratchet: OK — ${totalNow} violation${totalNow !== 1 ? 's' : ''}, no regressions`);
}

process.exit(0);
