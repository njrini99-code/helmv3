// =============================================================================
// Every Postgres function the app calls via `.rpc()` must be created by a TRACKED
// migration.
//
// WHY THIS EXISTS — closing a class, not chasing one bug.
//
// Repointing the required BaseballHelm smoke gate from production to a fresh
// database (PR #1125) found three defects that had each been live for a month or
// more, unrelated in mechanism and identical in why nothing caught them: **CI only
// ever exercised production, where the missing piece already existed.**
//
//   1. `on_auth_user_created` on `auth.users` — in no tracked migration, so signup
//      never created the `public.users` row on a DB built from migrations.
//   2. The `avatars` storage bucket + its 4 policies — likewise untracked, and on
//      the golf onboarding path.
//   3. The demo seed never wrote `baseball_team_coach_staff`, so the demo coach
//      belonged to no team and every authenticated page was blank.
//
// An `.rpc()` target is the same shape of dependency: if the function is not
// created by a migration, every database built from migrations answers
// `function ... does not exist` at runtime. This sweep found that 63 of 65 RPCs
// the app calls ARE tracked — so the class was nearly clean, and now it stays that
// way.
//
// Source-text on purpose. A database test cannot catch a missing function, because
// it runs against a database somebody already provisioned — which is exactly why
// the pgTAP suites saw none of the three defects above.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const SRC_DIR = join(REPO_ROOT, 'src');

const RPC_CALL = /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;

/**
 * RPCs the app calls that no tracked migration creates AND that production does
 * not have either — verified by read-only SQL against production 2026-07-30:
 * `pg_proc` returns zero rows for both names in any schema.
 *
 * Both live in `src/app/baseball/actions/recruiting-philosophy.ts`, a SUNSET
 * recruiting surface, inside exported functions that nothing calls:
 * `recalculatePercentiles` (line 344) and the match-score path (line 398). The one
 * consumer of that module,
 * `settings/recruiting-preferences/recruiting-preferences-client.tsx`, imports only
 * `saveRecruitingPhilosophy`. So these are DORMANT — a call that would fail if it
 * were reachable, in code that is not.
 *
 * Deliberately not fixed: authoring the two functions would be building out a
 * feature that is intentionally hidden, and deleting the call sites would delete
 * recruiting code. Recorded instead, with a stale-entry test so the lines cannot
 * outlive the defect.
 */
const KNOWN_MISSING_RPCS = new Set<string>([
  'calculate_grad_year_percentiles',
  'calculate_player_match_score',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function rpcCallsInSource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(SRC_DIR)) {
    // Tests call RPCs against mocks and fixtures; those names address nothing.
    if (/(^|[\\/])(__tests__|test)[\\/]/.test(file) || /\.(test|spec)\.tsx?$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    RPC_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RPC_CALL.exec(text)) !== null) {
      const fn = m[1];
      if (!fn) continue;
      const rel = file.slice(REPO_ROOT.length + 1);
      const at = found.get(fn) ?? [];
      if (!at.includes(rel)) at.push(rel);
      found.set(fn, at);
    }
  }
  return found;
}

function migrationsBlob(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

describe('RPC functions the app calls are created by tracked migrations', () => {
  const called = rpcCallsInSource();
  const blob = migrationsBlob();

  /** True when some migration declares this function in the public schema. */
  function isTracked(fn: string): boolean {
    const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+("?public"?\\.)?"?${escaped}"?\\s*\\(`,
      'i',
    ).test(blob);
  }

  it('finds RPC calls in the source at all (guards a vacuous pass)', () => {
    // If the walk or the regex breaks, `called` empties and everything below
    // passes without checking anything.
    expect(
      [...called.keys()].length,
      'No .rpc() calls found in src/ — the detector is broken, not the code',
    ).toBeGreaterThan(20);
  });

  it('creates every called RPC in a tracked migration', () => {
    const untracked: string[] = [];
    for (const [fn, files] of called) {
      if (KNOWN_MISSING_RPCS.has(fn)) continue;
      if (!isTracked(fn)) untracked.push(`${fn}  (called from ${files.join(', ')})`);
    }

    expect(
      untracked,
      'These Postgres functions are called via .rpc() but created by NO tracked ' +
        'migration. Production may have them (applied out of band), but any database ' +
        'built from supabase/migrations/ — supabase start, a preview branch, a ' +
        'restore drill — will answer "function does not exist" at runtime. ' +
        'Do NOT add an entry to KNOWN_MISSING_RPCS to make this pass: that list is ' +
        'for functions production does not have either, each with its evidence.',
    ).toEqual([]);
  });

  it('keeps KNOWN_MISSING_RPCS free of stale entries', () => {
    const stale = [...KNOWN_MISSING_RPCS].filter((fn) => isTracked(fn) || !called.has(fn));
    expect(
      stale,
      'These KNOWN_MISSING_RPCS entries are now created by a migration, or are no ' +
        'longer called from src/ at all. Delete their lines.',
    ).toEqual([]);
  });
});
