import { aliasId, redirectToClubhouse } from '@/clubhouse/routes/alias';
import { intelligenceTarget } from '@/clubhouse/data/coachhelm-coach-brief-shape';
import { isMondayBriefEnabled } from '@/lib/coachhelm/v3/monday-brief/flag';

// Clubhouse: a coach's CoachHelm is /coachhelm. /intelligence ("Brief") is where the CRM demo invites, the coach insight push and
// the older addresses that redirect here land (swap audit §14 D6). With the coach Brief on (`coachhelm_monday_brief_v1`) they open
// the Brief at the part they were for: Signals on this week's reads (its patterns filter on the team pattern), Players on what
// players are working on, Effectiveness on the track record. `?player=<id>` (an insight about one player) opens the board on that
// player and `?view=chat` opens Ask. With the Brief off every one of them opens the board, as before (`intelligenceTarget`).
export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({
    coach: (q) => intelligenceTarget(q, isMondayBriefEnabled(), aliasId(q, 'player')),
  });
  return children;
}
