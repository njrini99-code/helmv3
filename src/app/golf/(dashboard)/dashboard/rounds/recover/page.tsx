import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import RecoverRoundClient from './recover-round-client';

export default async function RecoverRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard');

  return <RecoverRoundClient playerId={player.id} />;
}
