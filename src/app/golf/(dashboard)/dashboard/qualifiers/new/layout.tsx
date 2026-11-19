import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// L-004 (owner, 18 Nov 2026): creating a qualifier is a coach's; a player's address opens Qualifiers instead of a lock.
export default async function NewQualifierLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ player: '/golf/dashboard/qualifiers' });
  return children;
}
