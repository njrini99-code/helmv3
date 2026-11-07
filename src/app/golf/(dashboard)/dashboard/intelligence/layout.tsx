import { aliasId, redirectToClubhouse } from '@/clubhouse/routes/alias';
import { intelligenceTarget } from '@/clubhouse/data/coachhelm-coach-brief-shape';

// Clubhouse: a coach's CoachHelm is /coachhelm. /intelligence is where the CRM demo invites, the coach insight mail and the older
// addresses that redirect here land: the board, `?player=<id>` opens it on that player, and `?view=chat` opens Ask (`intelligenceTarget`).
export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({
    coach: (q) => intelligenceTarget(q, aliasId(q, 'player')),
  });
  return children;
}
