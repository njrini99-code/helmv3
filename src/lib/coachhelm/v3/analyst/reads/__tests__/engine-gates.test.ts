import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

const { readsReplaceCards, v2WriterStopped, V2_WRITER_STOP_FLAG } = await import('../engine-gates');

describe('the old engine switches', () => {
  it('today\u2019s checks keep writing cards unless the team is on reads', () => {
    expect(readsReplaceCards('t1', { flagOn: () => true, teams: '' })).toBe(false);
    expect(readsReplaceCards('t1', { flagOn: () => false, teams: 't1' })).toBe(false);
    expect(readsReplaceCards('t2', { flagOn: () => true, teams: 't1' })).toBe(false);
    expect(readsReplaceCards('t1', { flagOn: () => true, teams: 't1' })).toBe(true);
    expect(readsReplaceCards('t1', { flagOn: () => { throw new Error('x'); }, teams: 't1' })).toBe(false);
  });

  it('the hidden v2 writer runs unless its own flag is on (off everywhere)', async () => {
    expect(v2WriterStopped()).toBe(false);
    expect(v2WriterStopped(() => true)).toBe(true);
    const { FLAG_REGISTRY } = await import('@/lib/flags/registry.generated');
    const f = FLAG_REGISTRY.find((x) => x.feature_id === V2_WRITER_STOP_FLAG)!;
    expect(f.default).toBe(false);
    expect(f.environment).toEqual({ production: false, preview: false, development: false });
  });
});
