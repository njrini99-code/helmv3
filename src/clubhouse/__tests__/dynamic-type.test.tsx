import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDynamicTypeScale } from '../lib/dynamic-type';

const tokens = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8');

describe('real Dynamic Type (P008-C1)', () => {
  it('sizes every type token from one scalable pixel, so a larger root or iPhone text size scales them', () => {
    expect(tokens).toMatch(/--ch-type-k: calc\(var\(--ch-type-scale, 1\) \* 1rem \/ 16\);/);
    const steps = [...tokens.matchAll(/--ch-type-[a-z-]+: [^;]+;/g)].map((m) => m[0]).filter((t) => !t.startsWith('--ch-type-k'));
    expect(steps.length).toBeGreaterThan(20);
    for (const t of steps) expect(t).toMatch(/calc\([\d.]+ \* var\(--ch-type-k\)\)/);
  });

  it('reads nothing where the browser has no -apple-system-body font', () => {
    expect(readDynamicTypeScale()).toBeNull();
  });
});
