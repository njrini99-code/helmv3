import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  ago,
  buildTimeline,
  touchesForTeam,
  dailyPeopleActive,
  filterTeams,
  isTestTeam,
  needsCards,
  parseTeamParams,
  parseTeamsParams,
  sortPeople,
  sortTeams,
  stateCounts,
  summarizePerson,
  summarizeTeamPeople,
  teamState,
  teamsHeadline,
  teamsHref,
  type Member,
  type TeamActivityRow,
  type Touch,
} from '../people-space-model';

const NOW = new Date('2026-11-26T15:00:00.000Z');
const at = (daysAgo: number, hours = 0) => new Date(NOW.getTime() - daysAgo * DAY_MS - hours * 3_600_000).toISOString();

const coach: Member = { teamId: 't1', userId: 'c1', role: 'coach', name: 'Pat Coach', title: 'Head coach', isPrimary: true };
const player = (id: string, name: string | null = `Player ${id}`): Member => ({ teamId: 't1', userId: id, role: 'player', name, title: null, isPrimary: false });
const touch = (userId: string, daysAgo: number, kind: Touch['kind'] = 'sign_in'): Touch => ({ userId, at: at(daysAgo), kind, source: 'x' });
const opts = { now: NOW, errors30d: 0, device: null, roundsArePerPerson: true };

function row(over: Partial<TeamActivityRow> & { teamId: string }): TeamActivityRow {
  return {
    name: over.teamId,
    sport: 'golf',
    isTest: false,
    players: 5,
    coaches: 1,
    people: 6,
    activeToday: 0,
    active7d: 0,
    active30d: 0,
    playersActive7d: 0,
    coachesActive7d: 0,
    lastSignIn: null,
    activity: [],
    rounds30d: 0,
    rounds7d: 0,
    errors30d: 0,
    state: 'dormant',
    daysSinceActivity: null,
    attentionScore: 0,
    href: `/admin/spaces/people/${over.teamId}`,
    ...over,
  };
}

describe('teamState (follows the Teams pulse halo)', () => {
  it('maps fresh to active and cooling to slipping', () => {
    expect(teamState('fresh', false)).toBe('active');
    expect(teamState('cooling', false)).toBe('slipping');
  });
  it('splits silent into dormant (history) and never started (nothing ever recorded)', () => {
    expect(teamState('silent', true)).toBe('dormant');
    expect(teamState('silent', false)).toBe('never');
  });

  it('never ties a player message to the player name', () => {
    const items = buildTimeline(
      [{ userId: 'p', at: '2026-11-20T10:00:00Z', kind: 'message', source: 'golf_messages' }, { userId: 'p', at: '2026-11-21T10:00:00Z', kind: 'round', source: 'golf_rounds' }],
      new Map([['p', { name: 'Pat Player', role: 'player' as const }]]),
      [],
    );
    expect(items.map((i) => [i.kind, i.who])).toEqual([['round', 'Pat Player'], ['message', 'A player']]);
  });
});

describe('ago', () => {
  it('reads minutes, hours and days, and null stays null', () => {
    expect(ago(null, NOW)).toBeNull();
    expect(ago(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe('just now');
    expect(ago(new Date(NOW.getTime() - 12 * 60_000).toISOString(), NOW)).toBe('12 min ago');
    expect(ago(at(0, 1), NOW)).toBe('1 hour ago');
    expect(ago(at(1), NOW)).toBe('1 day ago');
    expect(ago(at(34), NOW)).toBe('34 days ago');
  });
});

describe('summarizePerson', () => {
  it('counts a person active this week from any of their own timestamps, not only sign-ins', () => {
    const p = summarizePerson(player('p1'), [touch('p1', 3, 'message')], opts);
    expect(p.active7d).toBe(true);
    expect(p.activeToday).toBe(false);
    expect(p.lastSignInAt).toBeNull();
    expect(p.messages30d).toBe(1);
    // Privacy (players may be minors): a player's message counts as activity, but its time is never shown by name.
    expect(p.lastActive).toBeNull();
    expect(p.daysActive30).toBe(0);
    expect(p.quietDays).toBeNull();
  });

  it('shows a coach\'s message as their last activity', () => {
    const c = summarizePerson({ ...player('c1'), role: 'coach' }, [touch('c1', 3, 'message')], opts);
    expect(c.lastActive?.kind).toBe('message');
    expect(c.daysActive30).toBe(1);
  });

  it('counts a round, game or event only for the team it belongs to', () => {
    const t = [
      { ...touch('p1', 2, 'round'), teamId: 'A' },
      { ...touch('p1', 3, 'round'), teamId: null },
      touch('p1', 4, 'sign_in'),
    ];
    expect(touchesForTeam(t, 'A').map((x) => x.kind)).toEqual(['round', 'sign_in']);
    expect(touchesForTeam(t, 'B').map((x) => x.kind)).toEqual(['sign_in']);
  });

  it('marks round days on the strip and counts rounds only when they are per person', () => {
    const touches = [touch('p1', 2, 'round'), touch('p1', 2, 'sign_in'), touch('p1', 5, 'sign_in')];
    const golf = summarizePerson(player('p1'), touches, opts);
    expect(golf.rounds30d).toBe(1);
    expect(golf.daysActive30).toBe(2);
    expect(golf.days[golf.days.length - 3]).toBe('round');
    expect(golf.days[golf.days.length - 6]).toBe('active');
    const baseball = summarizePerson(player('p1'), touches, { ...opts, roundsArePerPerson: false });
    expect(baseball.rounds30d).toBeNull();
  });

  it('uses the all-time sign-in when the window held none, and reads null as no sign-in recorded', () => {
    const quiet = summarizePerson(player('p1'), [], { ...opts, signInEver: at(60) });
    expect(quiet.lastSignInAt).toBe(at(60));
    expect(quiet.active30d).toBe(false);
    expect(quiet.quietDays).toBeNull();
    const never = summarizePerson(player('p2'), [], opts);
    expect(never.lastSignInAt).toBeNull();
    expect(never.lastActive).toBeNull();
  });

  it('keeps a failed error read as null, never zero', () => {
    expect(summarizePerson(player('p1'), [], { ...opts, errors30d: null }).errors30d).toBeNull();
  });

  it('ignores timestamps from the future', () => {
    const p = summarizePerson(player('p1'), [{ userId: 'p1', at: new Date(NOW.getTime() + DAY_MS).toISOString(), kind: 'sign_in', source: 'x' }], opts);
    expect(p.lastActive).toBeNull();
  });
});

describe('summarizeTeamPeople: the coach / player split', () => {
  const people = [
    summarizePerson(coach, [touch('c1', 0, 'sign_in')], opts),
    summarizePerson(player('p1'), [touch('p1', 2, 'message')], opts),
    summarizePerson(player('p2'), [touch('p2', 9, 'sign_in')], opts),
    summarizePerson(player('p3'), [], opts),
  ];
  const s = summarizeTeamPeople(people);

  it('counts active this week by role', () => {
    expect(s.people).toBe(4);
    expect(s.active7d).toBe(2);
    expect(s.coaches).toMatchObject({ total: 1, active7d: 1 });
    expect(s.players).toMatchObject({ total: 3, active7d: 1, active30d: 2, noSignIn: 2 });
  });

  it('says who signed in last, with their role', () => {
    expect(s.lastSignIn).toMatchObject({ userId: 'c1', role: 'coach', name: 'Pat Coach' });
  });

  it('breaks a tie in favour of the coach', () => {
    const same = at(1);
    const tie = summarizeTeamPeople([
      summarizePerson(player('p1'), [{ userId: 'p1', at: same, kind: 'sign_in', source: 'x' }], opts),
      summarizePerson(coach, [{ userId: 'c1', at: same, kind: 'sign_in', source: 'x' }], opts),
    ]);
    expect(tie.lastSignIn?.role).toBe('coach');
  });

  it('has no last sign-in when nobody has one recorded', () => {
    expect(summarizeTeamPeople([summarizePerson(player('p1'), [], opts)]).lastSignIn).toBeNull();
  });
});

describe('sortPeople', () => {
  const a = summarizePerson(player('a', 'Ava'), [touch('a', 5)], opts);
  const b = summarizePerson(player('b', 'Ben'), [touch('b', 1)], opts);
  const c = summarizePerson(player('c', 'Cal'), [], opts);
  it('puts the latest sign-in first and people with none last', () => {
    expect(sortPeople([c, a, b], 'signin').map((p) => p.userId)).toEqual(['b', 'a', 'c']);
  });
  it('sorts by name', () => {
    expect(sortPeople([c, b, a], 'name').map((p) => p.userId)).toEqual(['a', 'b', 'c']);
  });
});

describe('dailyPeopleActive', () => {
  it('counts distinct members per day and marks round days', () => {
    const touches = [touch('p1', 0), touch('p1', 0, 'message'), touch('p2', 0), touch('x', 0), touch('p1', 3, 'round')];
    const { values, roundDays } = dailyPeopleActive(touches, new Set(['p1', 'p2']), NOW);
    expect(values).toHaveLength(30);
    expect(values[29]).toBe(2);
    expect(values[26]).toBe(1);
    expect(roundDays).toEqual([26]);
  });
});

describe('isTestTeam', () => {
  const demo = new Set(['demo-id']);
  it('flags demo ids and test words, not names that merely contain the letters', () => {
    expect(isTestTeam('demo-id', 'Real Name', demo)).toBe(true);
    expect(isTestTeam('x', 'QA Baseball', demo)).toBe(true);
    expect(isTestTeam('x', 'Baseball Test 2', demo)).toBe(true);
    expect(isTestTeam('x', 'Contest University', demo)).toBe(false);
    expect(isTestTeam('x', 'Guilford College Golf', demo)).toBe(false);
  });
});

describe('teams list: params, filters, sorts', () => {
  it('parses params with safe defaults and round-trips hrefs', () => {
    expect(parseTeamsParams({})).toEqual({ sport: 'all', sort: 'active', hideTest: false });
    const p = parseTeamsParams({ sport: 'baseball', sort: 'errors', test: 'hide' });
    expect(p).toEqual({ sport: 'baseball', sort: 'errors', hideTest: true });
    expect(teamsHref(p)).toBe('/admin/spaces/people?sport=baseball&sort=errors&test=hide');
    expect(teamsHref(p, { sport: 'all', sort: 'active', hideTest: false })).toBe('/admin/spaces/people');
    expect(parseTeamsParams({ sport: 'hockey', sort: 'nope' })).toEqual({ sport: 'all', sort: 'active', hideTest: false });
  });

  it('filters by sport and hides test teams', () => {
    const rows = [row({ teamId: 'a' }), row({ teamId: 'b', sport: 'baseball' }), row({ teamId: 'c', isTest: true })];
    expect(filterTeams(rows, { sport: 'golf', hideTest: false }).map((r) => r.teamId)).toEqual(['a', 'c']);
    expect(filterTeams(rows, { sport: 'all', hideTest: true }).map((r) => r.teamId)).toEqual(['a', 'b']);
  });

  it('sorts four ways', () => {
    const rows = [
      row({ teamId: 'quiet', active7d: 0, errors30d: 9, attentionScore: 5, lastSignIn: { at: at(20), role: 'coach' } }),
      row({ teamId: 'busy', active7d: 4, errors30d: 1, attentionScore: 1, lastSignIn: { at: at(3), role: 'player' }, state: 'active' }),
      row({ teamId: 'recent', active7d: 1, errors30d: 0, attentionScore: 9, lastSignIn: { at: at(0), role: 'coach' }, state: 'active' }),
      row({ teamId: 'never', state: 'never' }),
    ];
    expect(sortTeams(rows, 'active').map((r) => r.teamId)).toEqual(['busy', 'recent', 'quiet', 'never']);
    expect(sortTeams(rows, 'seen').map((r) => r.teamId)).toEqual(['recent', 'busy', 'quiet', 'never']);
    expect(sortTeams(rows, 'attention')[0]!.teamId).toBe('recent');
    expect(sortTeams(rows, 'errors')[0]!.teamId).toBe('quiet');
  });
});

describe('headline and needs cards', () => {
  const rows = [
    row({ teamId: 'a', state: 'active', isTest: true, rounds7d: 2 }),
    row({ teamId: 'b', state: 'slipping', errors30d: 12 }),
    row({ teamId: 'c', state: 'slipping', errors30d: 3 }),
    row({ teamId: 'd', state: 'dormant', people: 21 }),
    row({ teamId: 'e', state: 'dormant', people: 4 }),
    row({ teamId: 'f', state: 'never' }),
    row({ teamId: 'g', state: 'active', isTest: true, players: 14, coachesActive7d: 1, playersActive7d: 0 }),
  ];

  it('builds the headline from the rows', () => {
    expect(stateCounts(rows)).toEqual({ active: 2, slipping: 2, dormant: 2, never: 1 });
    const h = teamsHeadline(rows);
    expect(h.title).toBe('4 of 7 teams active in two weeks.');
    expect(h.second).toBe('3 quiet for two weeks.');
    expect(h.lede).toContain('Two teams did something in the last two days, and all are test or demo teams.');
    expect(h.lede).toContain('Two more are slipping');
    expect(h.lede).toContain('2 rounds and games logged this week.');
  });

  it('says so when nothing is quiet or nothing was logged', () => {
    const h = teamsHeadline([row({ teamId: 'a', state: 'active' })]);
    expect(h.second).toBe('None quiet for two weeks.');
    expect(h.lede).toContain('Nobody logged a round or game this week.');
  });

  it('picks one team per rule', () => {
    const cards = needsCards(rows);
    expect(cards.map((c) => [c.kind, c.row.teamId])).toEqual([
      ['errors-slipping', 'b'],
      ['went-quiet', 'd'],
      ['staff-only', 'g'],
    ]);
  });

  it('shows no card for a rule nothing matches', () => {
    expect(needsCards([row({ teamId: 'a', state: 'active' })])).toEqual([]);
  });
});

describe('team page', () => {
  it('parses the tab and people sort', () => {
    expect(parseTeamParams({})).toEqual({ tab: 'people', sort: 'signin' });
    expect(parseTeamParams({ tab: 'errors', sort: 'name' })).toEqual({ tab: 'errors', sort: 'name' });
    expect(parseTeamParams({ tab: 'x' }).tab).toBe('people');
  });

  it('builds a newest-first timeline from names and roles, never an email', () => {
    const items = buildTimeline(
      [touch('p1', 2, 'message'), touch('c1', 0, 'sign_in'), touch('p9', 1, 'round')],
      new Map([
        ['p1', { name: null, role: 'player' as const }],
        ['c1', { name: 'Pat Coach', role: 'coach' as const }],
      ]),
      [{ at: at(1, 2), kind: 'insight', what: 'CoachHelm wrote an insight', who: null, role: null, source: 'golf_coach_insights' }],
    );
    expect(items.map((i) => i.who)).toEqual(['Pat Coach', null, null, 'A player']);
    expect(items[0]!.what).toBe('Signed in');
    expect(JSON.stringify(items)).not.toMatch(/@/);
  });
});
