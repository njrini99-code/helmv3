import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminNativeGuard } from '@/components/golf/AdminNativeGuard';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
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
  return (
    <>
      <AdminNativeGuard />
      {children}
    </>
  );
}
