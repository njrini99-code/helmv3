import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every RPC the app calls must be declared by a migration.
 *
 * WHY THIS EXISTS. `supabase.rpc('does_not_exist')` compiles, type-checks, and
 * passes every test that mocks the client. It fails only in production, and in
 * this codebase the callers wrap the failure in `sanitizeDbError(...)`, so it
 * surfaces as a generic message rather than "that function was never written".
 *
 * Measured 2026-08-01: 65 distinct RPC names are called from src/. Two of them
 * — `calculate_grad_year_percentiles` and `calculate_player_match_score` — do
 * not exist in ANY schema, and no migration has ever mentioned them. They were
 * not lost; they were never authored. Both are reachable from live baseball
 * recruiting settings pages (#1183).
 *
 * Nothing could have caught it. Both call sites cast through `SupabaseAny`, so
 * even the generated database types are blind to them.
 *
 * STATIC CROSS-CHECK, like the realtime-publication and storage-bucket tests
 * next door: RPC names in src/ vs functions declared by migrations. It proves
 * intent is recorded in migrations, NOT that the migration has been applied —
 * `npm run db:drift:check` covers applied-vs-recorded, and this repo has a
 * documented history of migrations recorded but never run.
 */

const RPC_CALL_RE = /\.rpc\(\s*['"]([a-z0-9_]+)['"]/g;

/**
 * Migrations declare functions two ways, and the regex must catch both or this
 * test is a false-alarm generator:
 *   - hand-written migrations: CREATE OR REPLACE FUNCTION public.foo(...)
 *   - the baseline dump:       CREATE OR REPLACE FUNCTION "public"."foo"(...)
 * The baseline quotes every identifier, and it alone declares 133 functions —
 * an earlier draft of this regex missed the quoted form and reported 29 false
 * positives.
 *
 * THE `i` FLAG IS LORE, NOT STYLE. Hand-written migrations in this repo are not
 * consistent about case: `20260621130000_ingest_external_round_atomic.sql`
 * spells it `create or replace function public....` in lowercase. A
 * case-sensitive version of this regex reported that function as undeclared,
 * which was wrong — it is declared, and correctly revoked from anon. Do not
 * drop the flag.
 */
const FN_DECL_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"?(?:public"?\."?)?"?([a-z0-9_]+)"?\s*\(/gi;

/**
 * Called in src/ but declared by no migration. Each entry needs a reason, and
 * the second test below fails if an entry stops being true.
 */
const KNOWN_UNDECLARED: Record<string, string> = {
  // #1183 — never authored. Absent from every schema, and no migration
  // mentions either name. The call sites are reachable from live baseball
  // recruiting settings pages.
  calculate_grad_year_percentiles: '#1183',
  calculate_player_match_score: '#1183',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(p);
    }
  }
  return out;
}

function rpcsCalledInSrc(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(join(process.cwd(), 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(RPC_CALL_RE)) {
      if (m[1]) found.add(m[1]);
    }
  }
  return found;
}

/** Only `supabase/migrations/` — NOT `migrations_archive/`, which holds
 *  superseded pre-baseline files that no longer run. */
function functionsDeclaredByMigrations(): Set<string> {
  const dir = join(process.cwd(), 'supabase/migrations');
  const declared = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(FN_DECL_RE)) {
      if (m[1]) declared.add(m[1]);
    }
  }
  return declared;
}

describe('rpc coverage', () => {
  it('every RPC called in src/ is declared by a migration', () => {
    const called = rpcsCalledInSrc();
    const declared = functionsDeclaredByMigrations();

    // Non-vacuity. If either scanner silently stops matching, this fails loudly
    // rather than passing over two empty sets. The declared floor is set well
    // under the ~201 currently found so ordinary churn does not trip it, but
    // high enough that losing the baseline's quoted form (133 of them) does.
    expect(called.size).toBeGreaterThan(50);
    expect(declared.size).toBeGreaterThan(150);

    const undeclared = [...called]
      .filter((fn) => !declared.has(fn))
      .filter((fn) => !(fn in KNOWN_UNDECLARED))
      .sort();

    expect(undeclared).toEqual([]);
  });

  it('the known-undeclared allowlist has not gone stale', () => {
    const called = rpcsCalledInSrc();
    const declared = functionsDeclaredByMigrations();

    // An entry that now has a migration, or is no longer called, should be
    // removed — otherwise the list grants an exemption nobody relies on.
    const stale = Object.keys(KNOWN_UNDECLARED)
      .filter((fn) => declared.has(fn) || !called.has(fn))
      .sort();

    expect(stale).toEqual([]);
  });
});
