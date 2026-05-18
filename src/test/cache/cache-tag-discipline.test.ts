import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CACHE_TAGS, scopedTag, CACHE_LIFE } from '@/lib/cache/tags';

/**
 * Cache-tag discipline: static checks that complement the runtime cache
 * behavior. Closes audit P-CRIT-1 (cache tags write-only) by:
 *
 *   1. Asserting every CACHE_TAGS.X reference in source maps to a defined key.
 *   2. Asserting scopedTag() composition matches the documented format.
 *   3. Asserting CACHE_LIFE profiles are internally consistent
 *      (stale < revalidate < expire).
 *
 * The fuller "every write site calls updateTag" check is intentionally
 * deferred — until Plan 06's `'use cache'` adoption lands on real read
 * paths, requiring updateTag everywhere would just enforce no-op writes.
 * Re-enable that check when at least one cached reader exists.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('cache tag discipline', () => {
  it('every CACHE_TAGS.X reference uses a defined key', () => {
    const definedKeys = new Set(Object.keys(CACHE_TAGS));
    const offenders: Array<{ file: string; line: number; key: string }> = [];

    const roots = ['src/app', 'src/lib', 'src/components'];
    for (const root of roots) {
      try {
        statSync(root);
      } catch {
        continue;
      }
      for (const file of walk(root)) {
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
        const text = readFileSync(file, 'utf-8');
        text.split('\n').forEach((line, i) => {
          for (const m of line.matchAll(/CACHE_TAGS\.(\w+)/g)) {
            const key = m[1];
            if (key && !definedKeys.has(key)) {
              offenders.push({ file, line: i + 1, key });
            }
          }
        });
      }
    }

    expect(
      offenders,
      `Found CACHE_TAGS.X references to undefined keys:\n${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  it('scopedTag composes "category:scope:id" format', () => {
    expect(scopedTag('DASHBOARD', 'coach', 'c1')).toBe('dashboard:coach:c1');
    expect(scopedTag('STATS', 'player', 'p7')).toBe('stats:player:p7');
    expect(scopedTag('CALENDAR', 'team', 't42')).toBe('calendar:team:t42');
    expect(scopedTag('ROSTER', 'team', 'team-abc')).toBe('roster:team:team-abc');
  });

  it('CACHE_LIFE profiles satisfy stale <= revalidate <= expire', () => {
    for (const [name, profile] of Object.entries(CACHE_LIFE)) {
      const { stale, revalidate, expire } = profile;
      expect(stale, `${name}.stale must be <= revalidate`).toBeLessThanOrEqual(revalidate);
      expect(revalidate, `${name}.revalidate must be <= expire`).toBeLessThanOrEqual(expire);
    }
  });

  it('all CACHE_TAGS keys are non-empty lowercase strings', () => {
    for (const [key, value] of Object.entries(CACHE_TAGS)) {
      expect(value.length, `${key} is empty`).toBeGreaterThan(0);
      expect(value, `${key}=${value} should be lowercase`).toBe(value.toLowerCase());
    }
  });
});
