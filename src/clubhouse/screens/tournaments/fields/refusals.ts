/**
 * The catalog number of each tournament refusal string (one code per string, changelog should 16). The words are
 * src/lib/golf/tournaments/refusals.ts, shared with the server actions; the numbers are the Clubhouse's.
 */
import { refusalCopy, type RefusalKey, type TournamentRefusal } from '@/lib/golf/tournaments/refusals';

export { refusalCopy, refusalOf, type TournamentRefusal } from '@/lib/golf/tournaments/refusals';

/**
 * Refusals only the tournaments page can meet (stopping tracking of an official tournament) take their number on that
 * page's catalog (P016; P-5 reserved a number there) once 4.33's page lands; the calendar never calls those writes.
 */
type CalendarKey = Exclude<RefusalKey, 'tournament_official'>;

export const REFUSAL_CODE: Record<CalendarKey, string> = {
  stale: 'CH-6241',
  already_tracked: 'CH-6048',
  event_is_series: 'CH-6148',
  event_cancelled: 'CH-6149',
  event_not_found: 'CH-6049',
  restore_order: 'CH-6058',
  round_order: 'CH-6143',
  round_count: 'CH-6142',
  bad_name: 'CH-6147',
  round_started: 'CH-6050',
  round_has_scores: 'CH-6051',
  qualifier_not_found: 'CH-6052',
  qualifier_linked: 'CH-6057',
  trip_not_found: 'CH-6053',
  entries_unavailable: 'CH-6059',
  round_locked: 'CH-6054',
  not_coach: 'CH-6055',
  round_failed: 'CH-6060',
  change_failed: 'CH-6061',
  create_failed: 'CH-6056',
};

/** A refusal's words and catalog number, for an inline notice or a toast. */
export function refusalNotice(r: TournamentRefusal, ctx: Parameters<typeof refusalCopy>[1] = {}): { code: string; text: string } {
  const c = refusalCopy(r, ctx);
  if (c.key === 'tournament_official') return refusalNotice('failed', { ...ctx, save: ctx.save ?? 'untrack' });
  return { code: REFUSAL_CODE[c.key], text: c.text };
}
