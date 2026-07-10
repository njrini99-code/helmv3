// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Shared coach + player surface (CampDetailClient reads
// role via useAuth internally) — thin server wrapper just requires a
// signed-in baseball user, matching the repo's standard shape.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import CampDetailClient from './CampDetailClient';

export default async function CampDetailPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return <CampDetailClient />;
}
