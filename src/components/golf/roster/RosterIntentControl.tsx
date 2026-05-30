'use client';

/**
 * RosterIntentControl — coach-only inline control that mounts the built
 * IntentPill on a roster card and opens the IntentDrawer to author intent.
 *
 * The roster page (`roster/page.tsx`) is a server component, so it loads
 * the coach's intents once via `loadCoachIntents(coach.id)` and passes the
 * resolved per-player value down here. This small client island owns the
 * drawer open-state (IntentPill/IntentDrawer manage everything else).
 *
 * Data honesty: `current` is the actual DB row for this (coach, player)
 * pair, or `null` when none exists. We pass `narrative_goal={null}` to the
 * pill in that case so it shows its honest "No intent" cold-start chip —
 * we never synthesize a "set" state. The IntentDrawer falls back to its own
 * develop/balanced defaults in local form state only; nothing is persisted
 * until the coach clicks Save (the real `setIntent` write path).
 */

import { useState } from 'react';
import { IntentPill } from '@/components/golf/coachhelm/v3/IntentPill';
import { IntentDrawer } from '@/components/golf/coachhelm/v3/IntentDrawer';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';

interface RosterIntentControlProps {
  playerId: string;
  playerName: string;
  /** The coach's existing intent row for this player, or null if unset. */
  current: CoachPlayerIntent | null;
}

export function RosterIntentControl({ playerId, playerName, current }: RosterIntentControlProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IntentPill
        narrative_goal={current?.narrative_goal ?? null}
        size="md"
        onClick={() => setOpen(true)}
        ariaLabel={
          current
            ? `Edit intent for ${playerName} (currently ${current.narrative_goal})`
            : `Set intent for ${playerName}`
        }
      />
      <IntentDrawer
        open={open}
        onClose={() => setOpen(false)}
        player_id={playerId}
        player_name={playerName}
        current={current}
      />
    </>
  );
}
