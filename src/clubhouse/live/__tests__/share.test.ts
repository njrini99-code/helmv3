import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/round-live', () => ({ setLiveShare: vi.fn(), setLivePrefs: vi.fn(), setNextLiveShare: vi.fn() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn() }));

import { floorShare, shareControl, shareOptions } from '../share';
import { readPracticeShare, readRoundShare } from '../share-ports';
import type { LiveClient } from '../live-queries';

describe('share levels', () => {
  it('floors a qualifier or tournament at coaches and leaves practice alone', () => {
    expect(floorShare('practice', 'off')).toBe('off');
    expect(floorShare('practice', 'team')).toBe('team');
    expect(floorShare('qualifier', 'off')).toBe('coaches');
    expect(floorShare('qualifier', 'team')).toBe('coaches');
    expect(floorShare('tournament', 'off')).toBe('coaches');
  });
  it('names the levels in words, disabling what a type cannot take', () => {
    expect(shareOptions('practice').map((o) => [o.label, !!o.disabled])).toEqual([['Not live', false], ['Coaches', false], ['Coaches and team', false]]);
    expect(shareOptions('qualifier').map((o) => [o.label, !!o.disabled])).toEqual([['Not live', true], ['Coaches', false], ['Coaches and team', true]]);
  });
  it('says what the player may do', () => {
    expect([shareControl('practice'), shareControl('qualifier'), shareControl('tournament')]).toEqual(['choose', 'floor', 'none']);
  });
});

/** A client whose `from(table)` answers by table. */
function client(tables: Record<string, { data?: unknown; error?: { code: string; message: string } | null }>): LiveClient {
  return {
    from: (table: string) => {
      const q = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: tables[table]?.data ?? null, error: tables[table]?.error ?? null }) };
      return q;
    },
  } as unknown as LiveClient;
}

describe('the share reads', () => {
  it('the practice default is off until the player chooses, and null when the table is not there', async () => {
    expect(await readPracticeShare(client({ golf_round_live_prefs: { data: { practice_share: 'team' } } }))).toEqual({ practiceShare: 'team' });
    expect(await readPracticeShare(client({ golf_round_live_prefs: { data: null } }))).toEqual({ practiceShare: 'off' });
    expect(await readPracticeShare(client({ golf_round_live_prefs: { error: { code: '42P01', message: 'no relation' } } }))).toBeNull();
  });
  it('a round’s level is its live row’s, else the floored default it will start at, else null', async () => {
    expect(await readRoundShare(client({ golf_round_live: { data: { share: 'team' } } }), 'r', 'practice')).toBe('team');
    expect(await readRoundShare(client({ golf_round_live: { data: null }, golf_round_live_prefs: { data: { practice_share: 'team' } } }), 'r', 'practice')).toBe('team');
    expect(await readRoundShare(client({ golf_round_live: { data: null }, golf_round_live_prefs: { data: { practice_share: 'off' } } }), 'r', 'qualifier')).toBe('coaches');
    expect(await readRoundShare(client({ golf_round_live: { error: { code: 'PGRST205', message: 'missing' } } }), 'r', 'practice')).toBeNull();
  });
});
