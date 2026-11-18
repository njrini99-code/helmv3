/**
 * CoachHelm reads on the coach's file on one player (P013, flag `coachhelm_reads_v1`): what the card draws.
 *
 * Pure shapes and a pure mapper from the saved read (`golf_coach_reads.payload`) to the card, so a client component
 * imports only types from here. The words are the analyst's, assembled from counted facts (src/lib/coachhelm/v3/analyst/reads).
 */
import { focusJustSet, type FocusLink } from '@/lib/coachhelm/v3/analyst/reads/focus';
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
  /** Whose read it is, and the card the coach's actions name (the saved priority's key; null with no priority yet). */
  playerId: string;
  cardKey: string | null;
  /** "Focus set today on approach, 1.4 strokes a round lost then. No round counted since yet.": drawn the moment a focus is set. */
  focusDraft: string | null;
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
  /** Stage 4: "was X, now Y", shown first the night a card clears. */
  improvement: string | null;
  /** Stage 4: what changed since the last checkpoint, once. */
  changed: string | null;
  /** Stage 4: the coach said "not useful" or "wrong" and nothing material changed. */
  suppressed: { verdict: string; reason: string } | null;
  /** Stage 4: the focus set from this card. */
  focus: { setOn: string; since: string; word: string } | null;
  /** Stage 2: the four parts side by side. */
  parts: Array<{ label: string; text: string; where: string | null; team: string | null }>;
  /** Stage 2: at most three counted reads that stand out in the team. */
  signals: Array<{ text: string; team: string | null }>;
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
    playerId: p.player_id,
    cardKey: c?.key ?? null,
    focusDraft: c ? `Focus set today on ${c.area_label.toLowerCase()}, ${p.figures.lost_per_round ?? c.numbers.lost_per_round.toFixed(1)} strokes a round lost then. No round counted since yet.` : null,
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
    improvement: p.memory?.improvement ?? null,
    changed: p.memory?.improvement ? null : (p.memory?.change_line ?? null),
    suppressed: p.memory?.suppressed ? { verdict: p.memory.suppressed.verdict === 'wrong' ? 'Wrong' : 'Not useful', reason: p.memory.suppressed.reason } : null,
    focus: p.focus ? { setOn: p.focus.set_on, since: p.focus.since_text, word: p.focus.word_text } : null,
    parts: (p.parts ?? []).map((x) => ({ label: x.label, text: x.text, where: x.where_text, team: x.team?.value.text ?? null })),
    signals: (p.signals ?? []).map((x) => ({ text: x.text, team: x.team_text?.value ?? null })),
    written: p.written ? { what: p.written.what, rulesInOut: p.written.rules_in_out, thisWeek: p.written.this_week, watch: p.written.watch } : null,
  };
}

/** The coach's own actions since the read was saved, as the card's loader reads them (held tables; RLS). */
export interface ChReadActions {
  feedback: { card_key: string; verdict: 'not_useful' | 'wrong'; reason: string; created_at: string } | null;
  focus: (FocusLink & { created_at: string }) | null;
}

/**
 * The card as it stands after the coach's own actions. A read is saved after a posted round and nightly, so a focus set or
 * a "not useful" a minute ago is not in it yet: a verdict on this card newer than the saved read steps it down now, and
 * a focus on this card the saved read has not counted yet says it was set and that no round is counted since.
 */
export function withCoachActions(read: ChAnalystRead, computedAt: string, actions: ChReadActions): ChAnalystRead {
  let out = read;
  const fb = actions.feedback;
  if (fb && read.cardKey && fb.card_key === read.cardKey && Date.parse(fb.created_at) > Date.parse(computedAt) && !read.suppressed) {
    out = { ...out, suppressed: { verdict: fb.verdict === 'wrong' ? 'Wrong' : 'Not useful', reason: fb.reason } };
  }
  const link = actions.focus;
  if (link && read.cardKey && link.card_key === read.cardKey && read.focus?.setOn !== link.set_on) {
    const f = focusJustSet(link);
    out = { ...out, focus: { setOn: link.set_on, since: f.since_text, word: f.word_text } };
  }
  return out;
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
