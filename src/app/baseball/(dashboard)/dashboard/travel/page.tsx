// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Shared coach + player surface (TravelPageClient
// resolves role itself) — thin server wrapper just requires a signed-in
// baseball user, matching the repo's standard shape. NOT the UI redesign this
// route is deferred for (Lane B Fairway migration collision, PR #555) — this
// only adds the missing auth gate.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import TravelPageClient from './TravelPageClient';

export default async function TravelPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return <TravelPageClient />;
}
