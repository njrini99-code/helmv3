/**
 * The link inbox's pure half: which rows are still to do, the words for a suggestion's confidence, and the event round a
 * row starts on. No React. The match itself is `links.ts` (the loader runs it); this only reads its answer.
 */
import type { ChTourLinkCandidate, ChTourLinksData } from './types';

export const CONFIDENCE_WORDS: Record<'high' | 'medium' | 'low', { label: string; why: string }> = {
  high: { label: 'High', why: 'Same day and course' },
  medium: { label: 'Medium', why: 'Same day, a different course' },
  low: { label: 'Low', why: 'A day away' },
};

/** The rows still to do: a row linked or dismissed in this session leaves at once, before the page re-reads. */
export function openCandidates(candidates: readonly ChTourLinkCandidate[], gone: ReadonlySet<string>): ChTourLinkCandidate[] {
  return candidates.filter((c) => !gone.has(c.roundId));
}

/** The event and round a row starts on: its suggestion, else nothing (the coach picks). */
export function startingPick(c: ChTourLinkCandidate, events: ChTourLinksData['events']): { eventId: string; roundEventId: string } | null {
  const s = c.suggestion;
  if (!s) return null;
  const event = events.find((e) => e.id === s.eventId);
  const round = event?.rounds.find((r) => r.roundEventId === s.roundEventId) ?? event?.rounds.find((r) => r.number === s.roundNumber);
  return event && round ? { eventId: event.id, roundEventId: round.roundEventId } : null;
}

/** "R2 · Oct 6 · Oakmont CC": a round in a Select. */
export function roundOption(r: { number: number; date: string; courseName: string }, day: (iso: string) => string): string {
  return [`R${r.number}`, day(r.date), r.courseName].filter(Boolean).join(' · ');
}
