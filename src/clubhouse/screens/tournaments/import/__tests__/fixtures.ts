/** Shared fixtures for the results import's tests: one event of two rounds at Pinehurst, a roster of six. */
import type { ChPlanContext } from '../plan';
import type { ChTourCourse, ChTourEvent, ChTourHoleLedger, ChTourPlayer, ChTourPlayerRound } from '../../types';

export const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
export const HOLES = PARS.map((_, i) => String(i + 1));
/** A card that is par everywhere but `extra` strokes over on hole `on` (1 based). */
export const card = (extra = 0, on = 1) => PARS.map((p, i) => p + (i === on - 1 ? extra : 0));
export const total = (c: readonly number[]) => c.reduce((a, b) => a + b, 0);

export const player = (id: string, name: string): ChTourPlayer => ({ id, name, first: name.split(' ')[0]!, initials: 'XX', year: 'Senior', avatarUrl: null, alumni: false, availability: 'available' });
export const ROSTER = [player('ava', 'Ava Lindqvist'), player('theo', 'Theo Marchetti'), player('sofia', 'Sofia Alvarez'), player('jonah', 'Jonah Okafor'), player('eli', 'Eli Brandt'), player('will', 'William Harper')];
export const COURSE: ChTourCourse = { id: 'pin', name: 'Pinehurst No. 2', tees: 'Blue', par: 72, rating: 75.3, holes: PARS.map((par, i) => ({ n: i + 1, par, handicap: null, yards: null })) };

export function pr(over: Partial<ChTourPlayerRound> & { playerId: string; roundNumber: number }): ChTourPlayerRound {
  return { eventId: 'e1', roundEventId: `r${over.roundNumber}`, role: 'lineup', slot: 1, squad: 'A', total: null, toPar: null, status: 'ok', source: 'card', trust: 'live', roundId: null, holesKnown: false, shotData: false, officialTotal: null, count: 'none', ...over };
}

export function event(over: Partial<ChTourEvent> = {}): ChTourEvent {
  return {
    id: 'e1',
    seasonId: '2026-27',
    name: 'Fall Invitational',
    short: 'Fall Inv.',
    host: null,
    startDate: '2026-10-20',
    endDate: '2026-10-21',
    courseIds: ['pin'],
    format: { kind: '5c4', players: 5, counting: 4, holes: 18 },
    kind: 'regular',
    tiebreak: 'ncaa',
    status: 'live',
    show: 'live',
    close: null,
    trust: 'live',
    mood: 'live',
    rounds: [1, 2].map((n) => ({ roundEventId: `r${n}`, eventId: 'e1', number: n, date: `2026-10-2${n - 1}`, courseId: 'pin', startType: 'tee_times', firstTeeAt: null, status: 'live', par: 72, thirtySix: false })),
    entries: [...['ava', 'theo', 'sofia', 'jonah', 'eli'].map((playerId, i): ChTourEvent['entries'][number] => ({ playerId, role: 'lineup', slot: i + 1, squad: 'A' })), { playerId: 'will', role: 'alternate', slot: null, squad: 'A' }],
    playerRounds: [],
    team: { rounds: [], result: null },
    field: null,
    finish: null,
    record: null,
    coverage: { scorecards: 0, withShots: 0 },
    resultsUrl: null,
    lineup: { status: 'locked', locksAt: null, publishAt: null, publishedAt: null, seen: null, set: 5, of: 5 } as ChTourEvent['lineup'],
    note: null,
    legacy: false,
    ...over,
  };
}

export const ctx = (over: Partial<ChTourEvent> = {}, ledger: ChTourHoleLedger | null = null): ChPlanContext => ({ event: event(over), players: ROSTER, ledger, courses: { pin: COURSE }, teamName: 'Demo University' });
