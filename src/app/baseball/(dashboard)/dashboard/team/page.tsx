import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';

export const dynamic = 'force-dynamic';

export default async function TeamDashboardPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');

  const target =
    context.activeRole === 'coach'
      ? '/baseball/dashboard/command-center'
      : '/baseball/player/today';
  redirect(target);
}
