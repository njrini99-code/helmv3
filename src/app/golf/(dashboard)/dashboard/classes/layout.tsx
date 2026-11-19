import { Metadata } from 'next';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

export const metadata: Metadata = {
  title: 'Classes',
  description: 'View and manage your academic class schedule. Import schedules, add classes, and help coaches plan practices around your commitments.',
};

// L-004 (owner, 18 Nov 2026): Classes is a player's page; a coach's address opens Home instead of "isn't available here".
export default async function ClassesLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard' });
  return children;
}
