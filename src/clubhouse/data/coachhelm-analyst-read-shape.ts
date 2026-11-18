/**
 * CoachHelm reads on the coach's file on one player (P013, flag `coachhelm_reads_v1`): what the card draws.
 *
 * Pure shapes and a pure mapper from the saved read (`golf_coach_reads.payload`) to the card, so a client component
 * imports only types from here. The words are the analyst's, assembled from counted facts (src/lib/coachhelm/v3/analyst/reads).
 */
import type { ReadPayload } from '@/lib/coachhelm/v3/analyst/reads/types';
import type { ChDeepInsight } from './coachhelm-dive-shape';
import type { ChKind } from './coachhelm-shape';

export interface ChReadRound {
  id: string;
  href: string;
  date: string;
  course: string | null;
  score: string | null;
  line: string;
  shots: Array<{ id: string; text: string }>;
}

export interface ChAnalystRead {
  /** "Approach costs the most: 1.4 strokes a round." */
  headline: string;
  certainty: string | null;
  through: string;
  stale: string | null;
  where: string | null;
  team: string | null;
  how: string[];
  change: string | null;
  missing: string | null;
  rounds: ChReadRound[];
  /** Stage 3: the analyst's paragraph, when the writer has checked one. */
  written: { what: string; rulesInOut: string; thisWeek: string; watch: string } | null;
}

/** The card's load: off (flag off or the table not applied), none (no read saved yet), ready, or failed. */
export type ChAnalystReadLoad = { status: 'off' } | { status: 'none' } | { status: 'ready'; read: ChAnalystRead } | { status: 'failed' };

export const roundHrefOf = (roundId: string): string => `/golf/dashboard/rounds/${encodeURIComponent(roundId)}`;

/** The saved read as the card draws it. `audience: 'player'` must be handed a payload already stripped (`forPlayer`). */
export function toChAnalystRead(p: ReadPayload, href: (roundId: string) => string = roundHrefOf): ChAnalystRead {
  const c = p.priority;
  return {
    headline: c ? c.headline : 'Where the strokes go',
    certainty: c?.certainty_word ?? null,
    through: p.freshness.through_text,
    stale: p.freshness.stale_text,
    where: c?.where_text ?? null,
    team: c?.team?.value.text ?? null,
    how: c ? [...c.how_we_found] : [],
    change: c?.what_would_change ?? null,
    missing: p.missing?.text ?? null,
    rounds: (c?.evidence ?? []).map((e) => ({
      id: e.round_id,
      href: href(e.round_id),
      date: e.date_text,
      course: e.course,
      score: e.score_text,
      line: e.line,
      shots: e.carry.map((s) => ({ id: s.shot_id, text: s.text })),
    })),
    written: p.written ? { what: p.written.what, rulesInOut: p.written.rules_in_out, thisWeek: p.written.this_week, watch: p.written.watch } : null,
  };
}

/**
 * For a team on CoachHelm reads, the coach's player page and the CoachHelm board stop showing today's "nothing found"
 * rows (a note), good-news rows (a strength) and the one-sentence root cause (the diagnosis box). Nothing is deleted:
 * the rows stay in the table and every other team sees them as before.
 */
export const isHiddenForReads = (kind: ChKind): boolean => kind !== 'finding';

export function hideForReadsTeam(list: readonly ChDeepInsight[]): ChDeepInsight[] {
  return list.filter((d) => !isHiddenForReads(d.base.kind)).map((d) => (d.diagnosis ? { ...d, diagnosis: null } : d));
}
