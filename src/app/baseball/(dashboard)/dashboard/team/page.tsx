import TeamDashboardClient from './TeamDashboardClient';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

export default function TeamDashboardPage() {
  return <TeamDashboardClient />;
}
