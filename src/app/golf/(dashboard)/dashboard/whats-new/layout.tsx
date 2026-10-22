import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: What's new is rebuilt for the coach (routes/whats-new.tsx); a player has no such page, so theirs opens Home.
export default async function WhatsNewLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ player: '/golf/dashboard' });
  return children;
}
