// =============================================================================
// src/app/baseball/(player-dashboard)/player/practice/page.tsx
//
// Player Practice View — mobile-first, glanceable practice plan.
//
// Server component: resolves the active baseball context, fetches the player's
// published practice plans (with personalized block visibility + class-conflict
// flags), and passes a serializable view-model to the client component.
//
// Security: getPlayerPractices() resolves the player from session (never from
// the URL). Players only ever see published, player-visible blocks. Staff-only
// blocks are filtered server-side.
// =============================================================================

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getPlayerPractices } from '@/app/baseball/actions/practice';
import { PlayerPracticeClient } from '@/components/baseball/practice-player/PlayerPracticeClient';

export const metadata = {
  title: 'Practice Plan · BaseballHelm',
};

export default async function PlayerPracticePage() {
  // Resolve active baseball context (server-validated — never trusts cookie alone).
  const context = await getActiveBaseballContext();
  if (!context) {
    // Lean empty state: no team yet. The practice client handles this gracefully.
    return (
      <PlayerPracticeClient
        practices={[]}
        teamless
      />
    );
  }

  // Fetch published practices for the active team, personalized for this player.
  const result = await getPlayerPractices();
  const practices = result.success ? (result.data ?? []) : [];

  return (
    <PlayerPracticeClient
      practices={practices}
      teamless={false}
      fetchError={result.success ? undefined : (result.error ?? 'Could not load practice plans.')}
    />
  );
}
