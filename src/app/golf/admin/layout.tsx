import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminNativeGuard } from '@/components/golf/AdminNativeGuard';
import { AdminMotionProvider } from './_motion-provider';
import { getUserResilient } from '@/lib/auth/resilient-get-user';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

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
  return (
    <AdminMotionProvider>
      <AdminNativeGuard />
      {children}
    </AdminMotionProvider>
  );
}
