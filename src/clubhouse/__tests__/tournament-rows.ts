import type { TourRawEvent } from '../data/tournaments-shape';
import type { ChTourEvent } from '../screens/tournaments/types';
import type { TourRow } from '@/lib/golf/tournaments-tables';

/**
 * Test helper: an event's stored rows rebuilt from a shaped view event (the preview fixture's), so a test can feed the
 * loaders' shaper (`shapeEvent`) the same scores, change a row, and check the team math the views then read.
 */
const NOW = '2026-10-14T16:00:00.000Z';

export function rowsOf(e: ChTourEvent, opts: { entered?: boolean; official?: boolean } = {}): TourRawEvent {
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
