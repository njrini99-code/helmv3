/**
 * The coach Monday brief (CoachHelm supercharge, task chs-28; `04` §4
 * "Coach Monday brief" row, Layout 1, the "Appears:" lines of Examples 1, 3,
 * 5 and 8 and the design call's "Monday before practice" row).
 *
 * Per team, at most five items:
 *   1. the team pattern, when one meets the threshold (Slice 7b's
 *      `computeTeamPatterns`, its first row, passed in by the loader);
 *   2. then player reads at Likely or above on the support ladder, at most one
 *      per player, most strokes at stake first.
 * Then a counts line for the week: new, cleared, contradicted, out of date.
 *
 * Never in the brief (`04` §4): strengths, Watching (Not enough yet), Working
 * hypothesis, and reads two or more rounds behind (S3). Also left out here: a
 * Cleared read, the retired side of a Contradicted pair, a read Under review
 * (its why is being rechecked) and a read already drawn in the team pattern
 * row (the row speaks for it; that player can still show another read).
 *
 * Fail closed: a read missing any field the row needs (ladder, direction,
 * strokes estimate, title, freshness day, a roster name) is left out, never
 * guessed. Nothing here throws on malformed evidence.
 *
 * Pure: reads, rounds and the pattern in, the brief out.
 */
import type { LadderRung } from '@/lib/coachhelm/v3/support/ladder';
import type { TeamPattern } from '@/lib/coachhelm/v3/team-pattern/pattern';

/** `04` §4: items in the brief, the team pattern included. */
export const MONDAY_BRIEF_MAX_ITEMS = 5;
/** S3: a read this many rounds behind (or more) is not in the brief. */
export const MONDAY_BRIEF_ROUNDS_BEHIND_CUTOFF = 2;
/** The week the counts line covers, in days before the brief. */
export const MONDAY_BRIEF_WEEK_DAYS = 7;

const DAY_MS = 86_400_000;

/** Rungs a read must reach to be in the brief. */
const BRIEF_RUNGS: ReadonlySet<string> = new Set(['likely', 'observed', 'seen_repeatedly']);
const RUNG_ORDER: Record<string, number> = { seen_repeatedly: 3, observed: 2, likely: 1 };
/** The methods whose `strokes_impact` is an estimate of strokes a round (as `clubhouse/data/coachhelm-strokes.ts`). */
const ESTIMATED_METHODS: ReadonlySet<string> = new Set(['sg_baseline', 'peer_delta']);

/** One visible read, as the loader has it. */
export interface MondayBriefRead {
  id: string;
  player_id: string;
  title: string | null;
  category?: string | null;
  insight_type?: string | null;
  created_at: string | null;
  evidence: unknown;
  metadata: unknown;
}

/** One countable completed round: the player and its play day (`YYYY-MM-DD`). */
export interface MondayBriefRound {
  player_id: string;
  day: string;
}

export interface MondayBriefInput {
  teamId: string;
  /** Active players on the team with their names. */
  roster: ReadonlyArray<{ id: string; name: string }>;
  reads: readonly MondayBriefRead[];
  /** Countable completed rounds of the roster (the loader filters with `isCountableRound`). */
  rounds: readonly MondayBriefRound[];
  /** The team pattern's first row, or null (none, or its flag is off). */
  teamPattern: TeamPattern | null;
  /** Players with enough rounds for reads (the pattern's eligible roster). */
  withEnoughRounds: number;
  now: Date;
}

export interface MondayBriefPatternItem {
  kind: 'team_pattern';
  id: string;
  /** "Proximity 50–125 yd · finishing short". */
  title: string;
  /** "5 of 6 players with enough rounds". */
  members: string;
  /** Summed shrunk strokes a round across the members; null when under 0.1. */
  strokes: number | null;
  next: string | null;
}

export interface MondayBriefReadItem {
  kind: 'read';
  insight_id: string;
  player_id: string;
  player_name: string;
  title: string;
  ladder: LadderRung;
  /** Raw strokes a round, one decimal, unsigned (cards print raw strokes). */
  strokes: number;
  /** Countable rounds played since the read was last refreshed (0 or 1 here). */
  rounds_behind: number;
}

export type MondayBriefItem = MondayBriefPatternItem | MondayBriefReadItem;

export interface MondayBriefCounts {
  /** Likely+ findings first written this week. */
  new: number;
  /** Reads the recheck cleared this week. */
  cleared: number;
  /** Contradicted pairs found this week (a pair counts once). */
  contradicted: number;
  /** Likely+ findings at least one countable round behind. */
  out_of_date: number;
}

export interface MondayBriefCleared {
  player_name: string;
  title: string;
}

export interface MondayBrief {
  team_id: string;
  /** First and last day the week covers (`YYYY-MM-DD`, UTC). */
  week_start: string;
  week_end: string;
  roster_total: number;
  with_enough_rounds: number;
  /** Countable rounds the roster played in the week. */
  rounds_last_week: number;
  items: MondayBriefItem[];
  counts: MondayBriefCounts;
  /** "Cleared this week" below the fold: name and the read. */
  cleared: MondayBriefCleared[];
  computed_at: string;
}

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The UTC day of an ISO date or timestamp, or null. */
export function dayOfIso(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const t = Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function within(iso: unknown, startMs: number, endMs: number): boolean {
  if (typeof iso !== 'string') return false;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) && t >= startMs && t <= endMs;
}

/** Raw strokes a round as a card prints them (one decimal, unsigned), or null when not a real estimate. */
export function briefStrokes(ev: Record<string, unknown>): number | null {
  const method = str(ev.strokes_impact_method);
  const v = num(ev.strokes_impact);
  if (!method || !ESTIMATED_METHODS.has(method) || v === null) return null;
  const shown = Number(Math.abs(v).toFixed(1));
  return shown > 0 ? shown : null;
}

/** The ranking key: the shrunk strokes when the support pass wrote them, else the raw estimate. */
function rankStrokes(ev: Record<string, unknown>, raw: number): number {
  const s = num(ev.strokes_shrunk);
  return s !== null ? Math.abs(s) : raw;
}

/** The read's lifecycle evidence, mirrored from `metadata.coachhelm_lifecycle` when a re-emit dropped it. */
function lifecycleOf(ev: Record<string, unknown>, meta: Record<string, unknown> | null): { recheck: Record<string, unknown> | null; conflict: Record<string, unknown> | null; underReview: boolean } {
  const life = rec(meta?.coachhelm_lifecycle);
  return {
    recheck: rec(ev.recheck) ?? rec(life?.recheck),
    conflict: rec(ev.conflict) ?? rec(life?.conflict),
    underReview: !!(rec(ev.under_review) ?? rec(life?.under_review)),
  };
}

/** A finding (never a strength or a note): the support pass names the direction, and the row is not filed as a strength. */
function isFinding(read: MondayBriefRead, ev: Record<string, unknown>): boolean {
  if (read.category === 'strength') return false;
  return str(rec(ev.support)?.direction) === 'weakness';
}

/** Countable rounds the player played after `day`. */
function roundsAfter(rounds: readonly MondayBriefRound[], playerId: string, day: string): number {
  let n = 0;
  for (const r of rounds) if (r.player_id === playerId && r.day > day) n += 1;
  return n;
}

interface Candidate {
  item: MondayBriefReadItem;
  rank: number;
  rung: number;
}

/** The week's brief for one team. Never throws: a read it cannot judge is left out. */
export function computeMondayBrief(input: MondayBriefInput): MondayBrief {
  const endMs = input.now.getTime();
  const startMs = endMs - MONDAY_BRIEF_WEEK_DAYS * DAY_MS;
  const weekStart = new Date(startMs).toISOString().slice(0, 10);
  const weekEnd = input.now.toISOString().slice(0, 10);
  const names = new Map(input.roster.map((p) => [p.id, p.name]));
  const inPattern = new Set(input.teamPattern?.member_reads.map((m) => m.insight_id) ?? []);

  const counts: MondayBriefCounts = { new: 0, cleared: 0, contradicted: 0, out_of_date: 0 };
  const cleared: MondayBriefCleared[] = [];
  const pairs = new Set<string>();
  const best = new Map<string, Candidate>();

  for (const read of input.reads) {
    const ev = rec(read.evidence);
    const name = names.get(read.player_id);
    if (!ev || name === undefined) continue;
    const { recheck, conflict, underReview } = lifecycleOf(ev, rec(read.metadata));
    const title = str(read.title);

    // Cleared this week: counted, listed below the fold, never an item.
    if (str(recheck?.outcome) === 'cleared') {
      if (within(recheck?.computed_at, startMs, endMs)) {
        counts.cleared += 1;
        if (title) cleared.push({ player_name: name, title });
      }
      continue;
    }
    // Contradicted this week: one per pair, whichever side carries it.
    if (conflict && within(conflict.computed_at, startMs, endMs)) {
      const other = str(conflict.with_insight_id);
      pairs.add(other ? [read.id, other].sort().join('|') : read.id);
    }

    const rungRaw = str(ev.ladder);
    if (!rungRaw || !BRIEF_RUNGS.has(rungRaw) || !isFinding(read, ev)) continue;
    const rung = rungRaw as LadderRung;
    if (within(read.created_at, startMs, endMs)) counts.new += 1;

    const fresh = dayOfIso(rec(read.metadata)?.last_refreshed_at);
    if (!fresh) continue;
    const behind = roundsAfter(input.rounds, read.player_id, fresh);
    if (behind >= 1) counts.out_of_date += 1;
    if (behind >= MONDAY_BRIEF_ROUNDS_BEHIND_CUTOFF) continue;

    if (str(conflict?.role) === 'retired' || underReview || inPattern.has(read.id)) continue;
    const strokes = briefStrokes(ev);
    if (!title || strokes === null) continue;

    const cand: Candidate = {
      item: { kind: 'read', insight_id: read.id, player_id: read.player_id, player_name: name, title, ladder: rung, strokes, rounds_behind: behind },
      rank: rankStrokes(ev, strokes),
      rung: RUNG_ORDER[rung] ?? 0,
    };
    const prev = best.get(read.player_id);
    if (!prev || better(cand, prev)) best.set(read.player_id, cand);
  }
  counts.contradicted = pairs.size;

  const items: MondayBriefItem[] = [];
  const p = input.teamPattern;
  if (p) {
    items.push({
      kind: 'team_pattern',
      id: p.family,
      title: p.label,
      members: `${p.members.length} of ${p.roster_with_reads} players with enough rounds`,
      strokes: p.strokes_sum >= 0.1 ? p.strokes_sum : null,
      next: p.common_next,
    });
  }
  const reads = [...best.values()].sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  for (const c of reads) {
    if (items.length >= MONDAY_BRIEF_MAX_ITEMS) break;
    items.push(c.item);
  }

  return {
    team_id: input.teamId,
    week_start: weekStart,
    week_end: weekEnd,
    roster_total: input.roster.length,
    with_enough_rounds: input.withEnoughRounds,
    // The seven play days before the brief's own day (Monday to Sunday for a Monday brief).
    rounds_last_week: input.rounds.filter((r) => r.day >= weekStart && r.day < weekEnd).length,
    items,
    counts,
    cleared,
    computed_at: input.now.toISOString(),
  };
}

/** Most strokes first, then the higher rung, then the id (stable). */
function better(a: Candidate, b: Candidate): boolean {
  if (a.rank !== b.rank) return a.rank > b.rank;
  if (a.rung !== b.rung) return a.rung > b.rung;
  return a.item.insight_id < b.item.insight_id;
}

/** True when the brief has nothing to say: no item and every count zero. */
export function isEmptyBrief(b: Pick<MondayBrief, 'items' | 'counts'>): boolean {
  return b.items.length === 0 && b.counts.new + b.counts.cleared + b.counts.contradicted + b.counts.out_of_date === 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The brief's closing counts line: "2 new · 1 cleared · 0 contradicted · 1 out of date". */
export function briefCountsLine(c: MondayBriefCounts): string {
  return `${c.new} new · ${c.cleared} cleared · ${c.contradicted} contradicted · ${c.out_of_date} out of date`;
}

/** Layout 1's team line: "9 players · 6 with enough rounds · 14 countable rounds last week". */
export function briefTeamLine(b: Pick<MondayBrief, 'roster_total' | 'with_enough_rounds' | 'rounds_last_week'>): string {
  return `${plural(b.roster_total, 'player')} · ${b.with_enough_rounds} with enough rounds · ${plural(b.rounds_last_week, 'countable round')} last week`;
}
