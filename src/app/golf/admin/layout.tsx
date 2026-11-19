import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { AdminNativeGuard } from '@/components/native/AdminNativeGuard';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { AvatarToneProvider } from '@/components/fairway/controls/avatar';
import { AdminMotionProvider } from './_motion-provider';

// Golf admin tabs read 'Demo sessions · Admin', not the GolfHelm suffix (GAP-R-17).
export const metadata: Metadata = { title: { template: '%s · Admin', default: 'Admin' } };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Transient-tolerant: a throttled auth server must not bounce an active
  // admin to login (resilient-get-user.ts). The role check below still runs
  // an RLS-authed query, so a degraded identity can't reach admin data.
  const { user } = await getUserResilient(supabase);
  if (!user) {
    redirect('/golf/login');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    redirect('/golf/login');
  }

  // Hide admin panel from the native iOS app — prevents Apple reviewers
  // from seeing the desktop-oriented CRM (avoids Guideline 4.2.2 risk).
  // AdminMotionProvider wraps the subtree in <LazyMotion features={domAnimation}>.
  // Without it, every `<m.*>` in admin renders as static DOM and animations
  // silently no-op — that's why AnimatedNumber locked at "0" on the Tracer KPI
  // tiles even when the underlying spring was updating to the real value.
  // SessionActivityProvider: WITHOUT it, nothing on /golf/admin/* refreshes
  // the sb_last_activity marker, so the middleware idle gate bounced an
  // ACTIVELY-working admin every ~5 minutes (2026-07-20 incident — Nick was
  // signed out of the CRM mid-use). Every idle-gated surface must mount it.
  return (
    <SessionActivityProvider>
      <AdminMotionProvider>
        <AdminNativeGuard />
        {/* Photo-less avatars in the CRM get the roster card's pastel identity tint (--fw-tint-N, seeded by the person's
            id via Avatar `identityKey`). It sat on the golf layout before; only admin draws Fairway avatars now. */}
        <AvatarToneProvider tone="identity">{children}</AvatarToneProvider>
      </AdminMotionProvider>
    </SessionActivityProvider>
  );
}
