/**
 * W32 — composeTravelBrief unit tests.
 */

import { describe, it, expect } from 'vitest';
import { composeTravelBrief } from '@/lib/coachhelm/v3/qualifying/travel-brief';
import type {
  QualifyingWorkspace,
  SelectionCandidate,
  QualifierSelection,
} from '@/lib/coachhelm/v3/qualifying/types';

function sel(
  overrides: Partial<QualifierSelection> & { qualifier_id: string; player_id: string },
): QualifierSelection {
  return {
    selection_type: 'top_score',
    coach_reasoning: null,
    selected_at: '2026-05-28T00:00:00Z',
    selected_by_user_id: 'u1',
    ...overrides,
  };
}

function cand(
  id: string,
  first: string,
  last: string,
  opts: {
    rank?: number | null;
    total_to_par?: number | null;
    total_score?: number | null;
    selection?: QualifierSelection | null;
    is_top_score_slot?: boolean;
  } = {},
): SelectionCandidate {
  return {
    player_id: id,
    player_first_name: first,
    player_last_name: last,
    rounds_completed: 4,
    total_score: opts.total_score === undefined ? 280 : opts.total_score,
    total_to_par: opts.total_to_par === undefined ? -3 : opts.total_to_par,
    leaderboard_rank: opts.rank ?? 1,
    selection: opts.selection ?? null,
    is_top_score_slot: opts.is_top_score_slot ?? false,
  };
}

function workspace(candidates: SelectionCandidate[]): QualifyingWorkspace {
  return {
    qualifier_id: 'q1',
    team_id: 't1',
    name: 'Spring Qualifier',
    start_date: '2026-05-20',
    end_date: '2026-05-22',
    status: 'in_progress',
    selection_state: 'selected',
    selection_slots_total: 5,
    selection_slots_coach_pick: 1,
    target_tournament_id: null,
    candidates,
    coach_picks_complete: true,
  };
}

describe('composeTravelBrief', () => {
  it('includes qualifier name and date range', () => {
    const brief = composeTravelBrief(workspace([]));
    expect(brief).toContain('Spring Qualifier');
    expect(brief).toContain('2026-05-20');
    expect(brief).toContain('2026-05-22');
  });

  it('lists top-score players with rank and score', () => {
    const ws = workspace([
      cand('p1', 'Alice', 'Smith', {
        rank: 1,
        total_to_par: -5,
        total_score: 275,
        selection: sel({ qualifier_id: 'q1', player_id: 'p1', selection_type: 'top_score' }),
        is_top_score_slot: true,
      }),
    ]);
    const brief = composeTravelBrief(ws);
    expect(brief).toContain('Alice Smith');
    expect(brief).toContain('#1');
    expect(brief).toContain('-5 (275)');
    expect(brief).toContain('Auto-Qualified');
  });

  it('lists coach picks with reasoning', () => {
    const ws = workspace([
      cand('p2', 'Bob', 'Jones', {
        rank: 6,
        total_to_par: 2,
        total_score: 290,
        selection: sel({
          qualifier_id: 'q1',
          player_id: 'p2',
          selection_type: 'coach_pick',
          coach_reasoning: 'Great mental game under pressure',
        }),
      }),
    ]);
    const brief = composeTravelBrief(ws);
    expect(brief).toContain('Bob Jones');
    expect(brief).toContain("Coach's Picks");
    expect(brief).toContain('Great mental game under pressure');
  });

  it('formats positive scores with + sign', () => {
    const ws = workspace([
      cand('p3', 'Charlie', 'Day', {
        rank: 3,
        total_to_par: 4,
        total_score: 292,
        selection: sel({ qualifier_id: 'q1', player_id: 'p3', selection_type: 'top_score' }),
      }),
    ]);
    const brief = composeTravelBrief(ws);
    expect(brief).toContain('+4 (292)');
  });

  it('shows N/A for unscored players', () => {
    const ws = workspace([
      cand('p4', 'Dee', 'Reynolds', {
        rank: null,
        total_to_par: null,
        total_score: null,
        selection: sel({ qualifier_id: 'q1', player_id: 'p4', selection_type: 'coach_pick' }),
      }),
    ]);
    const brief = composeTravelBrief(ws);
    expect(brief).toContain('N/A');
  });

  it('handles workspace with no end_date', () => {
    const ws = workspace([]);
    ws.end_date = null;
    const brief = composeTravelBrief(ws);
    expect(brief).toContain('2026-05-20');
    expect(brief).not.toContain('–');
  });

  it('includes both sections when mixed selections exist', () => {
    const ws = workspace([
      cand('p1', 'Alice', 'Smith', {
        rank: 1,
        selection: sel({ qualifier_id: 'q1', player_id: 'p1', selection_type: 'top_score' }),
        is_top_score_slot: true,
      }),
      cand('p2', 'Bob', 'Jones', {
        rank: 6,
        selection: sel({
          qualifier_id: 'q1',
          player_id: 'p2',
          selection_type: 'coach_pick',
          coach_reasoning: 'Clutch putter',
        }),
      }),
    ]);
    const brief = composeTravelBrief(ws);
    expect(brief).toContain('Auto-Qualified');
    expect(brief).toContain("Coach's Picks");
  });

  it('includes auto-generated footer', () => {
    const brief = composeTravelBrief(workspace([]));
    expect(brief).toContain('auto-generated');
  });
});
