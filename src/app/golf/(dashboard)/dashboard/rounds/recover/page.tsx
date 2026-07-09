import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayRecoverRound } from '@/components/fairway/pages/rounds-recover';

export default async function RecoverRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard');

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRecoverRound playerId={player.id} />
    </div>
  );
}
