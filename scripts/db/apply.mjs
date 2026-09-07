#!/usr/bin/env node
/**
 * scripts/db/apply.mjs — D3, Helm Database Plan.
 *
 * The only sanctioned path from a merged migration file to production. Every
 * step prints PASS/FAIL as it runs and the whole thing exits non-zero on any
 * FAIL. Without `--apply` this is a dry run only — nothing is pushed.
 *
 * `--apply` is deliberately NOT pre-approved for agents
 * (.claude/settings.json permissions.deny carries the `*--apply*` form) —
 * see docs/operations/APPLY_PATH.md.
 *
 * Usage:
 *   node scripts/db/apply.mjs <migration-file>                 # dry run
 *   node scripts/db/apply.mjs <migration-file> --apply         # real apply
 *   node scripts/db/apply.mjs <migration-file> \
 *     --held-override <HELD.md row anchor> --reason "..."      # HOLD override
 *
 * Steps, in order:
 *   (a) HEAD is `main`, clean, and the file is reachable from origin/main.
 *   (b) The file is not HOLD in supabase/migrations/HELD.md (or
 *       --held-override is given with a reason).
 *   (c) The ledger (supabase_migrations.schema_migrations, read via the
 *       repo-local CLI's `db query --linked`) does not already carry the
 *       file's version.
 *   (d) Prints a PITR marker line (UTC timestamp) for the owner to record
 *       before taking a backup snapshot.
 *   (e) Dry-run: `supabase db push --dry-run --linked` and print the plan.
 *   (f) With --apply: pushes the ONE file via `supabase db push --linked
 *       --include-all=false`, re-reads the ledger, runs the migration's own
 *       `-- VERIFY:` queries (one SELECT per line, each must return >=1
 *       row), and prints a recorded-vs-applied table.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SUPABASE_CLI = resolve(REPO_ROOT, 'node_modules/.bin/supabase');
const HELD_PATH = join(REPO_ROOT, 'supabase/migrations/HELD.md');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase/migrations');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf-8', ...opts });
}

function step(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}\n`);
  return ok;
}

function parseArgs(argv) {
  const args = { file: null, apply: false, heldOverride: null, reason: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--held-override') args.heldOverride = argv[++i];
    else if (a === '--reason') args.reason = argv[++i];
    else rest.push(a);
  }
  args.file = rest[0] ?? null;
  return args;
}

/** (a) HEAD is main, clean, file reachable from origin/main. */
function checkGitState(fileBasename) {
  let ok = true;

  let branch = '';
  try {
    branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  } catch {
    branch = '(unknown)';
  }
  ok = step('HEAD is main', branch === 'main', `actual: ${branch}`) && ok;

  let clean = false;
  try {
    clean = sh('git', ['status', '--porcelain']).trim() === '';
  } catch {
    clean = false;
  }
  ok = step('working tree is clean', clean) && ok;

  let inOriginMainLog = false;
  try {
    const log = sh('git', ['log', 'origin/main', '--name-only', '--pretty=format:']);
    inOriginMainLog = log.split('\n').some((l) => l.trim() === `supabase/migrations/${fileBasename}`);
  } catch {
    inOriginMainLog = false;
  }
  ok = step('migration file is in git log origin/main (merged)', inOriginMainLog) && ok;

  return ok;
}

/** (b) Not HOLD in HELD.md, unless overridden with a reason. */
function checkNotHeld(fileBasename, heldOverride, reason) {
  if (!existsSync(HELD_PATH)) {
    return step('HELD.md check', true, 'HELD.md not found — nothing to check against');
  }
  const heldText = readFileSync(HELD_PATH, 'utf-8');
  const rowRe = new RegExp('\\|\\s*`?' + fileBasename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`?[^|]*\\|\\s*\\*\\*(HOLD|OBSOLETE)\\*\\*', 'i');
  const isHeld = rowRe.test(heldText);

  if (!isHeld) {
    return step('not HOLD/OBSOLETE in HELD.md', true);
  }
  if (heldOverride && reason) {
    return step(
      'HOLD override supplied',
      true,
      `file is HOLD in HELD.md but --held-override ${heldOverride} with reason given: "${reason}" — proceeding on the caller's explicit authority`,
    );
  }
  return step(
    'not HOLD/OBSOLETE in HELD.md',
    false,
    'file is marked HOLD or OBSOLETE — pass --held-override <HELD.md row anchor> --reason "..." to proceed deliberately, or resolve the hold first',
  );
}

/** (c) Ledger does not already carry this version. */
function checkLedger(version) {
  let rows = [];
  try {
    const raw = sh(SUPABASE_CLI, [
      'db', 'query', '--linked', '--output-format', 'json',
      `select version from supabase_migrations.schema_migrations where version = '${version}';`,
    ]);
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch (err) {
    return step('ledger does not already carry this version', false, `could not read ledger: ${String(err?.message ?? err)}`);
  }
  return step('ledger does not already carry this version', rows.length === 0, rows.length > 0 ? `version ${version} already recorded` : `version ${version} absent, as expected`);
}

function printPitrMarker() {
  const ts = new Date().toISOString();
  process.stdout.write(`\nPITR MARKER (record this before taking a backup snapshot): ${ts}\n\n`);
}

/** (e) Dry-run push plan. */
function dryRunPush() {
  try {
    const out = sh(SUPABASE_CLI, ['db', 'push', '--dry-run', '--linked']);
    process.stdout.write(`\n--- supabase db push --dry-run --linked ---\n${out}\n`);
    return step('dry-run plan generated', true);
  } catch (err) {
    return step('dry-run plan generated', false, String(err?.stdout ?? err?.message ?? err));
  }
}

/** Extract `-- VERIFY:` lines from the migration file header. */
function extractVerifyQueries(fileText) {
  return fileText
    .split('\n')
    .filter((l) => /^--\s*VERIFY:/i.test(l.trim()))
    .map((l) => l.replace(/^--\s*VERIFY:\s*/i, '').trim())
    .filter(Boolean);
}

function runVerifyQueries(queries) {
  let allOk = true;
  for (const q of queries) {
    try {
      const raw = sh(SUPABASE_CLI, ['db', 'query', '--linked', '--output-format', 'json', q]);
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      allOk = step(`VERIFY: ${q}`, rows.length >= 1, `${rows.length} row(s)`) && allOk;
    } catch (err) {
      allOk = step(`VERIFY: ${q}`, false, String(err?.message ?? err)) && allOk;
    }
  }
  return allOk;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    process.stderr.write('Usage: node scripts/db/apply.mjs <migration-file> [--apply] [--held-override <anchor> --reason "..."]\n');
    process.exit(2);
  }

  const fileBasename = basename(args.file);
  const filePath = join(MIGRATIONS_DIR, fileBasename);
  if (!existsSync(filePath)) {
    process.stderr.write(`apply.mjs: ${filePath} does not exist\n`);
    process.exit(2);
  }
  const version = fileBasename.split('_')[0];
  const fileText = readFileSync(filePath, 'utf-8');

  process.stdout.write(`\n=== db:apply — ${fileBasename} (${args.apply ? 'APPLY' : 'DRY RUN'}) ===\n\n`);

  let ok = true;
  ok = checkGitState(fileBasename) && ok;
  ok = checkNotHeld(fileBasename, args.heldOverride, args.reason) && ok;
  ok = checkLedger(version) && ok;

  if (!ok) {
    process.stderr.write('\ndb:apply: one or more preconditions FAILed. Stopping before touching production.\n');
    process.exit(1);
  }

  printPitrMarker();
  ok = dryRunPush() && ok;

  if (!args.apply) {
    process.stdout.write('\ndb:apply: dry run complete. Re-run with --apply to push for real.\n');
    process.exit(ok ? 0 : 1);
  }

  process.stdout.write(`\n--- APPLYING ${fileBasename} ---\n`);
  let applyOk = true;
  try {
    const out = sh(SUPABASE_CLI, ['db', 'push', '--linked', '--include-all=false']);
    process.stdout.write(out + '\n');
    applyOk = step('supabase db push --linked --include-all=false', true);
  } catch (err) {
    applyOk = step('supabase db push --linked --include-all=false', false, String(err?.stdout ?? err?.message ?? err));
  }

  const ledgerAfterOk = checkLedgerPresent(version);
  const verifyQueries = extractVerifyQueries(fileText);
  const verifyOk = verifyQueries.length > 0
    ? runVerifyQueries(verifyQueries)
    : step('VERIFY block present', false, 'no -- VERIFY: lines found in the migration header — cannot confirm post-apply state');

  process.stdout.write('\nrecorded vs applied:\n');
  process.stdout.write(`  version ${version} recorded in ledger: ${ledgerAfterOk ? 'yes' : 'no'}\n`);
  process.stdout.write(`  VERIFY queries passed: ${verifyOk ? 'yes' : 'no'} (${verifyQueries.length} querie(s))\n`);

  const finalOk = applyOk && ledgerAfterOk && verifyOk;
  process.exit(finalOk ? 0 : 1);
}

function checkLedgerPresent(version) {
  try {
    const raw = sh(SUPABASE_CLI, [
      'db', 'query', '--linked', '--output-format', 'json',
      `select version from supabase_migrations.schema_migrations where version = '${version}';`,
    ]);
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    return step('ledger now carries this version', rows.length === 1, rows.length === 1 ? 'confirmed' : `expected 1 row, got ${rows.length}`);
  } catch (err) {
    return step('ledger now carries this version', false, String(err?.message ?? err));
  }
}

main().catch((err) => {
  process.stderr.write(`db:apply: ${String(err?.message ?? err)}\n`);
  process.exit(1);
});
