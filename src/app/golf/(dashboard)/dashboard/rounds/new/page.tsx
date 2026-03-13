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

  // Clean up orphaned drafts — fire-and-forget using
  // the already-available client + player ID to avoid redundant auth/player
  // lookups that caused timeouts (see server error: cleanupOrphanedDrafts timeout)
  // Bug #5: Use created_at so auto-save can't defeat cleanup by resetting updated_at
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Delete player's in_progress rounds older than 24h by created_at
  void supabase
    .from('golf_rounds')
    .delete()
    .eq('player_id', player.id)
    .eq('status', 'in_progress')
    .lt('created_at', cutoff24h)
    .then(() => {
      // Also clean up any very old drafts (7+ days) by created_at as a safety net
      void supabase
        .from('golf_rounds')
        .delete()
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .lt('created_at', cutoff7d);
    });

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
