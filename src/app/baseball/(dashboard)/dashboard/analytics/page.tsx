import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import AnalyticsClient from './AnalyticsClient';

export default async function AnalyticsPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');
  if (session.role === 'coach') redirect('/baseball/dashboard/command-center');

  return <AnalyticsClient />;
}
