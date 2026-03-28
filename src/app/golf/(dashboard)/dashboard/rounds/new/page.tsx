import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

export default async function NewRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard?message=Only players can submit rounds');

  const supabase = await createClient();

  // Check for in-progress rounds so we can prompt the player to resume
  // Show ANY in_progress round (including setup-only drafts without shots)
  let inProgressRounds: { id: string; course_name: string | null; current_hole: number | null; holes_played: number | null; updated_at: string | null }[] | null = null;
  try {
    const result = await supabase
      .from('golf_rounds')
      .select('id, course_name, current_hole, holes_played, updated_at')
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(1);
    inProgressRounds = result.data;
  } catch {
    // Network failure — page still loads, just won't show resume prompt
  }

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
