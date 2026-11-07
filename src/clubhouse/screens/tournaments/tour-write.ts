/**
 * What a Tournaments write says when the server refuses it. The server actions (`app/golf/actions/tournaments.ts`)
 * return `{ success: false, code }` where `code` is a `TourRefusalCode`; a screen decides from the code and shows the
 * words below, never the other way round. Pure and client-safe.
 */
import { TOUR_REFUSAL_CODES, TOUR_REFUSAL_COPY, type TourRefusalCode } from '@/lib/golf/tournament-refusals';

/** A refusal code the server sent, narrowed to one we have words for (anything else is the generic failure). */
export function refusalCodeOf(code: string | null | undefined): TourRefusalCode {
  return (TOUR_REFUSAL_CODES as readonly string[]).includes(code ?? '') ? (code as TourRefusalCode) : 'failed';
}

/** The words for a refusal, in the coach's terms. */
export function refusalText(code: string | null | undefined): string {
  return TOUR_REFUSAL_COPY[refusalCodeOf(code)];
}

/** Whether the refusal means the page is out of date and needs a re-read (the event changed, or is gone). */
export function needsReload(code: string | null | undefined): boolean {
  const c = refusalCodeOf(code);
  return c === 'stale' || c === 'not_found';
}
