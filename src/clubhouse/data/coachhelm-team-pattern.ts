import type { TeamPatternResult } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { teamPatternBelowLine, teamPatternMembersLine, teamPatternStrokesLine } from '@/lib/coachhelm/v3/team-pattern/pattern';
import type { LadderRung } from '@/lib/coachhelm/v3/support/ladder';

/**
 * The Team pattern rows on the coach's CoachHelm board (Clubhouse P013;
 * CoachHelm supercharge Slice 7b, `04` Layout 4 and Example 8), behind
 * `coachhelm_team_pattern_v1` (off). Coach-only: the player board never reads
 * this. Pure: the engine's patterns and the roster's names in, the board's
 * words out.
 */

export interface ChTeamPatternMember {
  name: string;
  /** The member's own number ("41%", "2.1 strokes"); null when the read carries none. */
  value: string | null;
  /** The ladder word ("Likely", "Observed", "Seen repeatedly"). */
  ladder: string;
}

export interface ChTeamPatternRow {
  id: string;
  /** "Proximity 50–125 yd · finishing short". */
  title: string;
  /** "5 of 6 players with enough rounds". */
  members: string;
  /** "about 1.1 strokes a round across the team"; null below 0.1. */
  strokes: string | null;
  /** The practice step most members share. */
  next: string | null;
  who: ChTeamPatternMember[];
}

export interface ChTeamPatterns {
  rows: ChTeamPatternRow[];
  /** Layout 4's counted line for families under the threshold; null when none. */
  below: string | null;
  /** "6 of 9 players have enough rounds for reads." */
  reach: string;
}

const LADDER_WORD: Partial<Record<LadderRung, string>> = {
  likely: 'Likely',
  observed: 'Observed',
  seen_repeatedly: 'Seen repeatedly',
};

/** A member's number in the read's own unit. */
export function memberValue(value: number | null, unit: string | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const v = Math.round(value * 10) / 10;
  switch (unit) {
    case 'percent':
      return `${v}%`;
    case 'strokes':
      return `${v} ${v === 1 ? 'stroke' : 'strokes'}`;
    case 'feet':
      return `${v} ft`;
    case 'yards':
      return `${v} yd`;
    default:
      return String(v);
  }
}

/** The board's Team pattern section, or null when there is nothing to draw (no pattern and nothing below the threshold). */
export function toChTeamPatterns(result: TeamPatternResult, names: ReadonlyMap<string, string>): ChTeamPatterns | null {
  if (result.patterns.length === 0 && result.below_threshold === 0) return null;
  return {
    rows: result.patterns.map((p) => ({
      id: p.family,
      title: p.label,
      members: teamPatternMembersLine(p),
      strokes: teamPatternStrokesLine(p),
      next: p.common_next,
      who: p.member_reads.map((m) => ({
        name: names.get(m.player_id) ?? 'Player',
        value: memberValue(m.value, p.unit),
        ladder: LADDER_WORD[m.ladder] ?? 'Likely',
      })),
    })),
    below: teamPatternBelowLine(result.below_threshold),
    reach: `${result.roster_with_reads} of ${result.roster_total} players have enough rounds for reads.`,
  };
}
