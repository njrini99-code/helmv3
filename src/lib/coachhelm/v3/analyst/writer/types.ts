/**
 * CoachHelm analyst, stage 3: the written read's shapes.
 *
 * The analyst's code measures (fact sheet) and judges (notability). This folder adds the model that writes the card's
 * "why" and "what to do", and the code that checks every word of it against the counted facts. Pure types.
 */
import type { UsageTotals } from '@/lib/coachhelm/v3/chat/engine/model';
import type { Notability } from '../notability';
import type { FactSheet } from '../types';

/**
 * The block a saved read carries (`ReadPayload.written?` in the stage 1-4 work). Exactly this shape: four short
 * paragraphs in a coach's words, the model that wrote them and when code passed them.
 */
export interface WrittenRead {
  /** What is going on, from the counted pattern. */
  what: string;
  /** What the evidence rules in, and what it cannot tell (swing, intent, conditions). */
  rules_in_out: string;
  /** One thing to do this week, sized to the player: reps, a drill, a measurable target. */
  this_week: string;
  /** The one thing to watch or record to learn more. */
  watch: string;
  /** The model that wrote the text that passed (the fallback model's id if a refusal fallback answered). */
  model: string;
  /** ISO time the checker passed it. */
  checked_at: string;
}

/**
 *   coach   the coach's card: team blocks allowed.
 *   player  the player's own card: the caller hands in `withoutCoachOnly(sheet)`, and the payload strips every
 *           coach-only part of the notability too, so no teammate figure reaches the prompt or the text.
 */
export type WriterView = 'coach' | 'player';

export interface WriterInput {
  view: WriterView;
  sheet: FactSheet;
  /** `findNotable(sheet)`: the priority and up to three candidates. A read is written only when a priority exists. */
  notability: Notability;
  /**
   * Optional: the texts already written for other players in the same run. A draft that reads too much like one of them
   * (word-trigram overlap above {@link TEMPLATE_SIMILARITY_MAX}) is rejected, so the paragraphs cannot become a template.
   */
  others?: readonly string[];
}

/** One numbered reason the checker gave. `rule` is stable, `detail` is plain words fed back to the model on repair. */
export interface Rejection {
  rule: RejectionRule;
  field: DraftField | 'declared' | 'draft';
  detail: string;
}

export type RejectionRule =
  | 'malformed'
  | 'number_not_in_facts'
  | 'arithmetic_wrong'
  | 'prescription_outside_advice'
  | 'prescription_out_of_range'
  | 'date_not_in_facts'
  | 'unsupported_cause'
  | 'teammate_reference'
  | 'change_claim_unsupported'
  | 'overstated_certainty'
  | 'advice_outside_areas'
  | 'advice_not_measurable'
  | 'em_dash'
  | 'jargon'
  | 'too_long'
  | 'template_like'
  | 'refused'
  | 'no_read_returned'
  | 'api_error';

export type DraftField = 'what' | 'rules_in_out' | 'this_week' | 'watch';
export const DRAFT_FIELDS: readonly DraftField[] = ['what', 'rules_in_out', 'this_week', 'watch'];

/** The part of the game advice can be about. `scoring` is a candidate area like big numbers, not a part of the game. */
export type AdviceArea = 'off_the_tee' | 'approach' | 'around_the_green' | 'putting' | 'scoring';

/**
 * A number the text uses that is not itself a fact:
 *   arithmetic   plain arithmetic of fact numbers, written out (`75 / 104 * 100`). Code redoes it.
 *   prescription a number the advice prescribes (reps, a target, a distance to practise from). Only in `this_week` and
 *                `watch`; a distance must sit inside a band of the priority's or a candidate's area.
 */
export interface DeclaredNumber {
  value: number;
  kind: 'arithmetic' | 'prescription';
  expression?: string;
  unit?: 'feet' | 'yards' | 'reps' | 'percent' | 'count' | 'minutes' | 'sessions';
}

/** What the model returns through the `submit_read` tool. */
export interface Draft {
  what: string;
  rules_in_out: string;
  this_week: string;
  watch: string;
  this_week_area: AdviceArea;
  declared: DeclaredNumber[];
}

/** The injected model client: the chat engine's own (`anthropicModelClient()` in production, a fake in tests). */
export interface WriterDeps {
  client: import('@/lib/coachhelm/v3/chat/engine/model').ModelClient;
  /** The clock for `checked_at`. Injected so a test is deterministic. */
  now: () => Date;
  signal?: AbortSignal;
}

export interface WriteResult {
  /** Null when no draft passed in two attempts, the model refused, or the call failed: the stage 1 card stands. */
  written: WrittenRead | null;
  /** Model attempts made (0 when there was nothing to write). */
  attempts: number;
  /** Every reason a draft was turned down, in order, attempt by attempt. */
  rejections: Array<{ attempt: number; reasons: Rejection[] }>;
  /** Tokens across every call, the chat engine's own shape, so the same cost table prices it. */
  usage: UsageTotals;
  /** US dollars, at the model's published rates (`turnCostUsd`). */
  cost_usd: number;
}

export type { FactSheet, Notability };

/** Word-trigram Jaccard overlap above which a draft is "the same paragraph" as another player's. */
export const TEMPLATE_SIMILARITY_MAX = 0.5;
