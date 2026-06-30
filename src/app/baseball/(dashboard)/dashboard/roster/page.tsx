import { redirect } from 'next/navigation';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getRoster } from '@/lib/baseball/read-models/roster';
import { RosterClient } from './RosterClient';

export const dynamic = 'force-dynamic';

export default async function RosterPage() {
  const ctx = await getActiveBaseballContext();
  if (!ctx?.activeTeamId) {
    redirect('/baseball/dashboard/command-center');
  }

  const model = await getRoster(ctx.activeTeamId);

  return (
    <RosterClient
      teamId={ctx.activeTeamId}
      initialModel={model}
    />
  );
}
