import { requireBaseballPlayerRoute } from '@/lib/baseball/server-route-guards';
import { MyStatsClient } from './MyStatsClient';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Stats | Helm',
  description: 'View your personal batting and performance statistics',
};

export default async function MyStatsPage() {
  await requireBaseballPlayerRoute();
  return <MyStatsClient />;
}
