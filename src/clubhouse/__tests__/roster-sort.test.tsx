
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Roster phone sort (CH-3701) on TanStack Table's sorting model, and the trailing figure as plain tabular text: a chosen
 * sort or a refresh puts the new figure in at once, with no digits rolling (owner rule, as on Qualifiers).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({
  acceptJoinRequest: vi.fn(),
  rejectJoinRequest: vi.fn(),
  getTeamJoinRequests: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const motion = vi.hoisted(() => ({ reduced: false }));
// Whether the arriving page's first frame is painted: true here (a page at rest), false to see its first frame.
const arrival = vi.hoisted(() => ({ painted: true }));
vi.mock('../lib/use-painted', async (orig) => ({ ...(await orig<typeof import('../lib/use-painted')>()), useArrivalPainted: () => arrival.painted }));
vi.mock('../lib/reduced-motion', () => ({ useChReducedMotion: () => motion.reduced, useChMotionMode: () => (motion.reduced ? 'off' : 'full') }));

import type { ChRosterPlayer } from '../data/roster';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { useRosterSort, type PhoneSort } from '../screens/roster/sort';
import './dialog-polyfill';

/** The order the phone list had before TanStack (RosterPhone's sortPlayers), kept here as the rule to match. */
function reference(list: ChRosterPlayer[], sort: PhoneSort): ChRosterPlayer[] {
  const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
  const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);
  return [...list].sort((a, b) =>
    sort === 'name'
      ? lastName(a.name).localeCompare(lastName(b.name))
      : sort === 'sg'
        ? nullsLast(a.sgPerRound == null ? null : -a.sgPerRound, b.sgPerRound == null ? null : -b.sgPerRound)
        : nullsLast(a.avg, b.avg),
  );
}

const base = PREVIEW_ROSTER.players[0]!;
const extra = (id: string, name: string, avg: number | null, sg: number | null, status: 'active' | 'inactive' = 'active'): ChRosterPlayer => ({
  ...base,
  id,
  name,
  avg,
  sgPerRound: sg,
  status,
});
/** The fixture plus the edges: no average, no strokes gained, ties on both, and a tie on last name. */
const PLAYERS: ChRosterPlayer[] = [
  ...PREVIEW_ROSTER.players,
  extra('nul', 'Nora Null', null, null),
  extra('tie1', 'Ana Brandt', 74.8, 1.1),
  extra('tie2', 'Zed Okafor', 71.6, 0.6),
  extra('in2', 'Ivo Quist', null, 0.4, 'inactive'),
];

beforeEach(() => {
  hapticSpy.mockClear();
  motion.reduced = false;
  localStorage.clear();
});

describe('Roster phone sort on TanStack (CH-3701)', () => {
  it('orders Avg lowest first, SG highest first and Name by last name, missing figures last and ties as loaded', () => {
    const { result, rerender } = renderHook(({ sort }: { sort: PhoneSort }) => useRosterSort(PLAYERS, sort), { initialProps: { sort: 'avg' as PhoneSort } });
    // Switching back and forth on one table instance: each render reads the sort it was given.
    for (const sort of ['avg', 'sg', 'name', 'sg', 'avg'] as const) {
      rerender({ sort });
      const ids = (l: ChRosterPlayer[]) => l.map((p) => p.id);
      expect(ids(result.current.active)).toEqual(ids(reference(PLAYERS.filter((p) => p.status === 'active'), sort)));
      expect(ids(result.current.inactive)).toEqual(ids(reference(PLAYERS.filter((p) => p.status === 'inactive'), sort)));
    }
    rerender({ sort: 'avg' });
    expect(result.current.active.at(-1)!.id).toBe('nul');
    rerender({ sort: 'sg' });
    expect(result.current.active.at(-1)!.id).toBe('nul');
    expect(result.current.active.slice(0, 3).map((p) => p.id)).toEqual(['theo', 'sofia', 'tie1']);
  });
});
