import type { ReactNode } from 'react';
import { isUuid } from '@/lib/utils/uuid';
import { redirectToClubhouse } from '@/clubhouse/routes/alias';

// Clubhouse: a coach's page for one player is the roster, named for that player (spec D, 2026-10-21): the phone opens their
// profile from ?player= (an id not on the roster opens nothing); desktop ignores it and shows the list (30102). A player has
// no page for a teammate (the roster is read-only), so the address goes to the roster.
export default async function RosterPlayerLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isUuid(id)) await redirectToClubhouse({ coach: `/golf/dashboard/roster?player=${id}`, player: '/golf/dashboard/roster' });
  return children;
}
