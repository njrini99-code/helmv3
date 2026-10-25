import type { ChReadArea, ChReadCount } from '../../data/coachhelm-classify';
import { pluralWord } from '../../lib/plural';

/**
 * Game detail's "CoachHelm sees…" sentence (P005, spec D build A), in the same words for a coach and a player: it names the reads,
 * never the reader ("CoachHelm sees 2 reads costing strokes on approach and 1 working."). Null when there is nothing to say: a
 * section with no current read draws no line, never "0 reads".
 */
export const READ_AREA_PHRASE: Record<ChReadArea, string> = {
  scoring: 'in scoring',
  tee: 'off the tee',
  approach: 'on approach',
  short: 'around the green',
  putting: 'on the greens',
};

/** The sentence as parts, so the counts can be set as figures: `[text, count, text, …]`, counts at the odd places. */
export function readsLineParts(area: ChReadArea, c: ChReadCount): Array<string | number> | null {
  const where = READ_AREA_PHRASE[area];
  if (c.costing > 0 && c.working > 0) return ['CoachHelm sees ', c.costing, ` ${pluralWord(c.costing, 'read')} costing strokes ${where} and `, c.working, ' working.'];
  if (c.costing > 0) return ['CoachHelm sees ', c.costing, ` ${pluralWord(c.costing, 'read')} costing strokes ${where}.`];
  if (c.working > 0) return ['CoachHelm sees ', c.working, ` ${pluralWord(c.working, 'read')} working ${where}.`];
  return null;
}

/** The sentence as plain text. */
export function readsLine(area: ChReadArea, c: ChReadCount): string | null {
  const parts = readsLineParts(area, c);
  return parts ? parts.join('') : null;
}

/** What the line says when the reads did not load (CH-5215). */
export const READS_FAILED = 'CoachHelm’s reads didn’t load, so the sections don’t say how many there are. Try again in a moment.';
