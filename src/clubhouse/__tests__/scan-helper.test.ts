import { describe, expect, it } from 'vitest';
import { code, hits, ratchet, ROOT, walk, type Hit } from './_scan';

/** CONS-0: the guards' shared walker reads what they expect it to. */
describe('Guard scan helper (CONS-0)', () => {
  it('walks Clubhouse source and styles, never a test file', () => {
    const files = walk();
    expect(files.length).toBeGreaterThan(300);
    expect(files.every((f) => f.startsWith(ROOT))).toBe(true);
    expect(files.some((f) => f.endsWith('styles/tokens.css'))).toBe(true);
    expect(files.some((f) => /__tests__|\.test\.tsx?$/.test(f))).toBe(false);
  });

  it('drops comments, and names each hit by file and line', () => {
    const tokens = walk().find((f) => f.endsWith('styles/tokens.css'))!;
    expect(code(tokens)).not.toMatch(/\/\*/);
    const found = hits(/--ch-bg-page:/g, [tokens]);
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found[0]).toMatchObject({ file: 'styles/tokens.css', text: expect.stringMatching(/^--ch-bg-page:/) });
  });

  it('ratchet: a count over its allowance fails, and an allowance with nothing left is stale', () => {
    const h = (file: string): Hit => ({ file, line: 1, text: '' });
    expect(ratchet([h('a.ts'), h('a.ts'), h('b.ts')], { 'a.ts': 2, 'c.ts': 1 })).toEqual({ over: ['b.ts: 1 > 0'], stale: ['c.ts: now 0, delete it from the allowlist'] });
    expect(ratchet([h('a.ts')], { 'a.ts': 2 })).toEqual({ over: [], stale: [] });
  });
});
