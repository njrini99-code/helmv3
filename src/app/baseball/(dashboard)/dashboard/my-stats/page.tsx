import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { MyStatsClient } from './MyStatsClient';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Stats | Helm',
  description: 'View your personal batting and performance statistics',
};

export default async function MyStatsPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');
  if (session.role === 'coach') {
    redirect('/baseball/dashboard/stats-center');
  }

  return <MyStatsClient />;
}
