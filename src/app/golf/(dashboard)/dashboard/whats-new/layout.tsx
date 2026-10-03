import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: What's new opens Home (owner, 2026-10-01: alias the not-rebuilt routes).
export default async function WhatsNewLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard', player: '/golf/dashboard' });
  return children;
}
