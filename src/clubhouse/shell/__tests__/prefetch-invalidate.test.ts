import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A21: after a round is submitted, discarded or retyped, the section pages fetched ahead are forgotten, and Roster revalidates. */

import { fetchAhead, heldPage, invalidatePrefetchTabs, resetPrefetchTabsForTests } from '../use-prefetch-tabs';

beforeEach(() => resetPrefetchTabsForTests());

describe('held prefetch pages are dropped after a write (A21)', () => {
  it('a page fetched ahead is held until invalidatePrefetchTabs, then not', () => {
    const router = { prefetch: vi.fn() } as unknown as Parameters<typeof fetchAhead>[0];
    const now = 1_000_000;
    fetchAhead(router, '/golf/dashboard/stats', now);
    expect(heldPage('/golf/dashboard/stats', now + 1000)).toBe(true);
    invalidatePrefetchTabs();
    expect(heldPage('/golf/dashboard/stats', now + 1000)).toBe(false);
  });

  it('the submit, the discard and the type change each call it', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
    expect(read('src/clubhouse/screens/rounds/entry/RoundRuntime.tsx')).toMatch(/invalidatePrefetchTabs\(\)/);
    expect(read('src/clubhouse/screens/rounds/writes.ts')).toMatch(/invalidatePrefetchTabs\(\)/);
    expect(read('src/clubhouse/screens/rounds/RoundReview.tsx')).toMatch(/invalidatePrefetchTabs\(\)/);
  });

  it('the round submit revalidates Roster with the other section pages', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/golf/actions/round-submit.ts'), 'utf8');
    expect(src).toMatch(/revalidatePath\('\/golf\/dashboard\/roster'\)/);
  });
});
