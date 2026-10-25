import { describe, expect, it } from 'vitest';
import { tourFixture } from '../../preview/fixtures-tournaments';
import type { ChTourEvent } from '../../screens/tournaments/types';
import { classYear, lineupStateOf, roundStatusOf, seasonIdOf, shapeEvent, shapeHoles, type TourRawEvent } from '../tournaments-shape';
import type { TourRow } from '@/lib/golf/tournaments-tables';

/**
 * The loaders' shaping, fed rows rebuilt from the preview fixture's events: the same scores must come back as the
 * same team math the fixture carries (Oakmont 287, 286, 285: 858, −6; Dogwood 6 count 5), so the real routes and the
 * preview agree.
 */
const ready = tourFixture('ready');
const NOW = '2026-10-14T16:00:00.000Z';

function rowsOf(e: ChTourEvent, opts: { entered?: boolean; official?: boolean } = {}): TourRawEvent {
  const t: TourRow = {
    id: e.id,
    team_id: 'team',
    name: e.name,
    start_date: e.startDate,
    end_date: e.endDate,
    course_id: e.courseIds[0] ?? null,
    format: e.format.kind,
    players_per_team: e.format.players,
    counting: e.format.counting,
    holes_per_round: e.format.holes,
    rounds_count: e.rounds.length,
    event_kind: 'regular',
    tiebreak: e.tiebreak,
    field_size: e.field?.size ?? null,
    line_kind: null,
    line_value: null,
    substitutions: false,
    lock_minutes: 20,
    lineup_locked_at: '2026-10-05T11:00:00.000Z',
    lineup_published_at: '2026-10-04T22:00:00.000Z',
    official_at: opts.official === false ? null : '2026-10-08T00:00:00.000Z',
    results_url: e.resultsUrl,
    host: null,
    created_by: null,
    created_at: NOW,
    updated_at: NOW,
    version: 3,
  };
  const linked: TourRawEvent['linked'] = {};
  const playerRounds = e.playerRounds.map((p) => {
    const roundId = opts.entered ? null : `g-${p.roundEventId}-${p.playerId}`;
    if (roundId) linked[roundId] = { total: p.total, completed: true, holes: true, shots: p.shotData };
    return {
      round_event_id: p.roundEventId,
      team_id: 'team',
      player_id: p.playerId,
      round_id: roundId,
      entered_total: opts.entered ? p.total : null,
      entered_front: null,
      entered_back: null,
      status: p.status,
      wd_after_hole: null,
      link_source: opts.entered ? null : ('coach' as const),
      note: null,
      updated_at: NOW,
    };
  });
  const fieldTeams = (e.field?.teams ?? []).map((f) => ({
    id: f.id,
    tournament_id: e.id,
    team_id: 'team',
    name: f.name,
    is_us: f.us,
    is_b_team: false,
    same_division: f.sameDivision,
    seed: null,
    final_place: null,
    final_place_tied: false,
    final_total: null,
  }));
  const fieldScores = (e.field?.teams ?? []).filter((f) => !f.us).flatMap((f) => f.rounds.map((total, i) => ({ field_team_id: f.id, team_id: 'team', round_number: i + 1, total, thru: null, entered_at: NOW })));
  return {
    t,
    rounds: e.rounds.map((r) => ({
      round_event_id: r.roundEventId,
      tournament_id: e.id,
      team_id: 'team',
      round_number: r.number,
      course_id: r.courseId,
      tee_id: null,
      start_type: r.startType,
      first_tee_at: r.firstTeeAt,
      status: 'final' as const,
      status_changed_at: NOW,
      event_adopted: false,
      date: r.date,
      par: r.par,
    })),
    entries: e.entries.map((x) => ({ tournament_id: e.id, team_id: 'team', player_id: x.playerId, role: x.role, slot: x.slot })),
    roundLineups: [],
    playerRounds,
    linked,
    fieldTeams,
    fieldScores,
  };
}

describe('shapeEvent: Oakmont (e33) from rows', () => {
  const fixture = ready.desks.e33!.event;
  const shaped = shapeEvent(rowsOf(fixture), NOW);

  it('scores 287, 286 and 285, 858 in all, 6 under, as the fixture does', () => {
    expect(shaped.team.rounds.map((r) => r.total)).toEqual([287, 286, 285]);
    expect(shaped.team.result).toMatchObject({ kind: 'complete', total: 858, toPar: -6 });
    expect(shaped.team.rounds.map((r) => r.par)).toEqual(fixture.team.rounds.map((r) => r.par));
    expect(shaped.team.result!.droppedTotal).toBe(fixture.team.result!.droppedTotal);
  });

  it('counts and drops the same players in every round, and keeps the individual out', () => {
    expect(shaped.team.rounds.map((r) => r.dropped)).toEqual(fixture.team.rounds.map((r) => r.dropped));
    expect(shaped.team.rounds.map((r) => [...r.counting].sort())).toEqual(fixture.team.rounds.map((r) => [...r.counting].sort()));
    const counts = (e: ChTourEvent) => e.playerRounds.map((p) => `${p.roundNumber}:${p.playerId}:${p.count}`).sort();
    expect(counts(shaped)).toEqual(counts(fixture));
  });

  it('places the field and adds the record the fixture shows (Bayside outside the division)', () => {
    expect(shaped.field?.teams.find((t) => t.us)).toMatchObject({ total: 858, place: '3' });
    expect(shaped.field?.teams.filter((t) => t.place === 'T6')).toHaveLength(2);
    expect(shaped.finish).toEqual(fixture.finish);
    expect(shaped.record).toEqual({ w: 10, l: 2, t: 0 });
  });

  it('reads the event as complete and official, with the lineup locked', () => {
    expect(shaped).toMatchObject({ status: 'complete', trust: 'official', mood: 'result', seasonId: '2026-27' });
    expect(shaped.rounds.every((r) => r.status === 'official')).toBe(true);
    expect(shaped.lineup.status).toBe('locked');
    expect(shaped.coverage).toEqual(fixture.coverage);
  });

  it('final without the official mark reads final, not official', () => {
    const final = shapeEvent(rowsOf(fixture, { official: false }), NOW);
    expect(final.trust).toBe('final');
    expect(final.rounds.every((r) => r.status === 'final')).toBe(true);
  });

  it('an entered score is the coach’s, with no holes or shots', () => {
    const entered = shapeEvent(rowsOf(fixture, { entered: true }), NOW);
    expect(entered.team.result?.total).toBe(858);
    expect(entered.playerRounds.every((p) => p.source === 'coach' && !p.holesKnown && !p.shotData && p.roundId === null)).toBe(true);
  });
});

describe('shapeEvent: the other formats', () => {
  it('scores Dogwood (e32) as 6 count 5', () => {
    const fixture = ready.desks.e32!.event;
    const shaped = shapeEvent(rowsOf(fixture), NOW);
    expect(shaped.format).toMatchObject({ kind: '6c5', players: 6, counting: 5 });
    expect(shaped.team.rounds.map((r) => r.total)).toEqual(fixture.team.rounds.map((r) => r.total));
    expect(shaped.team.rounds.every((r) => r.counting.length === 5 && r.dropped.length === 1)).toBe(true);
  });

  it('an upcoming event has no team rounds, no result, and a draft lineup', () => {
    const fixture = ready.desks.e34!.event;
    const raw = rowsOf(fixture, { official: false });
    raw.t.lineup_locked_at = null;
    raw.t.lineup_published_at = null;
    raw.rounds = raw.rounds.map((r) => ({ ...r, status: 'upcoming' }));
    raw.playerRounds = [];
    raw.entries = [{ tournament_id: fixture.id, team_id: 'team', player_id: 'theo', role: 'lineup', slot: 1 }];
    const shaped = shapeEvent(raw, NOW);
    expect(shaped).toMatchObject({ status: 'upcoming', trust: 'upcoming', mood: 'prep', team: { rounds: [], result: null } });
    expect(shaped.lineup).toMatchObject({ status: 'draft', set: 1, of: 5, seen: null });
  });
});

describe('the small mappings', () => {
  it('seasons run August to July', () => {
    expect(seasonIdOf('2026-10-05')).toBe('2026-27');
    expect(seasonIdOf('2027-03-01')).toBe('2026-27');
    expect(seasonIdOf('2026-07-31')).toBe('2025-26');
  });

  it('suspended reads suspended; final is official only with the mark', () => {
    expect(roundStatusOf('suspended_weather', false)).toBe('suspended');
    expect(roundStatusOf('final', true)).toBe('official');
    expect(roundStatusOf('final', false)).toBe('final');
  });

  it('class years from the graduation year', () => {
    expect(classYear(2027, 2027)).toBe('Senior');
    expect(classYear(2029, 2027)).toBe('Sophomore');
    expect(classYear(2026, 2027)).toBe('Graduated 2026');
    expect(classYear(null, 2027)).toBe('');
  });

  it('a lineup published for later is scheduled', () => {
    const fixture = ready.desks.e34!.event;
    const raw = rowsOf(fixture, { official: false });
    raw.t.lineup_locked_at = null;
    raw.t.lineup_published_at = '2026-10-16T22:00:00.000Z';
    expect(lineupStateOf(raw.t, raw.rounds, [], fixture.format, NOW)).toMatchObject({ status: 'scheduled', publishAt: '2026-10-16T22:00:00.000Z', publishedAt: null });
  });

  it('holes come from the linked cards; a totals-only round is listed apart', () => {
    const fixture = ready.desks.e33!.event;
    const shaped = shapeEvent(rowsOf(fixture), NOW);
    const first = shaped.playerRounds[0]!;
    const holes = Array.from({ length: 18 }, (_, i) => ({ round_id: first.roundId!, hole_number: i + 1, par: 4, score: i === 0 ? first.total! - 17 * 4 : 4 }));
    const ledger = shapeHoles(shaped, holes);
    expect(ledger.cards).toHaveLength(1);
    expect(ledger.cards[0]!.holes.reduce((s, h) => s + (h.strokes ?? 0), 0)).toBe(first.total);
    expect(ledger.totalsOnly.length).toBe(shaped.playerRounds.filter((p) => p.total != null).length - 1);
  });
});
