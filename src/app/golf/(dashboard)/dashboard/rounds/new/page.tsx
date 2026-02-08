import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

export default async function NewRoundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Verify user is a player (coaches cannot submit rounds)
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/golf/dashboard?message=Only players can submit rounds');
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <NewRoundClient />
      </AnimatedItem>
    </AnimatedPage>
  );
}
