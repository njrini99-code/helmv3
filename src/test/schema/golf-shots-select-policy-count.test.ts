// =============================================================================
// `golf_shots` must not regrow a redundant SELECT policy.
//
// Four permissive SELECT policies were OR'd together on this table, producing a
// filter chain Postgres cannot push a `round_id IN (...)` predicate through. It
// scanned golf_shots by primary key and evaluated the chain per row; the
// correlated EXISTS ran 13,233 times for a single 1,000-row page.
//
// Measured in production 2026-08-17, same data, same moment, only the role
// differing:
//
//     service role (RLS bypassed)      4.1 ms        187 buffers
//     authenticated coach (RLS on)  2,387.0 ms    263,519 buffers      580x
//
// `fetchShotDriversByCategory` reads this table under a 5,000 ms best-effort
// budget and, when it trips, returns undefined so the caller continues WITHOUT
// shot drivers — silently. Production logged 35 such aborts. Those drivers are
// what make an insight say "you miss short and right from 175+ out of the
// rough" instead of "your approach play is weak", so the visible symptom is
// insights losing their root-cause layer for the players with the most data.
//
// `20260817121500_golf_shots_select_policy_perf.sql` drops the two redundant
// policies. Proven identical by exact visible-row-set comparison (EXCEPT both
// ways, in a rolled-back transaction):
//
//     coach  (Nick Rini)     before 6,909  after 6,909  lost 0  gained 0
//     player (Cole Bennett)  before 6,909  after 6,909  lost 0  gained 0
//
// Result: 2,387 ms -> 69 ms, 263,519 -> 14,828 buffers.
//
// WHY THIS TEST EXISTS. The failure mode is additive: someone adds a policy to
// grant a new audience access, it works, and the read silently gets slower for
// everyone — with no error, and a degradation path that swallows itself. There
// is nothing in CI that would notice. This is a budget on the SELECT policy
// count for this one table, not a ban on ever changing access: raising the
// budget is a deliberate edit, and the comment above tells whoever raises it
// what it costs.
//
// Reads the migrations rather than the live database, like its siblings in this
// directory — it must fail in CI, where there is no production connection.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

/** Every migration file, oldest first — policy state is the replay of all of them. */
function migrationsInOrder(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
}

/**
 * Replay CREATE/DROP POLICY across the migration history for one table and
 * return the SELECT policies still standing.
 *
 * Identifiers may be quoted and schema-qualified — the baseline dump writes
 * `CREATE POLICY "golf_shots_select" ON "public"."golf_shots"`, and a pattern
 * that only matched the bare form found nothing and reported the granting
 * policy missing. That was the parser being wrong, not the schema.
 *
 * Deliberately simple string matching: these migrations are hand-written DDL,
 * not generated, and a parser sophisticated enough to be wrong in a surprising
 * way would be worse than one whose failure mode is obvious.
 */
function liveSelectPolicies(table: string): Set<string> {
  const live = new Set<string>();

  for (const { sql } of migrationsInOrder()) {
    const createRe = new RegExp(
      String.raw`CREATE\s+POLICY\s+"?([\w ]+?)"?\s+ON\s+(?:"?public"?\.)?"?${table}"?([\s\S]*?);`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      const name = m[1]?.trim();
      const body = m[2] ?? '';
      if (!name) continue;
      // FOR SELECT, or no FOR clause at all (which means ALL, and includes SELECT).
      if (/FOR\s+SELECT/i.test(body) || !/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i.test(body)) {
        live.add(name);
      }
    }

    const dropRe = new RegExp(
      String.raw`DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([\w ]+?)"?\s+ON\s+(?:"?public"?\.)?"?${table}"?`,
      'gi',
    );
    while ((m = dropRe.exec(sql)) !== null) {
      const name = m[1]?.trim();
      if (name) live.delete(name);
    }
  }

  return live;
}

describe('golf_shots SELECT policies stay collapsed', () => {
  it('does not re-create the two policies proven redundant', () => {
    const live = liveSelectPolicies('golf_shots');
    // `golf_shots_select` is a strict superset of both: it admits a row whose
    // round is owned by the player OR coached by the caller OR played-for by
    // the caller, which covers _own (the first) and _team (the second). Their
    // only extra reach was a `hole_id IN (...)` path, equivalent because every
    // shot's hole belongs to its own round — verified across 23,988 rows: 0
    // null round_id, 0 null hole_id, 0 hole/round mismatches.
    expect(live.has('golf_shots_select_own')).toBe(false);
    expect(live.has('golf_shots_select_team')).toBe(false);
  });

  it('keeps the policy that actually grants access', () => {
    // Guards the other direction: a "cleanup" that dropped all three would make
    // this table unreadable to every non-admin, and the test above alone would
    // still pass.
    expect(liveSelectPolicies('golf_shots').has('golf_shots_select')).toBe(true);
  });

  it('holds the SELECT policy count at or below the measured-safe budget', () => {
    const live = liveSelectPolicies('golf_shots');
    // Two: `golf_shots_select` plus `admin_read_all`. Each additional permissive
    // policy is another OR branch the planner must satisfy before it can use
    // idx_golf_shots_round_id_covering — that is what cost 580x. If you need a
    // third, widen `golf_shots_select` instead, and re-measure with the
    // EXPLAIN recipe in the migration header before changing this number.
    expect(live.size).toBeLessThanOrEqual(2);
  });
});
