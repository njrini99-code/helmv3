import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: team settings live in Settings (a coach's Team section, a player's Golf section; owner, 2026-10-01).
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard/settings?section=team', player: '/golf/dashboard/settings?section=golf' });
  return children;
}
