/**
 * CoachHelm reads: which of today's `golf_coach_insights` rows a team on reads (`coachhelm_reads_v1`, team listed) no longer
 * sees, for the readers outside the Clubhouse board and file (the What's new feed, the notification receipts, the Monday
 * brief). Stage 1's rule: "nothing found" rows and good-news rows leave; nothing is deleted, and every other team sees
 * exactly what it saw. It runs AFTER `applyInsightVisibility`, never instead of it.
 *
 * The Clubhouse board and file use `kindOf` (src/clubhouse/data/coachhelm-classify.ts), whose "strength" also compares the
 * player with the Tour value the card draws. A server reader has no Tour baseline, so this is the part of that rule it can
 * evaluate from the row alone: a note (the note signatures, or `feed_exempt`), or a celebratory row (resolved, or the
 * derived tone). A strength that only the Tour comparison makes one stays in these feeds; it is a finding-shaped row there.
 */
import { deriveTone } from '@/lib/coachhelm/tone-derivation';
import { readsEnabled } from './flag';

import { NOTE_SIGNATURE } from './note-signature';

export { NOTE_SIGNATURE };

export interface ReadsHideableRow {
  signature?: string | null;
  evidence?: unknown;
  lifecycle_state?: string | null;
  priority?: string | null;
  category?: string | null;
}

/** A note or good news: what a team on reads no longer sees outside the analyst's card. */
export function hiddenForReadsTeam(row: ReadsHideableRow): boolean {
  const ev = (row.evidence ?? null) as { feed_exempt?: unknown } | null;
  if (ev?.feed_exempt === true) return true;
  if (row.signature && NOTE_SIGNATURE.test(row.signature)) return true;
  if (row.lifecycle_state === 'resolved') return true;
  return deriveTone(row as Parameters<typeof deriveTone>[0]) === 'celebratory';
}

/** The rows a team sees: unchanged for a team not on reads. */
export function withoutReadsHidden<T extends ReadsHideableRow>(rows: readonly T[], teamId: string | null | undefined, enabled: (teamId: string | null | undefined) => boolean = readsEnabled): T[] {
  return teamId && enabled(teamId) ? rows.filter((r) => !hiddenForReadsTeam(r)) : [...rows];
}

/** Columns a reader adds to its select so the rule can be evaluated. */
export const READS_HIDE_COLUMNS = 'signature, evidence, lifecycle_state, priority, category';
