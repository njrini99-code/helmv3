import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOLD_PUT_ARGS } from '../class-hold-core';

/**
 * The held migrations are not applied, so the generated Supabase types cannot catch a call that drifts from the SQL. This reads both as
 * text: every `rpc('golf_…', { … })` the app makes names an existing function, passes only keys the function declares, and leaves out
 * only parameters that have a default.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const MIGRATIONS = [
  'supabase/migrations/20261025070100_golf_class_blocks_functions.sql',
  'supabase/migrations/20261025070200_golf_push_holds.sql',
].map(read).join('\n');

const CALLERS = [
  'src/lib/notifications/class-hold.ts',
  'src/clubhouse/data/class-day.ts',
  'src/app/golf/actions/class-status.ts',
];

/** `function public.name(` … the matching close before `returns`, as { name -> params }. Later definitions replace earlier ones (070200 re-creates golf_my_class_day). */
function sqlFunctions(sql: string): Map<string, { name: string; hasDefault: boolean }[]> {
  const out = new Map<string, { name: string; hasDefault: boolean }[]>();
  const re = /create or replace function public\.(golf_[a-z0-9_]+)\(([\s\S]*?)\)\s*returns/gi;
  for (const m of sql.matchAll(re)) {
    const params = m[2]!.split(',').map((x) => x.trim()).filter(Boolean).flatMap((x) => {
      const name = /^(p_[a-z0-9_]+)/i.exec(x)?.[1];
      return name ? [{ name, hasDefault: /\bdefault\b/i.test(x) }] : [];
    });
    out.set(m[1]!, params);
  }
  return out;
}

const fns = sqlFunctions(MIGRATIONS);

/** Every rpc('golf_…', {…}) / rpc('golf_…') in a source file as [name, keys]. */
function calls(src: string): [string, string[]][] {
  const found: [string, string[]][] = [];
  for (const m of src.matchAll(/(?:rpc|rpcOf\([^)]*\))\(\s*'(golf_[a-z0-9_]+)'\s*(?:,\s*\{([^}]*)\})?/g)) {
    const body = m[2] ?? '';
    const keys = [...body.matchAll(/(?:^|[,{\s])(p_[a-z0-9_]+)\s*[:,}]/g)].map((k) => k[1]!);
    found.push([m[1]!, keys]);
  }
  return found;
}

describe('SQL parity: the app calls the held functions as they are written', () => {
  it('finds the functions and the calls (the parse is not silently empty)', () => {
    expect(fns.size).toBeGreaterThan(15);
    expect(CALLERS.flatMap((f) => calls(read(f))).length).toBeGreaterThan(8);
  });

  for (const file of CALLERS) {
    it(`${file}: every call names a real function with real parameters`, () => {
      for (const [name, keys] of calls(read(file))) {
        const params = fns.get(name);
        expect(params, `${name} is not defined in the held migrations`).toBeDefined();
        for (const key of keys) expect(params!.map((p) => p.name), `${name} has no parameter ${key}`).toContain(key);
        const required = params!.filter((p) => !p.hasDefault).map((p) => p.name);
        for (const need of required) expect(keys, `${name} needs ${need}`).toContain(need);
      }
    });
  }

  it('HOLD_PUT_ARGS lists the put parameters in order (p_reason, defaulted, is left to the SQL)', () => {
    expect(fns.get('golf_push_hold_put')!.map((p) => p.name)).toEqual([...HOLD_PUT_ARGS, 'p_reason']);
  });
});
