import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse has no course library yet (courses are picked in round setup); until it is built the address opens Home
// rather than a placeholder (owner, 2026-10-01: alias the not-rebuilt routes). For both roles (GAP-R-12): a player had
// "Courses isn’t available here" for an address that has nothing of theirs.
export default async function CoursesLayout({ children }: { children: React.ReactNode }) {
  await redirectToClubhouse({ coach: '/golf/dashboard', player: '/golf/dashboard' });
  return children;
}
