import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { baselineRegistry } from '@/lib/coachhelm/v2/insights/baseline-registry';
import { COMPARISON_SOURCES } from '@/lib/coachhelm/v2/insights/types';
import type { BaselineKey } from '@/lib/coachhelm/v2/insights/types';

describe('baselineRegistry', () => {
  it('returns D2 putting baseline with correct label and source', () => {
    const r = baselineRegistry.get('d2_avg.putting_make_pct_6_10ft');
    expect(r.source).toBe('d2_avg');
    expect(r.label).toMatch(/Division II|D2/i);
    expect(r.value).toBeGreaterThan(0);
    expect(r.value).toBeLessThanOrEqual(1);
  });

  it('returns PGA Tour baseline with correct label', () => {
    const r = baselineRegistry.get('pga_baseline.putting_make_pct_6_10ft');
    expect(r.source).toBe('pga_baseline');
    expect(r.label).toMatch(/PGA/);
  });

  it('returns uniform 4-way as absolute_target = 0.25', () => {
    const r = baselineRegistry.get('absolute_target.uniform_4way');
    expect(r.source).toBe('absolute_target');
    expect(r.value).toBe(0.25);
    expect(r.label).toMatch(/balanced|25%/i);
  });

  it('returns par as absolute_target = 0', () => {
    const r = baselineRegistry.get('absolute_target.par');
    expect(r.source).toBe('absolute_target');
    expect(r.value).toBe(0);
    expect(r.label).toBe('par');
  });

  it('throws on unknown key', () => {
    expect(() => baselineRegistry.get('d2_avg.does_not_exist' as BaselineKey)).toThrow(/unknown baseline/i);
  });

  it('tryGet returns null for unknown key', () => {
    expect(baselineRegistry.tryGet('d2_avg.does_not_exist' as BaselineKey)).toBeNull();
  });

  it('exposes all registered keys via allKeys()', () => {
    const keys = baselineRegistry.allKeys();
    expect(keys.length).toBeGreaterThan(5);
    expect(keys).toContain('d2_avg.putting_make_pct_6_10ft');
  });

  it('every entry source is in the canonical COMPARISON_SOURCES tuple', () => {
    const valid = new Set<string>(COMPARISON_SOURCES);
    for (const key of baselineRegistry.allKeys()) {
      const entry = baselineRegistry.get(key);
      expect(valid.has(entry.source)).toBe(true);
    }
  });
});

/**
 * Static guard: every miner under src/lib/coachhelm/v2/mining/ MUST emit a
 * comparison_source that maps to a registered baseline. This prevents future
 * generators from re-introducing the Finding 1 class of bug (hard-coded label
 * disagreeing with the underlying numeric source).
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('mining files use only canonical comparison_source values', () => {
  it('no hard-coded comparison_source string is outside the canonical set', () => {
    const minerFiles = walk('src/lib/coachhelm/v2/mining');
    const canonical = new Set<string>(COMPARISON_SOURCES);
    const offenders: Array<{ file: string; line: number; value: string }> = [];

    for (const file of minerFiles) {
      const text = readFileSync(file, 'utf-8');
      text.split('\n').forEach((line, i) => {
        const m = line.match(/comparison_source:\s*['"]([^'"]+)['"]/);
        const captured = m?.[1];
        if (captured && !canonical.has(captured)) {
          offenders.push({ file, line: i + 1, value: captured });
        }
      });
    }

    expect(
      offenders,
      `Found comparison_source strings not in canonical set:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });
});
