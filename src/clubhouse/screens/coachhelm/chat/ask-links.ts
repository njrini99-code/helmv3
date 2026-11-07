import { rebuiltHref } from '../../../shell/nav';

const ASK = '/golf/dashboard/coachhelm?view=ask';

/**
 * Where other lanes link "Ask CoachHelm about this" (Read, Team, Lenses). Null with Ask v2 off, so the row is left out: `on` comes from the
 * server (flags are server only). `first` names the player in the seeded question; a player's own link says "my".
 */
export function askAboutHref(input: { question: string }, on = false): string | null {
  if (!on) return null;
  return rebuiltHref(`${ASK}&q=${encodeURIComponent(input.question)}`, 'coach') ?? `${ASK}&q=${encodeURIComponent(input.question)}`;
}

export function askAboutReadHref(input: { insightId: string; title: string; first?: string }, on = false): string | null {
  if (!on) return null;
  const q = input.first ? `Tell me about ${input.first}: ${input.title}` : `Tell me about my read: ${input.title}`;
  return `${ASK}&q=${encodeURIComponent(q)}&insight=${encodeURIComponent(input.insightId)}`;
}
