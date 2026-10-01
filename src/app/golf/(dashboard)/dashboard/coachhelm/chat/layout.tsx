import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: the coach's chat is the Ask sub-tab of CoachHelm (`?view=ask`); a player has no chat, so theirs opens CoachHelm.
export default async function CoachHelmChatLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/coachhelm?view=ask', player: '/golf/dashboard/coachhelm' });
  return children;
}
