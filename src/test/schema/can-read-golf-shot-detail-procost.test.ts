// =============================================================================
// `can_read_golf_shot_detail` must not silently fall back to the default
// planner cost.
//
// The function (20260728030000_shot_detail_rls_correlated.sql) is the
// SECURITY DEFINER RLS helper behind `putt_details_select` and
// `approach_miss_details_select`. SECURITY DEFINER functions are never
// inlined, so the planner treats it as an opaque black box and prices it at
// whatever `pg_proc.procost` says — the type default, COST 100, when a
// function definition doesn't specify one.
//
// COST 100 badly understates this function's real cost (a five-way JOIN plus
// up to three nested helper-function calls), which led the planner to favor
// a seq-scan-fed merge join over the existing shot_id indexes on the theory
// that a "cheap" filter run early would prune rows before expensive work —
// backwards, since the filter WAS the expensive part.
// `20260821035329_can_read_golf_shot_detail_planner_cost.sql` raises COST to
// 10000, measured via EXPLAIN ANALYZE on production: 877 ms -> 105 ms (8.3x),
// same query, same data, only procost differing.
//
// WHY THIS TEST EXISTS. `CREATE OR REPLACE FUNCTION` does not preserve
// attributes it doesn't restate — anything the new statement omits reverts to
// the type default, it does not inherit the value the function already had.
// The function's OWN defining migration, 20260728030000, illustrates the
// trap directly: its `CREATE OR REPLACE FUNCTION public.can_read_golf_shot_detail`
// carries no COST clause, so replaying that migration BY ITSELF after this
// one would silently reset procost to 100 and reopen the regression with no
// error, no failed migration, nothing but a query that got slow again. This
// test replays the full migration history's effect on procost, the same way
// its sibling `golf-shots-select-policy-count.test.ts` replays policy state,
// so a future CREATE OR REPLACE that forgets to restate COST fails CI instead
// of production.
//
// Reads the migrations rather than the live database, like its siblings in
// this directory — it must fail in CI, where there is no production
// connection.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const FUNCTION_NAME = 'can_read_golf_shot_detail';

/** Postgres's type default for a function with no COST clause (see CREATE
 *  FUNCTION docs): "roughly 100 times the cost of a simple operator". */
const PG_DEFAULT_FUNCTION_COST = 100;

/** Every migration file, oldest first — procost is the replay of all of them. */
function migrationsInOrder(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
}

/**
 * Replay every statement that can set `can_read_golf_shot_detail`'s planner
 * cost, across the full migration history, in file order (and in the order
 * each statement appears within a file). Returns the final effective COST,
 * or `null` if no migration has created the function at all.
 *
 * Two statement shapes matter:
 *   - `CREATE [OR REPLACE] FUNCTION public.can_read_golf_shot_detail(...) ...
 *     AS $$ ... $$` — resets cost to whatever COST clause the statement
 *     itself carries between the parameter list and `AS`, or to the type
 *     default (100) if it carries none. This is the trap: CREATE OR REPLACE
 *     does not inherit the function's PREVIOUS cost, it re-specifies the
 *     whole definition from scratch.
 *   - `ALTER FUNCTION public.can_read_golf_shot_detail(...) ... COST <n>` —
 *     a metadata-only change; sets cost to `<n>` without touching anything
 *     else about the function.
 *
 * Deliberately simple string matching, like `liveSelectPolicies` in
 * `golf-shots-select-policy-count.test.ts`: these migrations are hand-written
 * DDL, not generated, and a parser sophisticated enough to be wrong in a
 * surprising way would be worse than one whose failure mode is obvious.
 */
function replayShotDetailCost(): number | null {
  let cost: number | null = null;

  // One pass per file, one pass over each file's statements in the order
  // they appear in the source text — mirrors how a migration replay actually
  // executes.
  const statementRe = new RegExp(
    // Branch 1: CREATE [OR REPLACE] FUNCTION public.can_read_golf_shot_detail(...)
    //   <attribute clauses> AS $tag$ ... $tag$ / $$ ... $$
    // Captures the attribute-clause text (group 1) so its own COST can be
    // read out, or its absence used to fall back to the default.
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?${FUNCTION_NAME}"?\s*\([^)]*\)([\s\S]*?)AS\s+(\$[\w]*\$)[\s\S]*?\2` +
      '|' +
      // Branch 2: ALTER FUNCTION public.can_read_golf_shot_detail(...) ... COST <n>
      String.raw`ALTER\s+FUNCTION\s+(?:"?public"?\.)?"?${FUNCTION_NAME}"?\s*\([^)]*\)[^;]*?COST\s+(\d+)`,
    'gi',
  );

  for (const { sql } of migrationsInOrder()) {
    let m: RegExpExecArray | null;
    statementRe.lastIndex = 0;
    while ((m = statementRe.exec(sql)) !== null) {
      const createAttrs = m[1];
      const alterCost = m[3];
      if (createAttrs !== undefined) {
        // CREATE [OR REPLACE] branch matched. Re-specifies the whole
        // definition — an inline COST wins, anything else resets to default.
        const inlineCost = /\bCOST\s+(\d+)\b/i.exec(createAttrs);
        cost = inlineCost && inlineCost[1] ? Number(inlineCost[1]) : PG_DEFAULT_FUNCTION_COST;
      } else if (alterCost !== undefined) {
        cost = Number(alterCost);
      }
    }
  }

  return cost;
}

describe('can_read_golf_shot_detail planner cost stays raised', () => {
  it('is created at all (sanity check on the parser, not just the value)', () => {
    expect(replayShotDetailCost()).not.toBeNull();
  });

  it('holds procost at the production-measured 10000, not the type default', () => {
    // If this regresses to 100, either the tuning migration
    // (20260821035329_can_read_golf_shot_detail_planner_cost.sql) was
    // reverted/removed, or a LATER migration re-ran
    // `CREATE OR REPLACE FUNCTION public.can_read_golf_shot_detail` without
    // restating COST — both silently reopen the 877ms/8.3x regression this
    // migration fixed, with no failing migration and no error anywhere.
    expect(replayShotDetailCost()).toBe(10000);
  });

  // Direct proof of the trap the comment above describes, independent of the
  // real migration files: a bare CREATE OR REPLACE with no COST clause reads
  // as the type default, not as "unchanged". If this ever started reading as
  // "unchanged" (e.g. from a parser or Postgres-semantics misunderstanding),
  // the two tests above would stop being a meaningful regression guard even
  // though the current files pass them today.
  it('parses a COST-less CREATE OR REPLACE as a reset to the type default', () => {
    const before = replayShotDetailCost();
    expect(before).toBe(10000);

    const syntheticSql = `
      CREATE OR REPLACE FUNCTION public.can_read_golf_shot_detail(p_shot_id uuid)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $$
        SELECT true;
      $$;
    `;
    const combined = [
      ...migrationsInOrder(),
      { file: 'zz_synthetic_regression.sql', sql: syntheticSql },
    ];

    // Re-implements just the fold over an explicit list (rather than calling
    // replayShotDetailCost(), which re-reads the real directory) so this
    // case can append one synthetic statement after the real history without
    // writing a file to disk.
    let cost: number | null = null;
    const statementRe = new RegExp(
      String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?${FUNCTION_NAME}"?\s*\([^)]*\)([\s\S]*?)AS\s+(\$[\w]*\$)[\s\S]*?\2` +
        '|' +
        String.raw`ALTER\s+FUNCTION\s+(?:"?public"?\.)?"?${FUNCTION_NAME}"?\s*\([^)]*\)[^;]*?COST\s+(\d+)`,
      'gi',
    );
    for (const { sql } of combined) {
      let m: RegExpExecArray | null;
      statementRe.lastIndex = 0;
      while ((m = statementRe.exec(sql)) !== null) {
        const createAttrs = m[1];
        const alterCost = m[3];
        if (createAttrs !== undefined) {
          const inlineCost = /\bCOST\s+(\d+)\b/i.exec(createAttrs);
          cost = inlineCost && inlineCost[1] ? Number(inlineCost[1]) : PG_DEFAULT_FUNCTION_COST;
        } else if (alterCost !== undefined) {
          cost = Number(alterCost);
        }
      }
    }

    expect(cost).toBe(PG_DEFAULT_FUNCTION_COST);
  });
});
