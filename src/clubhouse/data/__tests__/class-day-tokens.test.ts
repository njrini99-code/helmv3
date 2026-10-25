import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The weekday tokens the SQL block model reads (`golf_day_token_dow`, held migration 20261025070100) and the ones
 * availability.ts reads (`DAY_CODE_TO_INDEX`) must be the same map, key for key, or a class would count for the push
 * gate and not for the calendar (or the other way round). The TS map stays private to availability.ts, so this test
 * reads both files as text. TS numbers Sunday 0; SQL uses ISO 7.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function tsMap(): Record<string, number> {
  const src = read('src/lib/calendar/availability.ts');
  const body = /const DAY_CODE_TO_INDEX: Record<string, number> = \{([\s\S]*?)\};/.exec(src)?.[1];
  if (!body) throw new Error('DAY_CODE_TO_INDEX not found in availability.ts');
  const map: Record<string, number> = {};
  for (const m of body.matchAll(/([a-z]+):\s*(\d)/g)) map[m[1]!] = Number(m[2]);
  return map;
}

function sqlMap(): Record<string, number> {
  const src = read('supabase/migrations/20261025070100_golf_class_blocks_functions.sql');
  const fn = /create or replace function public\.golf_day_token_dow\([\s\S]*?\$\$;/.exec(src)?.[0];
  if (!fn) throw new Error('golf_day_token_dow not found');
  const map: Record<string, number> = {};
  for (const m of fn.matchAll(/when '([a-z]+)' then (\d)/g)) map[m[1]!] = Number(m[2]);
  return map;
}

describe('weekday tokens: SQL against availability.ts', () => {
  it('maps every key the TS map has, to the same weekday (TS 0 is ISO 7)', () => {
    const ts = tsMap();
    const sql = sqlMap();
    expect(Object.keys(ts).length).toBeGreaterThan(20);
    const expected = Object.fromEntries(Object.entries(ts).map(([k, v]) => [k, v === 0 ? 7 : v]));
    expect(sql).toEqual(expected);
  });

  it('has no key the TS map lacks', () => {
    const ts = tsMap();
    for (const key of Object.keys(sqlMap())) expect(ts).toHaveProperty(key);
  });

  it('keeps a bare S unmapped on both sides (ambiguous)', () => {
    expect(tsMap()).not.toHaveProperty('s');
    expect(sqlMap()).not.toHaveProperty('s');
  });
});
