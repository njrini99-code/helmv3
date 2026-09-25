/**
 * Coach voice for stored insights.
 *
 * Generators author `title` / `content` for the player ("You escape the
 * bunker…"). A generator that also returns `coach` copy has it stored as
 * `evidence.coach_copy`, written in neutral third person ("The player
 * escapes…"). Coach readers run rows through {@link withCoachVoice}; player
 * readers never do, so a player can never see their own insight in the third
 * person. Rows without coach copy (older rows, unconverted generators) keep
 * their stored text.
 */
import type { InsightCoachCopy } from '@/lib/coachhelm/v2/insights/types';

function isCoachCopy(v: unknown): v is InsightCoachCopy {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.title === 'string' && c.title.trim() !== '' && typeof c.content === 'string' && c.content.trim() !== '';
}

/** The stored coach copy on an evidence blob, or null. */
export function coachCopyOf(evidence: unknown): InsightCoachCopy | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const copy = (evidence as { coach_copy?: unknown }).coach_copy;
  return isCoachCopy(copy) ? copy : null;
}

/** A row with its title/content swapped for the coach copy when present. */
export function withCoachVoice<T extends { title: string; content: string; evidence?: unknown }>(row: T): T {
  const copy = coachCopyOf(row.evidence);
  return copy ? { ...row, title: copy.title, content: copy.content } : row;
}
