// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Shared coach + player surface (AnnouncementsClient
// branches internally on role) — thin server wrapper just requires a
// signed-in baseball user, matching the repo's standard shape.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import AnnouncementsClient from './AnnouncementsClient';

export default async function AnnouncementsPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return <AnnouncementsClient />;
}
