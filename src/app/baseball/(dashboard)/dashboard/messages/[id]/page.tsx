// SECURITY: this route was a whole-file 'use client' page with NO server-side
// auth check at all. Thin server wrapper guards, then renders
// ConversationClient (renamed from the former default export) — see that
// file's header comment for why this file exists now.
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import ConversationClient from './ConversationClient';

export default async function ConversationPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return <ConversationClient />;
}
