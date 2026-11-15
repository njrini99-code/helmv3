import { rebuiltHref } from '../../../shell/nav';

const ASK = '/golf/dashboard/coachhelm?view=ask';

/**
 * Where other lanes link "Ask CoachHelm about this" (Read, Team, Lenses). `first` names the player in the seeded question; a player's own link says "my".
 */
export function askAboutHref(input: { question: string }): string {
  return rebuiltHref(`${ASK}&q=${encodeURIComponent(input.question)}`, 'coach') ?? `${ASK}&q=${encodeURIComponent(input.question)}`;
}

export function askAboutReadHref(input: { insightId: string; title: string; first?: string }): string {
  const q = input.first ? `Tell me about ${input.first}: ${input.title}` : `Tell me about my read: ${input.title}`;
  return `${ASK}&q=${encodeURIComponent(q)}&insight=${encodeURIComponent(input.insightId)}`;
}
