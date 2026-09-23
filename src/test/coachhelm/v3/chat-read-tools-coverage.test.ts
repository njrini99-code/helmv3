import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

// getPlayerInsights (A6 top-N audit) now routes through the canonical
// rank->collapse->dedupe pipeline, which loads the player's real coach
// weights + active goals — both hit their own tables via a fresh client, so
// they must be mocked the same way insight-delivery.ts's own tests mock them.
vi.mock('@/lib/coachhelm/v3/ranking/score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/ranking/score')>();
  return { ...actual, loadCoachWeightsForPlayer: vi.fn(async () => ({})) };
});
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({
  loadActiveGoals: vi.fn(async () => []),
}));

import {
  comparePlayers,
  getFocusAreas,
  getOpenTasks,
  getPlayerInsights,
  getPlayerMetric,
  getPlayerTrend,
  getPlayerWeakestAreas,
  getRecentRounds,
  getTeamMetricRanking,
  getUpcomingEvents,
  resolvePlayerReference,
} from '@/lib/coachhelm/v3/chat/read-tools';

type QueryResult = { data: unknown; error: unknown };

function player(id: string, firstName: string, lastName: string) {
  return {
    id,
    name: `${firstName} ${lastName}`,
    first_name: firstName,
    last_name: lastName,
    graduation_year: null,
  };
}

const roster = [
  player('p1', 'Avery', 'Stone'),
  player('p2', 'Blake', 'Reed'),
  player('p3', 'Casey', 'Jones'),
  player('p4', 'Drew', 'Mills'),
];

const ctx: CoachChatContext = {
  coach_id: 'coach-1',
  user_id: 'user-1',
  team_id: 'team-1',
  team_name: 'Helm University',
  timezone: 'America/New_York',
  roster,
};

/**
 * Fluent PostgREST double with one queued response per `from(table)` call.
 * Assertions stay on the envelopes returned by the real read tools; the
 * double only replaces the external database boundary.
 */
function sbWith(script: Record<string, Array<Partial<QueryResult>>>) {
  const queues = new Map(
    Object.entries(script).map(([table, results]) => [
      table,
      results.map((result) => ({ data: result.data ?? null, error: result.error ?? null })),
    ]),
  );

  return {
    from: vi.fn((table: string) => {
      const result = queues.get(table)?.shift() ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit', 'or']) {
        chain[method] = vi.fn(() => chain);
      }
      chain.maybeSingle = vi.fn(async () => result);
      chain.then = (
        resolve: (value: QueryResult) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return chain;
    }),
  } as never;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CoachHelm read tools — sourced envelope contracts', () => {
  it('uses the stats-cache timestamp and sample size for a player metric', async () => {
    const envelope = await getPlayerMetric(
      sbWith({
        golf_player_stats_cache: [{
          data: {
            player_id: 'p1',
            scoring_average: 74.5,
            rounds_in_calculation: 8,
            updated_at: '2026-08-17T12:00:00.000Z',
            is_stale: false,
          },
        }],
      }),
      ctx,
      { player_id: 'p1', metric_ids: ['scoring_average'] },
    );

    expect(envelope.as_of).toBe('2026-08-17T12:00:00.000Z');
    expect(envelope.measurements[0]).toMatchObject({
      metric_id: 'scoring_average',
      value: 74.5,
      sample_size: 8,
      source: 'stats cache',
    });
  });

  it('orders a higher-is-better team metric and reports missing teammates', async () => {
    const envelope = await getTeamMetricRanking(
      sbWith({
        golf_player_stats_cache: [{
          data: [
            { player_id: 'p1', gir_percentage: 55, greens_total: 90, updated_at: '2026-08-17T12:00:00Z' },
            { player_id: 'p2', gir_percentage: 65, greens_total: 90, updated_at: '2026-08-17T12:00:00Z' },
            { player_id: 'p3', gir_percentage: null, greens_total: 90, updated_at: '2026-08-17T12:00:00Z' },
          ],
        }],
      }),
      ctx,
      { metric_id: 'gir_pct' },
    );

    expect(envelope.measurements.map((measurement) => measurement.entity.id)).toEqual(['p2', 'p1', 'p3']);
    expect(envelope.coverage).toBe('partial');
    expect(envelope.coverage_note).toContain('Casey Jones');
    expect(envelope.coverage_note).toContain('Drew Mills');
  });

  it('returns a chronological trend even though the database read is newest-first', async () => {
    const envelope = await getPlayerTrend(
      sbWith({
        golf_rounds: [{
          data: [
            { id: 'r2', round_date: '2026-08-10', course_name: 'North', round_type: 'tournament', score_to_par: 2 },
            { id: 'r1', round_date: '2026-08-01', course_name: 'South', round_type: 'practice', score_to_par: 6 },
          ],
        }],
      }),
      ctx,
      { player_id: 'p1', metric_id: 'score_to_par', last_n: 5 },
    );

    expect(envelope.series[0]?.points.map((point) => [point.at, point.value])).toEqual([
      ['2026-08-01', 6],
      ['2026-08-10', 2],
    ]);
    expect(envelope.measurements[0]?.value).toBe(4);
  });

  it('warns when a comparison uses materially different sample sizes', async () => {
    const envelope = await comparePlayers(
      sbWith({
        golf_player_stats_cache: [{
          data: [
            { player_id: 'p1', scoring_average: 73, rounds_in_calculation: 10, updated_at: '2026-08-17T12:00:00Z' },
            { player_id: 'p2', scoring_average: 77, rounds_in_calculation: 2, updated_at: '2026-08-17T12:00:00Z' },
          ],
        }],
      }),
      ctx,
      { player_ids: ['p1', 'p2'], metric_ids: ['scoring_average'] },
    );

    expect(envelope.coverage).toBe('complete');
    expect(envelope.coverage_note).toMatch(/very different amounts of recorded data/i);
    expect(envelope.coverage_note).toContain('Avery Stone: 10');
    expect(envelope.coverage_note).toContain('Blake Reed: 2');
  });

  it('identifies a measured weakness only when at least three peers support it', async () => {
    const envelope = await getPlayerWeakestAreas(
      sbWith({
        golf_player_stats_cache: [{
          data: [
            { player_id: 'p1', gir_percentage: 40, greens_total: 90, rounds_in_calculation: 5, updated_at: '2026-08-17T12:00:00Z' },
            { player_id: 'p2', gir_percentage: 60, greens_total: 90, rounds_in_calculation: 5 },
            { player_id: 'p3', gir_percentage: 65, greens_total: 90, rounds_in_calculation: 5 },
            { player_id: 'p4', gir_percentage: 70, greens_total: 90, rounds_in_calculation: 5 },
          ],
        }],
      }),
      ctx,
      { player_id: 'p1' },
    );

    expect(envelope.summary).toContain('greens in regulation');
    expect(envelope.measurements.map((measurement) => measurement.metric_id)).toContain('gir_pct');
    expect((envelope.detail as { gaps: Array<{ team_peers_compared: number }> }).gaps[0]?.team_peers_compared).toBe(3);
  });

  it('maps recent rounds into the bounded coach-facing detail shape', async () => {
    const envelope = await getRecentRounds(
      sbWith({
        golf_rounds: [{
          data: [{
            id: 'round-1',
            round_date: '2026-08-16',
            course_name: 'Pine Valley',
            round_type: 'tournament',
            total_score: 72,
            score_to_par: 1,
            total_putts: 29,
            strokes_gained_total: 0.8,
          }],
        }],
      }),
      ctx,
      { player_id: 'p1', last_n: 5 },
    );

    expect((envelope.detail as { rounds: unknown[] }).rounds).toEqual([
      {
        round_id: 'round-1',
        date: '2026-08-16',
        course: 'Pine Valley',
        round_type: 'tournament',
        total_score: 72,
        to_par: 1,
        putts: 29,
        sg_total: 0.8,
      },
    ]);
  });

  it('returns only the evidence fields the chat may cite from an insight', async () => {
    const envelope = await getPlayerInsights(
      sbWith({
        golf_coach_insights: [{
          data: [{
            id: 'insight-1',
            player_id: 'p1',
            insight_type: 'trend',
            category: 'putting',
            title: 'Inside six feet',
            content: 'Conversion improved.',
            // strokes_impact/confidence/metric are the eligibility floor
            // `mapRowToRankable` (insight-delivery-ranking.ts) applies — a row
            // missing any of them can't be scored, so it can't be ranked into
            // this tool's output either (A6: same floor as the feed).
            evidence: {
              metric_label: 'Make rate',
              your_value_display: '82%',
              strokes_impact: 0.6,
              confidence: 0.8,
              metric: 'putts_made_5_10ft_pct',
            },
            lifecycle_state: 'detected',
            status: 'active',
            priority: 'medium',
            created_at: '2026-08-17T12:00:00Z',
            updated_at: '2026-08-17T12:00:00Z',
          }],
        }],
      }),
      ctx,
      { player_id: 'p1', limit: 5 },
    );

    expect((envelope.detail as { insights: unknown[] }).insights).toEqual([
      {
        insight_id: 'insight-1',
        type: 'trend',
        category: 'putting',
        title: 'Inside six feet',
        content: 'Conversion improved.',
        metric_label: 'Make rate',
        value_display: '82%',
        created_at: '2026-08-17T12:00:00Z',
      },
    ]);
  });

  it('ranks by the canonical composite, not DB/array order (A6 revert-check)', async () => {
    // Five recent, low-impact rows come FIRST in array/DB order; one older,
    // high-impact row comes LAST. The pre-fix code trusted `created_at DESC`
    // order straight from the DB and just sliced to `limit` — under that
    // behavior the low-impact rows would win and the high-impact row (last
    // in the array, and outside a small limit) would never surface. The fix
    // re-ranks every candidate by the shared composite before slicing, so
    // the high-impact row must win regardless of its position in the array.
    const lowImpactRows = Array.from({ length: 5 }, (_, i) => ({
      id: `low-${i}`,
      player_id: 'p1',
      insight_type: 'trend',
      category: 'putting',
      title: `Low impact ${i}`,
      content: 'Minor.',
      evidence: {
        metric_label: 'Make rate',
        your_value_display: '50%',
        strokes_impact: 0.1,
        confidence: 0.4,
        metric: `putts_low_${i}`,
      },
      lifecycle_state: 'detected',
      status: 'active',
      priority: 'medium',
      created_at: `2026-09-2${i}T12:00:00Z`,
      updated_at: `2026-09-2${i}T12:00:00Z`,
    }));
    const importantRow = {
      id: 'important-1',
      player_id: 'p1',
      insight_type: 'trend',
      category: 'putting',
      title: 'Three-putt rate spiking',
      content: 'Big impact.',
      evidence: {
        metric_label: 'Three-putt rate',
        your_value_display: '18%',
        strokes_impact: 2.5,
        confidence: 0.95,
        metric: 'three_putt_rate',
      },
      lifecycle_state: 'detected',
      status: 'active',
      priority: 'medium',
      created_at: '2026-08-01T12:00:00Z',
      updated_at: '2026-08-01T12:00:00Z',
    };

    const envelope = await getPlayerInsights(
      sbWith({
        golf_coach_insights: [{ data: [...lowImpactRows, importantRow] }],
      }),
      ctx,
      { player_id: 'p1', limit: 3 },
    );

    const insights = (envelope.detail as { insights: Array<{ insight_id: string }> }).insights;
    expect(insights).toHaveLength(3);
    expect(insights[0]?.insight_id).toBe('important-1');
  });

  it('labels active focus areas with the roster player name', async () => {
    const envelope = await getFocusAreas(
      sbWith({
        golf_player_focus_areas: [{
          data: [{
            id: 'focus-1',
            player_id: 'p2',
            title: 'Start line',
            area_type: 'putting',
            status: 'active',
            target_metric: 'putt_start_line',
            current_value: 40,
            target_value: 60,
            target_date: '2026-09-01',
            started_at: '2026-08-01',
            updated_at: '2026-08-17T12:00:00Z',
          }],
        }],
      }),
      ctx,
      { player_id: 'p2' },
    );

    expect((envelope.detail as { focus_areas: Array<{ player_name: string }> }).focus_areas[0]?.player_name).toBe('Blake Reed');
  });

  it('summarizes attendance for upcoming non-cancelled events', async () => {
    const envelope = await getUpcomingEvents(
      sbWith({
        golf_events: [{
          data: [
            {
              id: 'event-1',
              title: 'Practice',
              event_type: 'practice',
              start_time: '2026-08-20T18:00:00Z',
              end_time: '2026-08-20T20:00:00Z',
              location: 'Range',
              requires_rsvp: true,
              rsvp_deadline: '2026-08-19T18:00:00Z',
              status: 'scheduled',
            },
            {
              id: 'event-cancelled',
              title: 'Cancelled practice',
              event_type: 'practice',
              start_time: '2026-08-21T18:00:00Z',
              end_time: '2026-08-21T20:00:00Z',
              location: 'Range',
              requires_rsvp: true,
              rsvp_deadline: null,
              status: 'cancelled',
            },
          ],
        }],
        golf_event_attendance: [{
          data: [
            { event_id: 'event-1', player_id: 'p1', status: 'accepted' },
            { event_id: 'event-1', player_id: 'p2', status: 'pending' },
          ],
        }],
      }),
      ctx,
      { days_ahead: 7 },
    );

    expect(envelope.summary).toBe('1 event in the next 7 days.');
    expect((envelope.detail as { events: unknown[] }).events).toEqual([
      expect.objectContaining({
        event_id: 'event-1',
        rsvp_accepted: 1,
        rsvp_pending_count: 1,
        rsvp_pending_names: ['Blake Reed'],
      }),
    ]);
  });

  it('decides overdue status in the team timezone rather than UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T01:00:00.000Z')); // Aug 17 in New York.

    const envelope = await getOpenTasks(
      sbWith({
        golf_tasks: [{
          data: [
            { id: 'today', title: 'Due today', due_date: '2026-08-17', status: 'open', priority: 'normal', task_type: 'team' },
            { id: 'late', title: 'Already late', due_date: '2026-08-16', status: 'open', priority: 'high', task_type: 'team' },
          ],
        }],
      }),
      ctx,
    );

    const tasks = (envelope.detail as { tasks: Array<{ task_id: string; overdue: boolean }> }).tasks;
    expect(tasks).toEqual([
      expect.objectContaining({ task_id: 'today', overdue: false }),
      expect.objectContaining({ task_id: 'late', overdue: true }),
    ]);
    expect(envelope.summary).toBe('2 open tasks, 1 overdue.');
  });

  it('resolves an unambiguous player reference and refuses an unknown name', () => {
    expect(resolvePlayerReference(ctx, 'Avery')).toEqual({ player_id: 'p1', name: 'Avery Stone' });
    expect(resolvePlayerReference(ctx, 'Rory')).toEqual({
      error: 'No single player on the roster matches "Rory".',
      candidates: roster.map((candidate) => candidate.name),
    });
  });
});
