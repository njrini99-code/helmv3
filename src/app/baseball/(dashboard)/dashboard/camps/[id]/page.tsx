// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Shared coach + player surface (CampDetailClient reads
// role via useAuth internally) — thin server wrapper just requires a
// signed-in baseball user, matching the repo's standard shape.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import { isRecruitingEnabled } from '@/lib/baseball/product-modules';
import CampDetailClient from './CampDetailClient';

export default async function CampDetailPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  // PRODUCT-MODULE gate — see the sibling camps/page.tsx for the full rationale.
  // A camp DETAIL url is the one most likely to be bookmarked or emailed, so it
  // needs the door as much as the index does.
  if (!isRecruitingEnabled()) {
    redirect(
      session.role === 'coach' ? '/baseball/dashboard/command-center' : '/baseball/player/today',
    );
  }

  return <CampDetailClient />;
}
