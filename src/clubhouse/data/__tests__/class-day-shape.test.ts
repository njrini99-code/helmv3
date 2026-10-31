import { describe, expect, it } from 'vitest';
import { toClassDay, toClassDayPlayer, toMyClassDay } from '../class-day-shape';

const block = (over: Record<string, unknown> = {}) => ({
  class_id: 'c1',
  label: 'STAT 201 - Probability',
  kind: 'class',
  source: 'pattern',
  starts_at: '2026-10-26T13:30:00+00:00',
  ends_at: '2026-10-26T14:45:00+00:00',
  ...over,
});

const player = (over: Record<string, unknown> = {}) => ({
  player_id: 'p1',
  first_name: 'Theo',
  last_name: 'Park',
  avatar_url: null,
  tracked: true,
  holds: true,
  on_course: false,
  off_today: false,
  away: null,
  blocks: [block()],
  ...over,
});

const term = {
  id: 't1',
  label: 'Fall 2026',
  classes_start: '2026-08-24',
  classes_end: '2026-12-11',
  exams_end: '2026-12-18',
  time_zone: 'America/New_York',
  phase: 'classes',
};

const coachPayload = (over: Record<string, unknown> = {}) => ({
  on: '2026-10-26',
  team_time_zone: 'America/New_York',
  class_time_zone: 'America/Chicago',
  term,
  next_term: { id: 't2', label: 'Spring 2027', classes_start: '2027-01-12' },
  players: [player()],
  ...over,
});

describe('toClassDay', () => {
  it('maps the coach payload from snake_case', () => {
    const day = toClassDay(coachPayload(), 123);
    expect(day).toMatchObject({
      on: '2026-10-26',
      teamTimeZone: 'America/New_York',
      classTimeZone: 'America/Chicago',
      fetchedAt: 123,
      term: { id: 't1', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' },
      nextTerm: { id: 't2', label: 'Spring 2027', classesStart: '2027-01-12' },
    });
    expect(day?.players[0]).toMatchObject({ playerId: 'p1', firstName: 'Theo', lastName: 'Park', tracked: true, holds: true, onCourse: false, offToday: false, away: null });
    expect(day?.players[0]?.blocks[0]).toEqual({
      classId: 'c1',
      label: 'STAT 201 - Probability',
      kind: 'class',
      source: 'pattern',
      startsAt: '2026-10-26T13:30:00+00:00',
      endsAt: '2026-10-26T14:45:00+00:00',
    });
  });

  it('has no shared key: the player type carries only tracked', () => {
    expect(Object.keys(toClassDay(coachPayload())!.players[0]!)).not.toContain('shared');
  });

  it('returns null for a wrong top-level shape', () => {
    for (const bad of [null, undefined, 'x', 3, [], {}, coachPayload({ on: 'today' }), coachPayload({ players: 'no' }), coachPayload({ team_time_zone: '' })]) {
      expect(toClassDay(bad)).toBeNull();
    }
  });

  it('falls back to the team zone when the class zone is missing, and to no term when the term is malformed', () => {
    const day = toClassDay(coachPayload({ class_time_zone: undefined, term: { id: 't1', label: 'x' }, next_term: 3 }));
    expect(day?.classTimeZone).toBe('America/New_York');
    expect(day?.term).toBeNull();
    expect(day?.nextTerm).toBeNull();
  });

  it('skips players without an id and blocks that do not parse (fail open)', () => {
    const day = toClassDay(
      coachPayload({
        players: [
          player({ player_id: null }),
          player({ player_id: 'p2', blocks: [block({ starts_at: 'nope' }), block({ ends_at: '2026-10-26T13:00:00+00:00' }), block({ kind: 'exam', source: 'exam' }), 5] }),
        ],
      }),
    );
    expect(day?.players.map((p) => p.playerId)).toEqual(['p2']);
    expect(day?.players[0]?.blocks).toHaveLength(1);
    expect(day?.players[0]?.blocks[0]?.kind).toBe('exam');
  });

  it('sorts blocks by start and tolerates missing optional fields', () => {
    const day = toClassDay(
      coachPayload({
        players: [
          { player_id: 'p9', blocks: [block({ starts_at: '2026-10-26T16:00:00+00:00', ends_at: '2026-10-26T17:00:00+00:00' }), block()] },
        ],
      }),
    );
    const p = day!.players[0]!;
    expect(p).toMatchObject({ firstName: null, tracked: false, holds: false, onCourse: false, away: null });
    expect(p.blocks.map((b) => b.startsAt)).toEqual(['2026-10-26T13:30:00+00:00', '2026-10-26T16:00:00+00:00']);
  });

  it('never reads a hold on an untracked player', () => {
    expect(toClassDayPlayer(player({ tracked: false, holds: true }))?.holds).toBe(false);
  });

  it('maps a trip', () => {
    const p = toClassDayPlayer(player({ away: { destination: 'Pinehurst', return_date: '2026-10-29', confirmed: true } }));
    expect(p?.away).toEqual({ destination: 'Pinehurst', returnDate: '2026-10-29', confirmed: true });
    expect(toClassDayPlayer(player({ away: { destination: 'X', return_date: 'soon' } }))?.away).toEqual({ destination: 'X', returnDate: null, confirmed: false });
  });
});

describe('toMyClassDay', () => {
  const mine = (over: Record<string, unknown> = {}) => ({
    on: '2026-10-26',
    team_id: 'team1',
    team_time_zone: 'America/New_York',
    class_time_zone: 'America/New_York',
    term,
    settings: { share_status: false, hold_pushes: true },
    player: player({ tracked: false, holds: false, blocks: [] }),
    blocks: [block()],
    untagged_classes: 2,
    unusable_classes: [
      { class_id: 'c2', reason: 'times' },
      { class_id: 'c3', reason: 'calendar_mismatch' },
      { class_id: 'c4', reason: 'nonsense' },
      { reason: 'days' },
    ],
    held: { count: 3, release_at: '2026-10-26T14:45:00+00:00' },
    ...over,
  });

  it('maps the player payload, keeping their own blocks whatever the sharing switch says', () => {
    const day = toMyClassDay(mine(), 5);
    expect(day).toMatchObject({ teamId: 'team1', settings: { shareStatus: false, holdPushes: true }, untaggedClasses: 2, fetchedAt: 5 });
    expect(day?.blocks).toHaveLength(1);
    expect(day?.player?.tracked).toBe(false);
    expect(day?.player?.blocks).toEqual([]);
  });

  it('reads unusable classes with their reason and drops malformed entries', () => {
    expect(toMyClassDay(mine())?.unusableClasses).toEqual([
      { classId: 'c2', reason: 'times' },
      { classId: 'c3', reason: 'calendar_mismatch' },
    ]);
  });

  it('reads a zero or missing held count as null', () => {
    expect(toMyClassDay(mine({ held: { count: 0, release_at: null } }))?.held).toBeNull();
    expect(toMyClassDay(mine({ held: null }))?.held).toBeNull();
    expect(toMyClassDay(mine())?.held).toEqual({ count: 3, releaseAt: '2026-10-26T14:45:00+00:00' });
  });

  it('defaults a missing settings object to sharing and holding on', () => {
    expect(toMyClassDay(mine({ settings: undefined }))?.settings).toEqual({ shareStatus: true, holdPushes: true });
  });

  it('returns null for a player with no team or a wrong shape', () => {
    expect(toMyClassDay({ player: null })).toBeNull();
    expect(toMyClassDay(mine({ team_id: null }))).toBeNull();
    expect(toMyClassDay(null)).toBeNull();
  });
});
