import type { Metadata } from 'next';
import { GateNotFound } from '@/clubhouse/screens/auth/GateError';

/**
 * GolfHelm's 404 outside the dashboard shell (CH-1306): `notFound()` from a join link or onboarding, or a `/golf`
 * address that is no page. Clubhouse's sign-in room with the shell's own words; the dashboard keeps its in-shell page
 * (dashboard/not-found.tsx, ClubhouseNotFound). Admin keeps the platform's 404 (admin/not-found.tsx).
 */
export const metadata: Metadata = { title: 'Page not found' };

export default function GolfNotFound() {
  return <GateNotFound />;
}
