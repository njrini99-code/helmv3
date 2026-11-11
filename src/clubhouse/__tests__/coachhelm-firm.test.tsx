
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Round 2C: with `coachhelm_support_v1` on, the coach board shows only reads at Working hypothesis or firmer. A read rated Not
 * enough yet is not a card; the held-back reads are one collapsed line, "Not enough yet (N)", that opens in place (CH-13942), and a
 * player every one of whose reads is held back is a By player row that says so (CH-13943). Flag off: nothing changes.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));

import { isNotEnoughYet, notEnoughOf, notEnoughRead, splitFirm } from '../data/coachhelm-firm';

afterEach(cleanup);

const read = (id: string, ladder: string | null, strokes: number | null = null) => ({
  id,
  title: `Read ${id}`,
  evidence: {
    ...(ladder ? { ladder, support: { version: 'support_v1', testable: true, n: 12, n_unit: 'attempts', floor: 40, rounds_n: 4, round_floor: 3 } } : {}),
    ...(strokes != null ? { strokes_shrunk: strokes } : {}),
  },
});

describe('splitFirm', () => {
  it('with the flag off, holds nothing back and keeps the head', () => {
    const head = read('a', 'not_enough_yet');
    expect(splitFirm(head, [head, read('b', 'observed')], false)).toEqual({ head, held: [] });
  });

  it('keeps a firm head and holds back every read rated Not enough yet, once each', () => {
    const head = read('a', 'working_hypothesis');
    const thin = read('b', 'not_enough_yet');
    const out = splitFirm(head, [head, thin, read('c', 'likely'), thin], true);
    expect(out.head).toBe(head);
    expect(out.held.map((r) => r.id)).toEqual(['b']);
  });

  it('a held-back head gives way to the firmest other read (strokes times the rung weight)', () => {
    const out = splitFirm(read('a', 'not_enough_yet', 2), [read('b', 'working_hypothesis', 2), read('c', 'observed', 1), read('d', 'observed', 2)], true);
    expect(out.head?.id).toBe('d');
    expect(out.held.map((r) => r.id)).toEqual(['a']);
  });

  it('a read the pass has not rated is never held back, and no head stays no card', () => {
    expect(isNotEnoughYet(read('a', null).evidence)).toBe(false);
    expect(splitFirm(read('a', null), [], true).head?.id).toBe('a');
    const out = splitFirm(undefined, [read('b', 'observed'), read('c', 'not_enough_yet')], true);
    expect(out.head).toBeNull();
    expect(out.held.map((r) => r.id)).toEqual(['c']);
  });

  it('every read held back leaves no card', () => {
    const out = splitFirm(read('a', 'not_enough_yet'), [read('b', 'not_enough_yet')], true);
    expect(out.head).toBeNull();
    expect(out.held).toHaveLength(2);
  });

  it('a held-back read lists its title in the coach’s voice and its Watching count-down', () => {
    const r = notEnoughRead(read('a', 'not_enough_yet'), { role: 'coach', first: 'Priya' });
    expect(r.watching).toBe('Watching: 12 attempts so far. 28 more and this read can say something.');
    expect(notEnoughOf([{ id: 'p', name: 'Priya', card: true, reads: [] }])).toBeUndefined();
    expect(notEnoughOf([{ id: 'p', name: 'Priya', card: true, reads: [r, r] }])?.count).toBe(2);
  });
});
