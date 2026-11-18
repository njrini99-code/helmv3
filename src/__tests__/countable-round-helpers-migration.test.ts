import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * 20261118030000_golf_countable_round_helpers.sql lets Clubhouse's season
 * Standing (20261024151000) be applied without the OD-01 chain: it creates the
 * three countable-round helpers and nothing else.
 *
 * Its bodies must stay byte-identical to OD-01's (20260924120000), so that
 * applying either file first gives the same functions and OD-01's later
 * CREATE OR REPLACE is a no-op. And it must create every function the season
 * file's DO guard checks for, or that guard still refuses.
 */
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const read = (name: string) => readFileSync(join(MIGRATIONS, name), 'utf8');

const HELPERS = read('20261118030000_golf_countable_round_helpers.sql');
const OD01 = read('20260924120000_golf_countable_round_stats_cache.sql');
const SEASON = read('20261024151000_golf_player_standing_season.sql');

const HELPER_NAMES = ['golf_round_canonical_total', 'golf_round_is_countable', 'golf_round_is_score_countable'] as const;

/** Every statement (CREATE, ALTER, COMMENT, REVOKE, GRANT) on `name`, as written. */
function rawStatementsFor(sql: string, name: string): string[] {
  const re = new RegExp(
    String.raw`^(CREATE OR REPLACE FUNCTION|ALTER FUNCTION|COMMENT ON FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) "public"\."${name}"\(`,
    'gm',
  );
  return [...sql.matchAll(re)].map((m) => {
    const start = m.index ?? 0;
    // A function body ends at `$$;`; every other statement at the first `;` that ends a line.
    const end = m[1] === 'CREATE OR REPLACE FUNCTION' ? sql.indexOf('$$;', start) + 3 : sql.indexOf(';\n', start) + 1;
    return sql.slice(start, end);
  });
}

const statementsFor = (sql: string, name: string) => rawStatementsFor(sql, name).map((s) => s.replace(/\s+/g, ' ').trim());

/** What is left of `sql` once comment lines and the helper statements are removed. */
function otherStatements(sql: string): string {
  let rest = sql.replace(/^--.*$/gm, '');
  for (const name of HELPER_NAMES) for (const s of rawStatementsFor(rest, name)) rest = rest.replace(s, '');
  return rest.trim();
}

describe('20261118030000 countable-round helpers', () => {
  it.each(HELPER_NAMES)('%s is created, owned, commented and granted exactly as in OD-01', (name) => {
    const mine = statementsFor(HELPERS, name);
    const theirs = statementsFor(OD01, name);
    expect(mine.map((s) => s.split(' ').slice(0, 2).join(' '))).toEqual([
      'CREATE OR',
      'ALTER FUNCTION',
      'COMMENT ON',
      'REVOKE ALL',
      'GRANT EXECUTE',
    ]);
    expect(mine).toEqual(theirs);
  });

  it('does nothing but the three helpers (no table, cache or Standing change)', () => {
    expect(otherStatements(HELPERS)).toBe('');
  });

  it('never grants a helper to anon or PUBLIC', () => {
    expect(HELPERS).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|PUBLIC)\b/i);
  });

  it('creates every function the season file’s guard requires', () => {
    const guard = SEASON.slice(SEASON.indexOf('DO $guard$'), SEASON.indexOf('$guard$;'));
    const required = [...guard.matchAll(/to_regprocedure\('public\.(\w+)\(/g)].map((m) => m[1]);
    expect(required).toEqual(['golf_round_is_countable', 'golf_round_is_score_countable']);
    for (const name of required) expect(statementsFor(HELPERS, name)[0]).toMatch(/^CREATE OR REPLACE FUNCTION/);
  });

  it('sorts after the season file’s queue and is named in HELD.md as HOLD, before the season file', () => {
    const held = readFileSync(join(MIGRATIONS, 'HELD.md'), 'utf8');
    expect(held).toMatch(/^\| `20261118030000_golf_countable_round_helpers\.sql` \| \*\*HOLD\*\* \|/m);
    expect(held).toMatch(/Step 7b\.\*\* `20261118030000_golf_countable_round_helpers\.sql`, then `20261024151000_golf_player_standing_season\.sql`/);
    expect(SEASON).toContain('Apply 20261118030000_golf_countable_round_helpers.sql');
  });
});
