import { aliasId, redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a coach's CoachHelm is /coachhelm. /intelligence is where the CRM demo invites, the coach insight push and the
// older addresses that redirect here land (swap audit §14 D6); with Clubhouse on they open the board, not a placeholder.
// `?player=<id>` (an insight about one player) opens the board on that player and `?view=chat` opens Ask; any other view
// has no Clubhouse twin and is dropped.
export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({
    coach: (q) => {
      const next = new URLSearchParams();
      const player = aliasId(q, 'player');
      if (player) next.set('player', player);
      if (q.get('view') === 'chat') next.set('view', 'ask');
      const query = next.toString();
      return query ? `/golf/dashboard/coachhelm?${query}` : '/golf/dashboard/coachhelm';
    },
  });
  return children;
}
