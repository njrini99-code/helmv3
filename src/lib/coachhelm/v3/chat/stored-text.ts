/**
 * CoachHelm chat: a stored read's text and figures, as the model may be handed them.
 *
 * A stored insight is template text. Most rows carry the generators' placeholder cause ("<metric> is off its
 * benchmark. Likely cause inferred from the aggregate, not a measured shot sequence") and the action that goes with it
 * ("Target <metric> in the next practice block"), on good-news rows too, and the rules cite the research document
 * ("Per Research doc §4"). None of that is a finding. A reader hands the model the row's title and its measured
 * figures, and the stored words only once those sentences are out, so the model reasons from the numbers.
 */
import { isPlaceholderCause, withoutPlaceholderCause } from '@/lib/coachhelm/reads/placeholder-cause';
import { stripSelfReferences } from './knowledge/reference-plain';

/** The generators' fallback action, as its own sentence (`buildDiagnosis`, v3/engine/generator-base.ts). */
const TEMPLATE_ACTION = /(?:^|(?<=[.!?])\s+)Target [^.!?]{1,80} in the next practice block\.?/gi;

/** True for the placeholder cause or the fallback action on its own: text that states nothing measured. */
export function isTemplateSentence(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  return isPlaceholderCause(t) || /^Target [^.!?]{1,80} in the next practice block\.?$/i.test(t);
}

/** Stored words with the research pointer and the two template sentences taken out. Null when nothing else was there. */
export function storedInsightText(text: string | null | undefined): string | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const kept = withoutPlaceholderCause(stripSelfReferences(text)).replace(TEMPLATE_ACTION, '').replace(/\s+/g, ' ').trim();
  return kept || null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const figure = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * What a stored read measured, from its evidence: the metric, the player's figure as the card shows it, what it is
 * read against and that figure, how many it rests on, and the day its window ends. Null for what the row does not hold.
 */
export function measuredFacts(evidence: unknown): { metric_label: string | null; value_display: string | null; comparison_label: string | null; comparison_value: number | null; sample_size: number | null; window_end: string | null } {
  const ev = (evidence && typeof evidence === 'object' ? evidence : {}) as Record<string, unknown>;
  return {
    metric_label: text(ev.metric_label),
    value_display: text(ev.your_value_display),
    comparison_label: text(ev.comparison_label),
    comparison_value: figure(ev.comparison_value),
    sample_size: figure(ev.sample_n),
    window_end: text(ev.window_end)?.slice(0, 10) ?? null,
  };
}
