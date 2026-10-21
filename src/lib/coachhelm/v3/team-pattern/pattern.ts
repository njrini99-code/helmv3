/**
 * Team pattern (CoachHelm supercharge Slice 7b; `03` §5.1, `04` §1.6, the
 * Team pattern row of `04` §2, Example 8 and Layout 4).
 *
 * A team pattern is a cause family, not a metric, that enough of the roster
 * shares. It is computed at delivery from the reads the coach can already see
 * (no table, no cache), and it is coach-only.
 *
 * Rules:
 *   - A member is a player with at least 3 countable rounds (the eligible
 *     roster, `03` §5.1) whose read on the family is at Likely or above on the
 *     support ladder (`evidence.ladder`, Slice 1). A strength is not a
 *     pattern, and a read the support pass never rated is not counted.
 *   - The family key is the support family (`evidence.support.family`, else
 *     `familyFor`), the read's metric (which carries the band: 50-125 yd,
 *     3-5 ft, par 4) and, where the read names one, the side the player
 *     misses on (`evidence.detail.worse_side`: short, long, left, right). So
 *     "approach 50-125 short" and "approach 50-125 long" are two families.
 *   - Threshold: at least 3 members AND at least 30% of the eligible roster
 *     (Example 8: "5 ≥ 3 and 5/6 ≥ 30%"). Two players is a coincidence, and
 *     three of a 20-player roster is not a team pattern.
 *   - Row: the family label, members of eligible roster, the team strokes a
 *     round at stake (the sum of the members' shrunk S, `strokes_shrunk`), the
 *     common next step (the practice action most members share) and the
 *     member list with each player's number and ladder word.
 *   - At most 4 rows, most strokes first. Families with 2 or more members
 *     that miss the threshold are counted, never listed (Layout 4's "Below
 *     threshold" line).
 *
 * Pure: reads in, rows out.
 */
import { familyFor } from '@/lib/coachhelm/v3/support/families';
import type { LadderRung } from '@/lib/coachhelm/v3/support/ladder';

/** `03` §5.1: fewest members for a pattern. */
export const TEAM_PATTERN_MIN_MEMBERS = 3;
/** `03` §5.1: smallest share of the eligible roster. */
export const TEAM_PATTERN_MIN_SHARE = 0.3;
/** `03` §2.4 / `04` §2: rows on the Team pattern view. */
export const TEAM_PATTERN_MAX_ROWS = 4;
/** `03` §5.1: countable rounds a player needs to count in the eligible roster. */
export const TEAM_PATTERN_MIN_ROUNDS = 3;

/** Rungs that count a player into a pattern (Likely or above). */
const MEMBER_RUNGS: ReadonlySet<LadderRung> = new Set(['likely', 'observed', 'seen_repeatedly']);
/** Families that are not a single cause (a composite) or not known. */
const NOT_A_FAMILY: ReadonlySet<string> = new Set(['unknown', 'composite']);

export type TeamPatternSide = 'short' | 'long' | 'left' | 'right';
const SIDES: ReadonlySet<string> = new Set(['short', 'long', 'left', 'right']);

/** One visible read, as the coach loader already has it. */
export interface TeamPatternRead {
  id: string;
  player_id: string;
  insight_type: string;
  evidence: unknown;
}

export interface TeamPatternInput {
  teamId: string;
  reads: readonly TeamPatternRead[];
  /** Active players on the team. */
  rosterTotal: number;
  /** Players with at least {@link TEAM_PATTERN_MIN_ROUNDS} countable rounds. */
  eligiblePlayerIds: ReadonlySet<string>;
  now?: Date;
}

export interface TeamPatternMember {
  player_id: string;
  insight_id: string;
  ladder: LadderRung;
  /** The member's shrunk strokes a round; null when the read carries none. */
  strokes: number | null;
  /** The member's own value, in the read's unit, for the member list. */
  value: number | null;
}

/** `04` §1.6, plus what the row draws. */
export interface TeamPattern {
  team_id: string;
  family: string;
  /** The support family alone (`approach_green_hit`, an angle id). */
  base_family: string;
  metric: string;
  side: TeamPatternSide | null;
  /** "Proximity 50–125 yd · finishing short". */
  label: string;
  unit: string | null;
  window_end: string;
  members: string[];
  member_reads: TeamPatternMember[];
  /** Players with enough rounds for reads (the eligible roster). */
  roster_with_reads: number;
  roster_total: number;
  /** Sum of the members' shrunk strokes a round, 2 dp. */
  strokes_sum: number;
  /** The practice action most members' reads share; null when none carries one. */
  common_next: string | null;
  computed_at: string;
}

export interface TeamPatternResult {
  patterns: TeamPattern[];
  /** Families with 2 or more members that missed the threshold (counted only). */
  below_threshold: number;
  roster_with_reads: number;
  roster_total: number;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const SIDE_WORDS: Record<TeamPatternSide, string> = {
  short: 'finishing short',
  long: 'finishing long',
  left: 'missing left',
  right: 'missing right',
};

interface Keyed {
  key: string;
  base: string;
  metric: string;
  side: TeamPatternSide | null;
  label: string;
  unit: string | null;
  member: TeamPatternMember;
  next: string | null;
}

/** The family key of one read, or null when it cannot be a pattern member. */
export function patternKeyOf(read: TeamPatternRead): Omit<Keyed, 'member' | 'next'> | null {
  const ev = obj(read.evidence);
  if (!ev) return null;
  const metric = str(ev.metric);
  if (!metric) return null;
  const support = obj(ev.support);
  if (support?.direction === 'strength') return null;
  const base = str(support?.family) ?? familyFor(read.insight_type, metric).family;
  if (NOT_A_FAMILY.has(base)) return null;
  const sideRaw = str(obj(ev.detail)?.worse_side);
  const side = sideRaw && SIDES.has(sideRaw) ? (sideRaw as TeamPatternSide) : null;
  const metricLabel = str(ev.metric_label) ?? metric;
  return {
    key: side ? `${base}|${metric}|${side}` : `${base}|${metric}`,
    base,
    metric,
    side,
    label: side ? `${metricLabel} · ${SIDE_WORDS[side]}` : metricLabel,
    unit: str(ev.unit),
  };
}

function ladderOf(ev: Record<string, unknown>): LadderRung | null {
  const l = str(ev.ladder);
  return l && MEMBER_RUNGS.has(l as LadderRung) ? (l as LadderRung) : null;
}

/** The action most members share; ties go to the member with the most strokes at stake. */
function commonNext(members: readonly Keyed[]): string | null {
  const counts = new Map<string, { n: number; best: number }>();
  for (const m of members) {
    if (!m.next) continue;
    const c = counts.get(m.next) ?? { n: 0, best: -Infinity };
    c.n += 1;
    c.best = Math.max(c.best, m.member.strokes ?? 0);
    counts.set(m.next, c);
  }
  let pick: string | null = null;
  let top = { n: 0, best: -Infinity };
  for (const [next, c] of counts) {
    if (c.n > top.n || (c.n === top.n && c.best > top.best)) {
      pick = next;
      top = c;
    }
  }
  return pick;
}

/** The team's patterns, most strokes first, at most four. */
export function computeTeamPatterns(input: TeamPatternInput): TeamPatternResult {
  const eligible = input.eligiblePlayerIds.size;
  const computedAt = (input.now ?? new Date()).toISOString();
  const byFamily = new Map<string, Map<string, Keyed>>();

  for (const read of input.reads) {
    if (!input.eligiblePlayerIds.has(read.player_id)) continue;
    const ev = obj(read.evidence);
    if (!ev) continue;
    const ladder = ladderOf(ev);
    if (!ladder) continue;
    const k = patternKeyOf(read);
    if (!k) continue;
    const keyed: Keyed = {
      ...k,
      member: {
        player_id: read.player_id,
        insight_id: read.id,
        ladder,
        strokes: num(ev.strokes_shrunk),
        value: num(ev.your_value),
      },
      next: str(obj(ev.diagnosis)?.recommended_action),
    };
    const fam = byFamily.get(k.key) ?? new Map<string, Keyed>();
    // One read per player per family: the one with the most strokes at stake.
    const prev = fam.get(read.player_id);
    if (!prev || (keyed.member.strokes ?? 0) > (prev.member.strokes ?? 0)) fam.set(read.player_id, keyed);
    byFamily.set(k.key, fam);
  }

  const patterns: TeamPattern[] = [];
  let below = 0;
  for (const fam of byFamily.values()) {
    const members = [...fam.values()].sort((a, b) => (b.member.strokes ?? 0) - (a.member.strokes ?? 0));
    const n = members.length;
    const meets = n >= TEAM_PATTERN_MIN_MEMBERS && eligible > 0 && n / eligible >= TEAM_PATTERN_MIN_SHARE;
    if (!meets) {
      if (n >= 2) below += 1;
      continue;
    }
    const lead = members[0]!;
    patterns.push({
      team_id: input.teamId,
      family: lead.key,
      base_family: lead.base,
      metric: lead.metric,
      side: lead.side,
      label: lead.label,
      unit: lead.unit,
      window_end: computedAt.slice(0, 10),
      members: members.map((m) => m.member.player_id),
      member_reads: members.map((m) => m.member),
      roster_with_reads: eligible,
      roster_total: input.rosterTotal,
      strokes_sum: round2(members.reduce((s, m) => s + (m.member.strokes ?? 0), 0)),
      common_next: commonNext(members),
      computed_at: computedAt,
    });
  }
  patterns.sort((a, b) => b.strokes_sum - a.strokes_sum || b.members.length - a.members.length || a.family.localeCompare(b.family));
  const shown = patterns.slice(0, TEAM_PATTERN_MAX_ROWS);
  // A qualifying family past the fourth row is not drawn; it is counted with the rest that are not shown.
  return {
    patterns: shown,
    below_threshold: below + (patterns.length - shown.length),
    roster_with_reads: eligible,
    roster_total: input.rosterTotal,
  };
}

/** "5 of 6 players with enough rounds". */
export function teamPatternMembersLine(p: Pick<TeamPattern, 'members' | 'roster_with_reads'>): string {
  return `${p.members.length} of ${p.roster_with_reads} players with enough rounds`;
}

/** "about 1.1 strokes a round across the team"; null below 0.1 (no zero-stroke text, Slice 0). */
export function teamPatternStrokesLine(p: Pick<TeamPattern, 'strokes_sum'>): string | null {
  if (!(p.strokes_sum >= 0.1)) return null;
  return `about ${p.strokes_sum.toFixed(1)} strokes a round across the team`;
}

/** Layout 4's counted line: "2 more shared by fewer players (below the team threshold)". */
export function teamPatternBelowLine(n: number): string | null {
  if (n <= 0) return null;
  return `${n} more ${n === 1 ? 'read is' : 'reads are'} shared by too few players to call a team pattern.`;
}

/**
 * Example 8's player line, for a member's own read: "The same read is open
 * for 4 other players on the team." Never names a teammate.
 */
export function teamPatternPlayerLine(othersOpen: number): string | null {
  if (othersOpen <= 0) return null;
  return `The same read is open for ${othersOpen} other ${othersOpen === 1 ? 'player' : 'players'} on the team.`;
}
