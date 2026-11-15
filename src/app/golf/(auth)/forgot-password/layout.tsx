import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserResilient } from '@/lib/auth/resilient-get-user';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Reset your GolfHelm account password by entering your email address.',
};

export default async function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CH-15920: a signed-out visitor resets inside the sign-in panel instead
  // (`?view=forgot`). A signed-in one keeps this page: the proxy deliberately
  // lets them reach it (BOUNCE_WHEN_AUTHED), and /golf/login would bounce them
  // to their dashboard. Any session, even a degraded one, counts as signed in.
  const supabase = await createClient();
  const { user } = await getUserResilient(supabase);
  if (!user) redirect('/golf/login?view=forgot');
  return children;
}
