import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPracticeMissing, PRACTICE_ERRORS, practiceErrorOf } from '../practice-errors';

describe('practice errors', () => {
  it('maps every SQL token in the held migrations', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir).filter((f) => /^(2026102601|20261104)\d*.*\.sql$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(9);
    const tokens = new Set<string>();
    for (const f of files) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/RAISE EXCEPTION '([a-z_]+)/g)) tokens.add(m[1]!);
    expect(tokens.size).toBeGreaterThan(10);
    for (const t of tokens) expect(PRACTICE_ERRORS[t], `unmapped token ${t}`).toBeDefined();
  });
  it('reads a token out of a database message', () => {
    expect(practiceErrorOf('ERROR: practice_plan_stale').token).toBe('practice_plan_stale');
    expect(practiceErrorOf('something else').token).toBeNull();
  });
  it('treats a missing table or function as unavailable', () => {
    for (const c of ['PGRST205', 'PGRST202', '42P01', '42883']) expect(isPracticeMissing(c)).toBe(true);
    expect(isPracticeMissing('23505')).toBe(false);
  });
});
