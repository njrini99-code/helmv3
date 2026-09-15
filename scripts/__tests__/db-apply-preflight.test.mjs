/**
 * Preflight checks in `scripts/db/apply.mjs` — the only sanctioned path from a
 * merged migration file to production.
 *
 * Both defects covered here were found the same way: every dry run against the
 * twelve migrations sitting unapplied on 2026-09-08 failed at preflight, and
 * neither failure was about the migrations.
 *
 *   (a) The reachability check shelled out to
 *       `git log origin/main --name-only --pretty=format:`, whose output is
 *       2.28 MB in this repo against execFileSync's 1 MB default maxBuffer. It
 *       threw ENOBUFS on every invocation, the catch turned that into FAIL,
 *       and so `db:apply` could not succeed for ANY file. Fail-closed, but a
 *       check that always fails verifies nothing.
 *
 *   (b) The HELD.md check matched a literal `**HOLD**` anywhere in the
 *       document, anchored to a `|` immediately before the basename. Real
 *       register rows use qualified statuses (`**HOLD — R3, not yet
 *       reviewed**`) and group several files into one row
 *       (`A.sql + B.sql + C.sql`). Merged-but-held migrations passed the hold
 *       gate. That is the dangerous direction: it lets an unreviewed
 *       privileged migration through.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractVerifyQueries, isHeldInRegister } from '../db/apply.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY_SRC = join(REPO_ROOT, 'scripts/db/apply.mjs');
const HELD_MD = join(REPO_ROOT, 'supabase/migrations/HELD.md');

/** The exact pattern apply.mjs used before this fix, kept as a regression witness. */
function heldByOldRegex(heldText, basename) {
  const rowRe = new RegExp(
    '\\|\\s*`?' +
      basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '`?[^|]*\\|\\s*\\*\\*(HOLD|OBSOLETE)\\*\\*',
    'i',
  );
  return rowRe.test(heldText);
}

// Qualified status in its own row.
const QUALIFIED_SINGLE = [
  '20260903150000_helm_debug_agent_runs.sql',
  '20260906120000_narrow_admin_event_purge_pg_cron.sql',
  '20260906140000_helm_jobs_pgmq_queues.sql',
  '20260906141000_helm_jobs_pg_cron_consume_variant.sql',
  '20260906142000_pgaudit_ddl_role_only.sql',
];

// Members of a grouped row. The old anchor could reach only the first.
const GROUPED_MEMBERS = [
  '20260906115900_helm_debug_stat_statements_snapshot_min_exec.sql',
  '20260906120010_helm_debug_db_statement_samples.sql',
  '20260906120100_helm_debug_db_analysis_samples.sql',
  '20260906120200_helm_debug_observability_retention_v3.sql',
];

// The nine files staged with -- VERIFY: headers in this change. The baseball
// trio below is held for unrelated reasons and was deliberately left alone.
const STAGED_WITH_VERIFY = [...QUALIFIED_SINGLE, ...GROUPED_MEMBERS];

// Bare `**HOLD**` — the only shape the old regex handled.
const BARE_HOLD = [
  '20260905090000_baseball_camp_registrations_lifecycle_timestamps.sql',
  '20260905091000_baseball_timeline_event_acks_user_id_columns.sql',
  '20260905092000_baseball_elite_stat_event_columns_gap.sql',
];

describe('isHeldInRegister', () => {
  const register = readFileSync(HELD_MD, 'utf-8');

  it.each([...QUALIFIED_SINGLE, ...GROUPED_MEMBERS, ...BARE_HOLD])(
    'detects %s as held in the real register',
    (basename) => {
      expect(isHeldInRegister(register, basename)).toBe(true);
    },
  );

  it.each([...QUALIFIED_SINGLE, ...GROUPED_MEMBERS])(
    'the old regex missed %s — this is the regression being locked',
    (basename) => {
      // Every one of these carries a qualified status (`**HOLD — ...**`), so
      // the old literal `**HOLD**` match failed even on a grouped row's first
      // member, where the anchor itself was satisfied.
      expect(heldByOldRegex(register, basename)).toBe(false);
    },
  );

  it('still detects the bare **HOLD** rows the old regex already caught', () => {
    for (const basename of BARE_HOLD) {
      expect(heldByOldRegex(register, basename)).toBe(true);
      expect(isHeldInRegister(register, basename)).toBe(true);
    }
  });

  it('does not flag a row whose hold was discharged', () => {
    // The substring "hold" appears in this status. Matching it would block a
    // migration that was correctly applied — the false positive the anchored
    // status check exists to prevent.
    const row =
      '| `20260903180000_x.sql` + `20260903180100_y.sql` | **APPLIED 2026-09-03 — R3 — hold discharged** | why | when |';
    expect(isHeldInRegister(row, '20260903180000_x.sql')).toBe(false);
    expect(isHeldInRegister(row, '20260903180100_y.sql')).toBe(false);
  });

  it('does not flag VERIFIED APPLIED rows', () => {
    const row = '| `20260821043500_single_flight_round_submit.sql` | **VERIFIED APPLIED** | why | when |';
    expect(isHeldInRegister(row, '20260821043500_single_flight_round_submit.sql')).toBe(false);
    expect(
      isHeldInRegister(register, '20260821043500_single_flight_round_submit.sql'),
    ).toBe(false);
  });

  it('matches whole filename tokens, never substrings', () => {
    const row = '| `20260906120100_helm_debug_db_analysis_samples.sql` | **HOLD** | why | when |';
    expect(isHeldInRegister(row, '20260906120100_helm_debug_db_analysis_samples.sql')).toBe(true);
    expect(isHeldInRegister(row, 'helm_debug_db_analysis_samples.sql')).toBe(false);
    expect(isHeldInRegister(row, '20260906120100_helm_debug_db_analysis.sql')).toBe(false);
  });

  it('ignores non-table prose and returns false for an unlisted migration', () => {
    expect(isHeldInRegister(register, '20260907160000_golf_team_chat_membership_management.sql')).toBe(
      false,
    );
    expect(isHeldInRegister('no table here at all', 'anything.sql')).toBe(false);
  });
});

describe('extractVerifyQueries', () => {
  it('joins continuation lines into one query, up to the semicolon', () => {
    const text = [
      "-- VERIFY: select 1 from information_schema.columns",
      "-- VERIFY:  where table_schema = 'public'",
      "-- VERIFY:    and column_name = 'muted_until';",
    ].join('\n');
    expect(extractVerifyQueries(text)).toEqual([
      "select 1 from information_schema.columns where table_schema = 'public' and column_name = 'muted_until';",
    ]);
  });

  it('would otherwise run a bare unfiltered SELECT that passes while asserting nothing', () => {
    // The regression this locks: line-per-query turns the first line of a
    // multi-line block into `select 1 from information_schema.columns`, which
    // returns rows against any database at all.
    const text = "-- VERIFY: select 1 from information_schema.columns\n-- VERIFY:  where table_name = 'x';";
    const [only] = extractVerifyQueries(text);
    expect(extractVerifyQueries(text)).toHaveLength(1);
    expect(only).toContain("where table_name = 'x'");
  });

  it('keeps single-line queries separate', () => {
    const text = '-- VERIFY: select 1 from a;\n-- VERIFY: select 1 from b;';
    expect(extractVerifyQueries(text)).toEqual(['select 1 from a;', 'select 1 from b;']);
  });

  it('returns an unterminated trailing fragment rather than dropping it', () => {
    // Silently dropping it would shrink the check set without saying so.
    expect(extractVerifyQueries('-- VERIFY: select 1 from a')).toEqual(['select 1 from a']);
  });

  it('tolerates indentation and ignores non-VERIFY comments', () => {
    const text = '-- some prose\n   -- VERIFY: select 1 from a;\n-- more prose';
    expect(extractVerifyQueries(text)).toEqual(['select 1 from a;']);
  });

  it('parses every staged migration into semicolon-terminated queries', () => {
    for (const name of STAGED_WITH_VERIFY) {
      const sql = readFileSync(join(REPO_ROOT, 'supabase/migrations', name), 'utf-8');
      const queries = extractVerifyQueries(sql);
      expect(queries.length).toBeGreaterThan(0);
      for (const q of queries) expect(q.endsWith(';')).toBe(true);
    }
  });
});

describe('origin/main reachability check', () => {
  it('does not shell out to an unbounded whole-repo git log', () => {
    // `git log origin/main --name-only --pretty=format:` emits every path of
    // every commit — 2.28 MB here, past execFileSync's 1 MB default maxBuffer,
    // so it threw ENOBUFS and the check could never pass. Raising maxBuffer
    // only moves the cliff; the scoped `rev-list -1 -- <path>` is bounded by
    // one commit id no matter how large the repo gets.
    const src = readFileSync(APPLY_SRC, 'utf-8');
    const codeOnly = src
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(codeOnly).not.toContain("'--name-only'");
    expect(codeOnly).toContain("'rev-list', '-1', 'origin/main'");
  });
});
