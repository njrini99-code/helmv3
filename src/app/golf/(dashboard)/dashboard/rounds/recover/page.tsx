import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RecoverRoundClient from './recover-round-client';

export default async function RecoverRoundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    redirect('/golf/dashboard');
  }

  return <RecoverRoundClient playerId={player.id} />;
}
