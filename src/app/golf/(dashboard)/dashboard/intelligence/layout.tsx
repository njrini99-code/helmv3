import { aliasId, redirectToClubhouse } from '@/clubhouse/routes/alias';
import { intelligenceTarget } from '@/clubhouse/data/coachhelm-coach-brief-shape';

// Clubhouse: a coach's CoachHelm is /coachhelm. /intelligence is where the CRM demo invites, the coach insight mail and the older
// addresses that redirect here land: the board, `?player=<id>` opens it on that player, and `?view=chat` opens Ask (`intelligenceTarget`).
export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({
    coach: (q) => intelligenceTarget(q, aliasId(q, 'player')),
    // L-004 (owner, 18 Nov 2026): a player's address opens their own CoachHelm instead of a lock.
    player: '/golf/dashboard/coachhelm',
  });
  return children;
}
