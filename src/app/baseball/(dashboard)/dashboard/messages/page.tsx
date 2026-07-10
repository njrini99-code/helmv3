// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all — it read `useAuthStore()` directly (not even useAuth's
// loading gate). Shared coach + player surface — thin server wrapper just
// requires a signed-in baseball user, matching the repo's standard shape.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import MessagesClient from './MessagesClient';

export default async function MessagesPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return <MessagesClient />;
}
