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
 *   (e) Dry-run: print the exact SQL body that --apply would send.
 *   (f) With --apply: sends that one body via `supabase db query --linked
 *       --file`, re-reads the ledger, runs the migration's own `-- VERIFY:`
 *       queries (continuation lines joined until `;`, each query must return
 *       >=1 row), and prints a recorded-vs-applied table.
 *
 * Why not `db push`: `supabase db push` applies EVERY pending migration, and
 * `--include-all=false` does not narrow that to one file — it only excludes
 * migrations OLDER than the remote ledger tip. With ten files pending, the
 * old step (f) would have swept nine unreviewed ones into production
 * alongside the named one; the workflow's sweep guard existed solely to
 * catch that. `db query --linked --file` is the single-file primitive
 * `db push` never had.
 *
 * What actually executes is the reviewed migration file byte for byte, plus
 * ONE appended `insert` recording the version in the ledger — the row
 * `db push` would have written. No `begin;`/`commit;` is added: the
 * Management API that backs `--linked` already runs a multi-statement body
 * inside one transaction (probed with `set_config(..., is_local := true)`,
 * whose value set by the first statement is visible to the second), so the
 * migration and its ledger row commit or roll back together. Adding an
 * explicit `commit;` would close that outer transaction early instead.
 *
 * The single-transaction wrapping is also why a migration containing
 * CONCURRENTLY is refused below rather than half-applied.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/**
 * The basename is interpolated into the ledger INSERT, so it is constrained
 * before it gets there rather than escaped afterwards. This is the same shape
 * `.github/workflows/db-apply.yml` validates; enforced here too so the script
 * is safe when run directly, not only through the workflow.
 */
export function isValidMigrationFilename(fileBasename) {
  return /^\d{14}_[a-z0-9_]+\.sql$/.test(fileBasename);
}

function checkFilename(fileBasename) {
  const ok = isValidMigrationFilename(fileBasename);
  return step(
    'filename is <14-digit version>_<name>.sql',
    ok,
    ok ? fileBasename : `'${fileBasename}' does not match — refusing to build a ledger row from it`,
  );
}

/**
 * The Management API runs the whole body in one transaction, and CONCURRENTLY
 * cannot run inside a transaction block. Refuse up front: the alternative is
 * an error partway through a body whose earlier statements have already been
 * staged, which is exactly the half-applied state this path exists to avoid.
 *
 * Whole-line `--` comments are stripped, trailing ones are not, so a code line
 * ending `-- CONCURRENTLY ...` trips this and refuses a fine file. Fail-closed
 * on purpose: the cost is one manual review, the alternative a half-apply.
 */
export function hasConcurrently(fileText) {
  const sql = fileText.replace(/^\s*--.*$/gm, '');
  return /\bCONCURRENTLY\b/i.test(sql);
}

function checkNoConcurrently(fileText) {
  const found = hasConcurrently(fileText);
  return step(
    'no CONCURRENTLY (cannot run inside a transaction)',
    !found,
    found ? 'this file needs to be applied outside a transaction — not via this path' : '',
  );
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

  // Scoped to the one path on purpose. The unscoped
  // `git log origin/main --name-only --pretty=format:` this replaced emitted
  // 2.28 MB against execFileSync's 1 MB default maxBuffer, so it threw
  // ENOBUFS on every invocation and the catch turned that into a permanent
  // FAIL — the check could not pass for any file, which is fail-closed but
  // also means it verified nothing. Raising maxBuffer only moves the cliff;
  // `rev-list -1 -- <path>` is bounded by one commit id regardless of repo
  // size, and is correct under squash-merge (the add commit is on main).
  let inOriginMainLog = false;
  try {
    const rev = sh('git', [
      'rev-list', '-1', 'origin/main', '--', `supabase/migrations/${fileBasename}`,
    ]);
    inOriginMainLog = rev.trim() !== '';
  } catch {
    inOriginMainLog = false;
  }
  ok = step('migration file is in git log origin/main (merged)', inOriginMainLog) && ok;

  return ok;
}

/**
 * True when HELD.md's register marks `fileBasename` HOLD or OBSOLETE.
 *
 * Parses the table row by row rather than matching one regex across the whole
 * document, because the register's real rows break both assumptions the old
 * regex made:
 *
 *   - **Qualified statuses.** It required a literal `**HOLD**`, so
 *     `**HOLD — R3, not yet reviewed**` did not match. Merged-but-held
 *     migrations passed the gate for this reason alone.
 *   - **Grouped rows.** A migration cell may list several files
 *     (`A.sql + B.sql + C.sql`). The old pattern demanded a `|` immediately
 *     before the basename, so only the first file in a group was ever seen.
 *
 * The status is anchored at the START of the status cell and allowed trailing
 * qualifier text. Anchoring matters: rows like
 * `**APPLIED 2026-09-03 — R3 — hold discharged**` contain the word "hold" and
 * must NOT be treated as held — a substring search would block migrations
 * whose hold was correctly discharged.
 *
 * Exported for the unit test; not part of the CLI surface.
 */
export function isHeldInRegister(heldText, fileBasename) {
  for (const line of heldText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
    if (cells.length < 2) continue;

    // The migration cell may name several files joined by `+`, each optionally
    // wrapped in backticks. Compare whole tokens so one basename can never
    // match as a substring of another.
    const named = cells[0]
      .split(/[+,]/)
      .map((token) => token.replace(/`/g, '').trim())
      .filter(Boolean);
    if (!named.includes(fileBasename)) continue;

    if (/^\*\*(HOLD|OBSOLETE)\b/i.test(cells[1].trim())) return true;
  }
  return false;
}

/** (b) Not HOLD in HELD.md, unless overridden with a reason. */
function checkNotHeld(fileBasename, heldOverride, reason) {
  if (!existsSync(HELD_PATH)) {
    return step('HELD.md check', true, 'HELD.md not found — nothing to check against');
  }
  const heldText = readFileSync(HELD_PATH, 'utf-8');
  const isHeld = isHeldInRegister(heldText, fileBasename);

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

/**
 * The exact body `--apply` sends: the reviewed migration verbatim, then the
 * one ledger row. `name` is the filename with its 14-digit version prefix and
 * `.sql` suffix removed, matching what `db push` records.
 *
 * Safe to interpolate: `checkFilename` has already refused any basename
 * outside `^\d{14}_[a-z0-9_]+\.sql$`, so neither value can carry a quote.
 */
export function buildApplyBody(fileBasename, fileText) {
  const version = fileBasename.split('_')[0];
  const name = fileBasename.replace(/^\d{14}_/, '').replace(/\.sql$/, '');
  const ledgerInsert =
    'insert into supabase_migrations.schema_migrations (version, name)\n' +
    `values ('${version}', '${name}');`;
  return `${fileText.replace(/\s*$/, '')}\n\n-- db:apply — record this file in the ledger, in the same transaction.\n${ledgerInsert}\n`;
}

/** (e) Print the exact body --apply would send. The plan IS the payload. */
function printPlan(body) {
  process.stdout.write(
    `\n--- SQL that --apply sends via 'supabase db query --linked --file' ---\n${body}\n--- end of plan ---\n`,
  );
  return step('plan generated', true, `${body.split('\n').length} line(s)`);
}

/**
 * Extract `-- VERIFY:` queries from the migration file header.
 *
 * Continuation lines are joined until a `;`, because migrations in this repo
 * already write multi-line blocks:
 *
 *     -- VERIFY: select 1 from information_schema.columns
 *     -- VERIFY:  where table_schema = 'public'
 *     -- VERIFY:    and column_name = 'muted_until';
 *
 * One-line-one-query would run `where table_schema = 'public'` as a standalone
 * statement (a syntax error) and, worse, run the bare
 * `select 1 from information_schema.columns` as its own query — which returns
 * rows for ANY database and so PASSES while asserting nothing.
 *
 * This mattered only in theory until the origin/main reachability check above
 * was fixed: every apply died at preflight before reaching VERIFY. Now that it
 * can get here, the bug is live, and VERIFY is the only partial-commit
 * detector this path has (it runs even when the apply reports failure).
 *
 * A trailing fragment with no `;` is still returned rather than dropped, so a
 * malformed block fails loudly instead of silently shrinking the check set.
 *
 * Exported for the unit test; not part of the CLI surface.
 */
export function extractVerifyQueries(fileText) {
  const fragments = fileText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^--\s*VERIFY:/i.test(l))
    .map((l) => l.replace(/^--\s*VERIFY:\s*/i, '').trim())
    .filter(Boolean);

  const queries = [];
  let buffer = '';
  for (const fragment of fragments) {
    buffer = buffer ? `${buffer} ${fragment}` : fragment;
    if (buffer.endsWith(';')) {
      queries.push(buffer);
      buffer = '';
    }
  }
  if (buffer) queries.push(buffer);
  return queries;
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
  ok = checkFilename(fileBasename) && ok;
  ok = checkNoConcurrently(fileText) && ok;
  ok = checkGitState(fileBasename) && ok;
  ok = checkNotHeld(fileBasename, args.heldOverride, args.reason) && ok;
  ok = checkLedger(version) && ok;

  if (!ok) {
    process.stderr.write('\ndb:apply: one or more preconditions FAILed. Stopping before touching production.\n');
    process.exit(1);
  }

  printPitrMarker();
  const applyBody = buildApplyBody(fileBasename, fileText);
  ok = printPlan(applyBody) && ok;

  if (!args.apply) {
    process.stdout.write('\ndb:apply: dry run complete. Re-run with --apply to send the plan above for real.\n');
    process.exit(ok ? 0 : 1);
  }

  process.stdout.write(`\n--- APPLYING ${fileBasename} ---\n`);
  let applyOk = true;
  // A temp dir, not the repo: the body is a build artifact and the worktree is
  // shared. Removed in `finally` so a failed apply leaves nothing behind.
  const scratch = mkdtempSync(join(tmpdir(), 'helm-db-apply-'));
  const bodyPath = join(scratch, fileBasename);
  try {
    writeFileSync(bodyPath, applyBody, 'utf-8');
    const out = sh(SUPABASE_CLI, ['db', 'query', '--linked', '--file', bodyPath]);
    process.stdout.write(out + '\n');
    applyOk = step('supabase db query --linked --file (single migration)', true);
  } catch (err) {
    applyOk = step(
      'supabase db query --linked --file (single migration)',
      false,
      String(err?.stdout ?? err?.message ?? err),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  // Deliberately NOT an early exit on !applyOk. The apply can report failure
  // after the server already committed (an API timeout on the response, say),
  // so the ledger re-read and the VERIFY queries below are the partial-commit
  // detector — they have to run either way.

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

// Entrypoint guard: without it, importing this module to test the pure
// helpers above would run main() and start talking to production.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`db:apply: ${String(err?.message ?? err)}\n`);
    process.exit(1);
  });
}
