// =============================================================================
// An RLS policy must not read the table it is ON. That is infinite recursion,
// and Postgres rejects EVERY query against the table — not just the branch that
// needs it.
//
// WHY THIS EXISTS. `20260527000000_prod_public_baseline.sql` creates
// `baseball_team_members_select` with a subquery over its own table:
//
//   OR EXISTS (SELECT 1 FROM baseball_players bp
//              JOIN baseball_team_members btm ON btm.player_id = bp.id
//              WHERE btm.team_id = baseball_team_members.team_id
//                AND bp.user_id = auth.uid())
//
// so any database built from these migrations answers
// `infinite recursion detected in policy for relation "baseball_team_members"`
// for every roster read. Production does NOT, because the predicate was replaced
// out of band with `is_baseball_team_member(team_id)` — a `SECURITY DEFINER`
// helper, which reads the table without re-entering RLS — and that fix was never
// committed. `20260730040000` finally commits it.
//
// THE FIX WAS KNOWN AND ONLY HALF-APPLIED, which is the part worth guarding
// against. `20260729000200`'s own comments trace the cycle in full and cite the
// baseline's line numbers:
//
//   baseball_players_select -> EXISTS over baseball_team_members
//     -> baseball_team_members_select -> reads baseball_players
//       -> baseball_players_select   <- loop
//
// The author routed `baseball_players_select` through a definer function to
// escape it, and left the other half of the cycle in place. So this is not an
// unknown failure mode in this repo; it is a known one that nothing enforced.
//
// WHERE IT ACTUALLY BITES. Not only CI. `supabase start`, Supabase preview
// branches, and — the serious one — a RESTORE OR REBUILD OF PRODUCTION FROM
// MIGRATIONS, which is the disaster-recovery path.
//
// Source-text on purpose, like its siblings in this directory: a database test
// cannot catch this, because it runs against a database somebody already
// provisioned — and if that database was patched out of band, as production was,
// the test passes while the migrations stay broken.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Strip SQL comments before matching.
 *
 * Not optional. `20260729000200` DOCUMENTS the recursive subquery inside its own
 * policy body to explain what it is avoiding, and `20260730040000` quotes it in a
 * header. A guard that reads prose as code fires on the documentation of the very
 * bug it is looking for — which is exactly what the first version of this sweep
 * did, reporting `baseball_players_select` as recursive when it is the fixed one.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * `CREATE POLICY <name> ON <table> … ;` blocks whose predicate does a FROM/JOIN
 * against `<table>` itself.
 *
 * Qualifying the policy's own row (`baseball_team_members.team_id`) is normal and
 * must NOT match — only pulling the table in as a new relation is recursion.
 */
const POLICY_BLOCK =
  /CREATE\s+POLICY\s+"?([a-z0-9_]+)"?\s+ON\s+"?(?:public"?\."?)?([a-z0-9_]+)"?([\s\S]*?);/gi;

interface SelfRef {
  file: string;
  table: string;
  policy: string;
}

function selfReferencingPolicies(): SelfRef[] {
  const out: SelfRef[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    POLICY_BLOCK.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = POLICY_BLOCK.exec(sql)) !== null) {
      const [, policy, table, body] = m;
      if (!policy || !table || !body) continue;
      const pulls = new RegExp(`\\b(FROM|JOIN)\\s+"?(?:public"?\\."?)?${table}"?[\\s(]`, 'i');
      if (pulls.test(body)) out.push({ file, table, policy });
    }
  }
  return out;
}

/**
 * The one historical instance, kept as an exception because the file that
 * contains it is an ALREADY-APPLIED migration and `migration-lockdown.yml` blocks
 * editing those. It is repaired forward by `20260730040000`, whose presence is
 * asserted below — so this entry cannot be used to wave the defect through.
 */
const KNOWN = new Set<string>([
  '20260527000000_prod_public_baseline.sql :: baseball_team_members.baseball_team_members_select',
]);

const REPAIR_MIGRATION = '20260730040000_baseball_team_members_select_recursion.sql';

describe('no RLS policy reads the table it is on', () => {
  const found = selfReferencingPolicies();

  it('parses policy blocks at all (guards a vacuous pass)', () => {
    // If the regex or the directory breaks, `found` empties and the main
    // assertion passes without checking anything.
    const anyPolicies = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .some((f) => /CREATE\s+POLICY/i.test(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')));
    expect(anyPolicies, 'no CREATE POLICY found anywhere — the detector is broken').toBe(true);
  });

  it('finds no NEW self-referencing policy', () => {
    const newOnes = found
      .map((f) => `${f.file} :: ${f.table}.${f.policy}`)
      .filter((k) => !KNOWN.has(k));

    expect(
      newOnes,
      'These policies read the table they are ON, which is infinite recursion: ' +
        'Postgres rejects EVERY query against the table, not just the branch that ' +
        'needs it. Route the lookup through a `STABLE SECURITY DEFINER` helper with ' +
        '`search_path` pinned (e.g. is_baseball_team_member) so it reads the table ' +
        'without re-entering RLS. Do NOT add an entry to KNOWN to make this pass.',
    ).toEqual([]);
  });

  it('keeps KNOWN free of stale entries', () => {
    const stale = [...KNOWN].filter(
      (k) => !found.some((f) => `${f.file} :: ${f.table}.${f.policy}` === k),
    );
    expect(stale, 'These KNOWN entries no longer match a real finding. Delete them.').toEqual([]);
  });

  it('ships the forward repair for the one known instance', () => {
    // The exception above is only defensible because a later migration fixes it.
    // If that repair is ever removed, the exception must not silently persist.
    const files = readdirSync(MIGRATIONS_DIR);
    expect(
      files,
      `${REPAIR_MIGRATION} is missing, so the KNOWN exception would leave every ` +
        'database built from these migrations with a broken baseball_team_members ' +
        'SELECT policy — including a restore of production.',
    ).toContain(REPAIR_MIGRATION);

    const repair = readFileSync(join(MIGRATIONS_DIR, REPAIR_MIGRATION), 'utf8');
    // It must replace the predicate with the definer call, and must be GUARDED so
    // applying it to production (which already has the fix) changes nothing.
    expect(repair).toMatch(/is_baseball_team_member\s*\(\s*team_id\s*\)/);
    expect(repair, 'the repair must check the live predicate before replacing it').toMatch(
      /pg_policies/,
    );
  });
});
