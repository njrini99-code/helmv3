/**
 * The qualifier display rules every surface shares: the title without its
 * " — suffix", one to-par colour, golf standings with ties, and the field's
 * progress through its rounds. Fixtures are the production qualifiers.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveStandings,
  fieldProgress,
  leaderSummary,
  positionLabel,
  progressHeadline,
  qualifierDisplayName,
  toParTone,
  type StandingsFeedEntry,
} from '../qualifier-display';

const entry = (player_name: string, rounds_completed: number, total_score: number | null, total_to_par: number | null): StandingsFeedEntry => ({
  player_id: player_name.toLowerCase().replace(/\s+/g, '-'),
  player_name,
  rounds_completed,
  total_score,
  total_to_par,
});

// Fall Invitational Qualifier (86dad12b): 3 rounds, 2 played by all 7.
const fallInvitational = [
  entry('Tyler Hayes', 2, 155, 11),
  entry('Cole Bennett', 2, 141, -3),
  entry('Owen Carter', 2, 145, 1),
  entry('Mason Rivers', 2, 144, 0),
  entry('Dylan Brooks', 2, 150, 6),
  entry('Ethan Park', 2, 146, 2),
  entry('Jackson Hale', 2, 147, 3),
];

describe('qualifierDisplayName', () => {
  it('drops the spaced em or en dash suffix and keeps hyphens', () => {
    expect(qualifierDisplayName('Fall Qualifier — Travel Team Selection')).toBe('Fall Qualifier');
    expect(qualifierDisplayName('Pre-Season Qualifier — Spring Invitational')).toBe('Pre-Season Qualifier');
    expect(qualifierDisplayName('Spring Qualifier – Day 1')).toBe('Spring Qualifier');
    expect(qualifierDisplayName('Fall Invitational Qualifier')).toBe('Fall Invitational Qualifier');
    expect(qualifierDisplayName('A-B Qualifier')).toBe('A-B Qualifier');
  });

  it('falls back to the full name when nothing precedes the dash', () => {
    expect(qualifierDisplayName(' — Travel Team')).toBe('— Travel Team');
    expect(qualifierDisplayName(null)).toBe('');
  });
});

describe('toParTone', () => {
  it('greens under par only; even par is quiet, over par plain ink', () => {
    expect(toParTone(-3)).toBe('text-accent-ink');
    expect(toParTone(0)).toBe('text-text-secondary');
    expect(toParTone(11)).toBe('text-text-primary');
    expect(toParTone(null)).toBe('text-text-tertiary');
  });
});

describe('deriveStandings', () => {
  it('orders the Fall Invitational field by to-par with positions 1 to 7', () => {
    const rows = deriveStandings(fallInvitational);
    expect(rows.map((r) => [r.playerName, positionLabel(r), r.rank])).toEqual([
      ['Cole Bennett', '1', 1],
      ['Mason Rivers', '2', 2],
      ['Owen Carter', '3', 3],
      ['Ethan Park', '4', 4],
      ['Jackson Hale', '5', 5],
      ['Dylan Brooks', '6', 6],
      ['Tyler Hayes', '7', 7],
    ]);
    expect(rows[0]?.averageScore).toBe(70.5);
  });

  it('shares a position across a tie, marks every tied row, and skips the next', () => {
    const rows = deriveStandings([
      entry('A', 1, 70, -2),
      entry('B', 1, 72, 0),
      entry('C', 1, 72, 0),
      entry('D', 1, 73, 1),
    ]);
    expect(rows.map((r) => positionLabel(r))).toEqual(['1', 'T2', 'T2', '4']);
    // Cut lines count the physical order, which never skips.
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('never gives a player without a completed round a position, an E, or a zero', () => {
    const rows = deriveStandings([entry('Waiting', 0, 0, 0), entry('Scored', 1, 74, 2)]);
    expect(rows[0]?.playerName).toBe('Scored');
    expect(rows[1]).toMatchObject({ playerName: 'Waiting', position: null, totalToPar: null, totalScore: null, rank: null });
    expect(positionLabel(rows[1]!)).toBe('—');
  });
});

describe('leaderSummary', () => {
  it('names the leader and the margin', () => {
    const summary = leaderSummary(deriveStandings(fallInvitational));
    expect(summary?.leaders.map((l) => l.playerName)).toEqual(['Cole Bennett']);
    expect(summary?.margin).toBe(3);
  });

  it('shares the lead on a tie and is null before anyone scores', () => {
    const tied = leaderSummary(deriveStandings([entry('A', 1, 70, -2), entry('B', 1, 70, -2), entry('C', 1, 71, -1)]));
    expect(tied?.leaders).toHaveLength(2);
    expect(tied?.margin).toBeNull();
    expect(leaderSummary(deriveStandings([entry('A', 0, null, null)]))).toBeNull();
  });
});

describe('fieldProgress + progressHeadline', () => {
  it('reads the Fall Invitational as round 3 of 3 up next, 14 of 21 in', () => {
    const progress = fieldProgress(deriveStandings(fallInvitational), 3);
    expect(progress).toMatchObject({ cardsIn: 14, cardsTotal: 21, roundsDone: 2, roundsStarted: 2, perRound: [1, 1, 0] });
    expect(progressHeadline(progress, 'in_progress')).toBe('Round 3 of 3 up next');
  });

  it('calls a round in play while only part of the field has it', () => {
    const progress = fieldProgress([{ roundsCompleted: 3 }, { roundsCompleted: 2 }], 3);
    expect(progressHeadline(progress, 'in_progress')).toBe('Round 3 of 3 in play');
    expect(progress.perRound).toEqual([1, 1, 0.5]);
  });

  it('is final once completed, and honest when nothing was posted', () => {
    expect(progressHeadline(fieldProgress([{ roundsCompleted: 1 }], 1), 'completed')).toBe('Final standings');
    expect(progressHeadline(fieldProgress([{ roundsCompleted: 0 }], 1), 'completed')).toBe('Closed with no rounds posted');
    expect(progressHeadline(fieldProgress([{ roundsCompleted: 0 }], 3), 'upcoming')).toBe('Round 1 of 3 up next');
  });

  it('caps a player at the qualifier rounds', () => {
    expect(fieldProgress([{ roundsCompleted: 5 }], 3).cardsIn).toBe(3);
  });
});
