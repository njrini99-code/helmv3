import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a coach's CoachHelm is /coachhelm. /intelligence is where the CRM demo invites, the coach insight push and the
// older addresses that redirect here land (swap audit §14 D6); with Clubhouse on they open the board, not a placeholder.
export default async function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/coachhelm' });
  return children;
}
