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
    .maybeSingle();

  if (!player) {
    redirect('/golf/dashboard?message=Only players can submit rounds');
  }

  // Check for in-progress rounds so we can prompt the player to resume
  // Show ANY in_progress round (including setup-only drafts without shots)
  const { data: inProgressRounds } = await supabase
    .from('golf_rounds')
    .select('id, course_name, current_hole, holes_played, updated_at')
    .eq('player_id', player.id)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1);

  let existingRound: { id: string; courseName: string; currentHole: number; holesPlayed: number } | null = null;
  if (inProgressRounds && inProgressRounds.length > 0) {
    const round = inProgressRounds[0]!;
    existingRound = {
      id: round.id,
      courseName: round.course_name || 'Unknown Course',
      currentHole: round.current_hole || 1,
      holesPlayed: round.holes_played || 18,
    };
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <NewRoundClient existingInProgressRound={existingRound} />
      </AnimatedItem>
    </AnimatedPage>
  );
}
