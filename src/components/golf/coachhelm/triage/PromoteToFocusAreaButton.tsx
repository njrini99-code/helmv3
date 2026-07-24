'use client';

/**
 * ============================================================================
 * PromoteToFocusAreaButton — the dossier's "Prescribe" action (Triage Desk
 * spec §3)
 * ----------------------------------------------------------------------------
 * `golf_player_focus_areas` only has a `from_insight_id` link column (no
 * `from_pattern_id`, no team-level/playerId-null focus areas) — so this only
 * ever renders for an `insight`-kind signal attributed to a single player.
 * Pattern-kind and team-level signals get no Prescribe action; that is an
 * honest capability gap, not a bug to paper over with a disabled button that
 * explains nothing.
 *
 * Calls `createFocusAreaFromInsight` directly and reports success via
 * `onPromoted` — the caller (TriageDesk) removes the signal from the queue
 * and jumps to the Players view IN PLACE (`?view=players`), never the old
 * `/golf/dashboard/development` route (a permanentRedirect shim that just
 * bounces back here — see the Task 9 diagnosis).
 * ========================================================================== */

import { useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, fairwayToast } from '@/components/fairway';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';

export interface PromoteToFocusAreaButtonProps {
  signal: GroupedSignal;
  coachId: string;
  onPromoted: () => void;
}

export function PromoteToFocusAreaButton({ signal, coachId, onPromoted }: PromoteToFocusAreaButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (signal.kind !== 'insight' || !signal.playerId) return null;
  const playerId = signal.playerId;

  const handleClick = () => {
    startTransition(async () => {
      try {
        const res = await createFocusAreaFromInsight({
          insight_id: signal.id,
          player_id: playerId,
          coach_id: coachId,
          title: signal.title,
          description: signal.claim || null,
          insight_type: signal.category,
        });
        if (res.success) {
          fairwayToast.success('Prescription sent for player approval.');
          onPromoted();
        } else {
          fairwayToast.error(res.error ?? 'Could not create the focus area. Try again.');
        }
      } catch {
        fairwayToast.error('Could not create the focus area. Try again.');
      }
    });
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      busy={isPending}
      leftIcon={<Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />}
      onClick={handleClick}
    >
      Prescribe
    </Button>
  );
}
