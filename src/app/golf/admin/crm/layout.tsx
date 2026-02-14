import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function CRMLayout({
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

  return <>{children}</>;
}
