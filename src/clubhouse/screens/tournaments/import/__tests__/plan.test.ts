import { describe, expect, it } from 'vitest';
import { buildPlan, importInput, matchNames, nameScore, planCounts, sameTeam, type ChPlanContext } from '../plan';
import { readResults } from '../results';
import type { ChTourCourse, ChTourEvent, ChTourField, ChTourHoleLedger, ChTourPlayer, ChTourPlayerRound } from '../../types';

const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const HOLES = PARS.map((_, i) => String(i + 1));
/** A card that is par everywhere but `extra` strokes over on hole `on` (1 based). */
const card = (extra = 0, on = 1) => PARS.map((p, i) => p + (i === on - 1 ? extra : 0));
const total = (c: readonly number[]) => c.reduce((a, b) => a + b, 0);

const player = (id: string, name: string): ChTourPlayer => ({ id, name, first: name.split(' ')[0]!, initials: 'XX', year: 'Senior', avatarUrl: null, alumni: false, availability: 'available' });
const ROSTER = [player('ava', 'Ava Lindqvist'), player('theo', 'Theo Marchetti'), player('sofia', 'Sofia Alvarez'), player('jonah', 'Jonah Okafor'), player('eli', 'Eli Brandt'), player('will', 'William Harper')];
const COURSE: ChTourCourse = { id: 'pin', name: 'Pinehurst No. 2', tees: 'Blue', par: 72, rating: 75.3, holes: PARS.map((par, i) => ({ n: i + 1, par, handicap: null, yards: null })) };

function pr(over: Partial<ChTourPlayerRound> & { playerId: string; roundNumber: number }): ChTourPlayerRound {
  return { eventId: 'e1', roundEventId: `r${over.roundNumber}`, role: 'lineup', slot: 1, squad: 'A', total: null, toPar: null, status: 'ok', source: 'card', trust: 'live', roundId: null, holesKnown: false, shotData: false, officialTotal: null, count: 'none', ...over };
}

function event(over: Partial<ChTourEvent> = {}): ChTourEvent {
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
    entries: ['ava', 'theo', 'sofia', 'jonah', 'eli'].map((playerId, i) => ({ playerId, role: 'lineup', slot: i + 1, squad: 'A' })).concat([{ playerId: 'will', role: 'alternate', slot: null, squad: 'A' }]) as ChTourEvent['entries'],
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

const ctx = (over: Partial<ChTourEvent> = {}, ledger: ChTourHoleLedger | null = null): ChPlanContext => ({ event: event(over), players: ROSTER, ledger, courses: { pin: COURSE }, teamName: 'Demo University' });

/** A hole-by-hole file: our five and Elon's five, two rounds. */
function holesFile(cards: Record<string, [number[], number[]]>) {
  const rows = [['Player', 'Team', 'Round', ...HOLES, 'Total']];
  for (const [who, [r1, r2]] of Object.entries(cards)) {
    const team = who.startsWith('Elon') ? 'Elon University' : 'Demo University';
    const name = who.replace(/^Elon /, '');
    rows.push([name, team, '1', ...r1.map(String), String(total(r1))]);
    rows.push([name, team, '2', ...r2.map(String), String(total(r2))]);
  }
  return readResults([{ name: 'Hole by hole', rows }]);
}

const OURS = { 'Lindqvist, Ava': [card(0), card(1)], 'Theo Marchetti': [card(1), card(1)], 'Sofia Alvarez': [card(2), card(0)], 'Jonah Okafor': [card(3), card(2)], 'Eli Brandt': [card(4), card(4)] } as Record<string, [number[], number[]]>;
const ELON = { 'Elon Kai Ito': [card(0), card(0)], 'Elon Bo Kim': [card(1), card(2)], 'Elon Max Roy': [card(1), card(1)], 'Elon Lu Chen': [card(2), card(2)], 'Elon Ren Ota': [card(5), card(1)] } as Record<string, [number[], number[]]>;

describe('results import: names', () => {
  it('scores a name against the roster: the same, turned round, a nickname, an initial, a typo', () => {
    expect(nameScore('Ava Lindqvist', 'Ava Lindqvist')).toBe(1);
    expect(nameScore('Ava Marie Lindqvist', 'Ava Lindqvist')).toBe(0.95);
    expect(nameScore('Will Harper', 'William Harper')).toBe(0.9);
    expect(nameScore('W. Harper', 'William Harper')).toBe(0.8);
    expect(nameScore('Ava Lindqvst', 'Ava Lindqvist')).toBeGreaterThanOrEqual(0.8);
    expect(nameScore('Bo Kim', 'Ava Lindqvist')).toBe(0);
  });

  it('never matches two names in the file to one player, and leaves an even choice unmatched', () => {
    const m = matchNames(['Ava Lindqvist', 'A. Lindqvist'], ROSTER);
    expect(m.map((x) => x.playerId)).toEqual(['ava', null]);
    const twins = [player('a', 'Sam Lee'), player('b', 'Sam Lee')];
    expect(matchNames(['Sam Lee'], twins)[0]).toMatchObject({ playerId: null, how: 'none' });
  });

  it('matches team names written differently', () => {
    expect(sameTeam('Demo Univ.', 'Demo University')).toBe(true);
    expect(sameTeam('University of Demo', 'Demo')).toBe(true);
    expect(sameTeam('Elon University', 'Elon')).toBe(true);
    expect(sameTeam('Elon', 'Wake Forest')).toBe(false);
  });
});

describe('results import: the plan for our players', () => {
  it('finds our team by its players, and new rounds become cards', () => {
    const plan = buildPlan(holesFile({ ...OURS, ...ELON }), ctx());
    expect(plan.players.map((p) => p.playerId)).toEqual(['ava', 'theo', 'sofia', 'jonah', 'eli']);
    expect(plan.players.every((p) => p.rounds.every((r) => r.action === 'new'))).toBe(true);
    const input = importInput(plan, ctx());
    expect(input.cards).toHaveLength(10);
    expect(input.cards[0]).toMatchObject({ roundEventId: 'r1', playerId: 'ava', date: '2026-10-20', pars: PARS, total: null, status: 'ok', replace: false });
    expect(input.cards[0]!.holes).toEqual(card(0));
  });

  it('a round already holding the same card is left alone; an open card with different holes is the coach’s call', () => {
    const ledger: ChTourHoleLedger = {
      courseId: 'pin',
      pars: PARS,
      handicaps: [],
      totalsOnly: [],
      cards: [
        { playerId: 'ava', roundNumber: 1, roundEventId: 'r1', startHole: 1, holes: card(0).map((s, i) => ({ n: i + 1, par: PARS[i]!, strokes: s, source: 'card', disputed: false })) },
        { playerId: 'theo', roundNumber: 1, roundEventId: 'r1', startHole: 1, holes: card(1, 5).map((s, i) => ({ n: i + 1, par: PARS[i]!, strokes: s, source: 'card', disputed: false })) },
      ],
    };
    const c = ctx({ playerRounds: [pr({ playerId: 'ava', roundNumber: 1, roundId: 'g1', total: 72, holesKnown: true, cardOpen: true }), pr({ playerId: 'theo', roundNumber: 1, roundId: 'g2', total: 73, holesKnown: true, cardOpen: true })] }, ledger);
    const plan = buildPlan(holesFile(OURS), c);
    const ava = plan.players.find((p) => p.playerId === 'ava')!.rounds[0]!;
    const theo = plan.players.find((p) => p.playerId === 'theo')!.rounds[0]!;
    expect(ava.action).toBe('same');
    // Same total (73), the bogey on a different hole: the team score is the same, so the card stays by default.
    expect(theo).toMatchObject({ action: 'differs', differsOn: [1, 5], use: 'card' });
    expect(importInput(plan, c).cards.some((x) => x.playerId === 'theo' && x.roundEventId === 'r1')).toBe(false);
  });

  it('a submitted round that differs takes the official score as an entered total, never as holes', () => {
    const c = ctx({ playerRounds: [pr({ playerId: 'eli', roundNumber: 2, roundId: 'g9', total: 74, cardOpen: false })] });
    const plan = buildPlan(holesFile(OURS), c);
    const eli = plan.players.find((p) => p.playerId === 'eli')!.rounds[1]!;
    expect(eli).toMatchObject({ action: 'differs', use: 'file', total: 76 });
    expect(importInput(plan, c).cards.find((x) => x.playerId === 'eli' && x.roundEventId === 'r2')).toMatchObject({ holes: null, pars: null, total: 76, replace: true });
  });

  it('holes for an entered total that says the same fill it in as a card', () => {
    const c = ctx({ playerRounds: [pr({ playerId: 'jonah', roundNumber: 1, total: 75, source: 'coach' })] });
    const plan = buildPlan(holesFile(OURS), c);
    expect(plan.players.find((p) => p.playerId === 'jonah')!.rounds[0]!.action).toBe('update');
    expect(importInput(plan, c).cards.find((x) => x.playerId === 'jonah' && x.roundEventId === 'r1')).toMatchObject({ holes: card(3), replace: true });
  });

  it('skips an alternate and a round the event doesn’t have, and asks for the round when the file names none', () => {
    const read = readResults([{ name: 'Card', rows: [['Name', ...HOLES], ['William Harper', ...card(0).map(String)], ['Ava Lindqvist', ...card(0).map(String)]] }]);
    const plan = buildPlan(read, ctx({ playerRounds: [pr({ playerId: 'ava', roundNumber: 1, total: 72, source: 'coach' })] }));
    expect(plan.pickRound).toBe(2);
    expect(plan.players.find((p) => p.playerId === 'will')!.rounds[0]).toMatchObject({ roundNumber: 2, action: 'skip', skip: 'not_playing' });
    const r3 = readResults([{ name: 'R3', rows: [['Name', ...HOLES], ['Ava Lindqvist', ...card(0).map(String)]] }]);
    const p3 = buildPlan(r3, ctx());
    expect(p3.players[0]!.rounds[0]).toMatchObject({ roundNumber: 3, skip: 'no_round' });
    expect(p3.warnings.join(' ')).toMatch(/round 3, which this event doesn’t/);
  });

  it('a course without hole pars saves round totals instead of holes, and says so', () => {
    const c: ChPlanContext = { ...ctx(), courses: { pin: { ...COURSE, holes: [] } } };
    const plan = buildPlan(holesFile(OURS), c);
    expect(plan.warnings.join(' ')).toMatch(/no hole pars yet/);
    expect(importInput(plan, c).cards[0]).toMatchObject({ holes: null, total: 72 });
  });
});

describe('results import: the field and places', () => {
  it('works out other teams’ round scores from their players by the event’s format', () => {
    const plan = buildPlan(holesFile({ ...OURS, ...ELON }), ctx());
    const elon = plan.teams.find((t) => t.name === 'Elon University')!;
    // Round 1: 72, 73, 73, 74 count (77 drops) = 292. Round 2: 72, 73, 73, 74 count = 292.
    expect(elon).toMatchObject({ us: false, fieldTeamId: null, from: 'players', rounds: [292, 292], total: 584 });
    const us = plan.teams.find((t) => t.us)!;
    // Ours round 1: 72, 73, 74, 75 (76 drops) = 294; round 2: 72, 73, 73, 74 (76 drops) = 292.
    expect(us.rounds).toEqual([294, 292]);
  });

  it('a finished field with every player gets NCAA ladder places; a tie on total goes to the lower dropped scores', () => {
    // Elon tie us at 586 (292 + 294 against our 294 + 292) with lower dropped scores.
    const elon = { ...ELON, 'Elon Kai Ito': [card(1), card(1)], 'Elon Ren Ota': [card(1), card(3)] } as Record<string, [number[], number[]]>;
    const plan = buildPlan(holesFile({ ...OURS, ...elon }), ctx());
    const us = plan.teams.find((t) => t.us)!;
    const them = plan.teams.find((t) => !t.us)!;
    expect(us.total).toBe(586);
    expect(them.total).toBe(586);
    expect(plan.places).toBe('ladder');
    // Their dropped scores: 74 + 75 = 149; ours: 76 + 76 = 152. They win the tie.
    expect(them.place).toEqual({ n: 1, tied: false });
    expect(us.place).toEqual({ n: 2, tied: false });
    const input = importInput(plan, ctx());
    expect(input.teams.find((t) => t.us)).toMatchObject({ rounds: [], place: { n: 2, tied: false }, total: null });
    expect(input.teams.find((t) => !t.us)).toMatchObject({ rounds: [{ n: 1, total: 292 }, { n: 2, total: 294 }], place: { n: 1, tied: false }, total: 586 });
  });

  it('a file’s own team positions win over the ladder; ties stand when the event doesn’t use the NCAA rule', () => {
    const teamSheet = { name: 'Team', rows: [['Pos', 'Team', 'R1', 'R2', 'Total'], ['T1', 'Demo University', '290', '290', '580'], ['T1', 'Elon', '291', '289', '580']] };
    const field: ChTourField = { size: 2, entered: 0, teams: [{ id: 'f-us', name: 'Demo', us: true, squad: 'A', sameDivision: true, seed: null, rounds: [null, null], total: null, toPar: null, place: null, placeN: null, thru: null, enteredAt: null, source: 'card' }, { id: 'f-elon', name: 'Elon University', us: false, squad: 'A', sameDivision: true, seed: null, rounds: [null, null], total: null, toPar: null, place: null, placeN: null, thru: null, enteredAt: null, source: 'coach' }], line: null, asOf: null };
    const plan = buildPlan(readResults([teamSheet]), ctx({ field }));
    expect(plan.places).toBe('file');
    expect(plan.teams.find((t) => t.name === 'Elon')).toMatchObject({ fieldTeamId: 'f-elon', place: { n: 1, tied: true } });
    expect(plan.teams.find((t) => t.us)).toMatchObject({ fieldTeamId: 'f-us' });
    const noPos = { name: 'Team', rows: [['Team', 'R1', 'R2'], ['Demo University', '290', '290'], ['Elon', '291', '289']] };
    expect(buildPlan(readResults([noPos]), ctx({ tiebreak: 'ties_stand' })).places).toBe('none');
  });

  it('counts what the Save button says', () => {
    const plan = buildPlan(holesFile({ ...OURS, ...ELON }), ctx());
    expect(planCounts(plan)).toMatchObject({ cards: 10, same: 0, differs: 0, unmatched: 0, teams: 1, newTeams: 1 });
  });
});
