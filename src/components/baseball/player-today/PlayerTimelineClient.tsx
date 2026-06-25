'use client';

// =============================================================================
// src/components/baseball/player-today/PlayerTimelineClient.tsx
//
// Player-facing "My Timeline" client — the PLAYER half of the source -> signal
// -> action -> timeline -> OUTCOME loop that previously had no surface.
//
// The coach side (PlayerProfileClient → ProfileTimeline) already rendered a
// player's visibility-filtered timeline with an interactive acknowledgement
// toggle. This component gives the PLAYER the SAME mechanic for their OWN
// timeline: they see 'team' events + the 'player_only' coach notes meant for
// them, NEVER 'staff_only' rows (the getPlayerTimeline read model + RLS enforce
// this server-side; this component never decides access — it only renders +
// forwards the acknowledgement intent).
//
// Acknowledging is the OUTCOME step: a player marking a coach note / milestone
// "seen" closes the loop the coach opened. We reuse the exact optimistic ack
// pattern from PlayerTodayClient (seed from the server map, overlay local
// intent, revert on failure, disable mid-flight, router.refresh() to reconcile,
// toast on success/failure) so behavior and coach–player parity are consistent.
//
// Server actions (acknowledgeTimelineEvent / withdrawTimelineAcknowledgement)
// run inside withBaseballAction — capability/self enforcement is server-side;
// this client cannot assert it.
// =============================================================================

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  acknowledgeTimelineEvent,
  withdrawTimelineAcknowledgement,
} from '@/app/baseball/actions/timeline-acks';
import { ProfileTimeline } from '@/components/baseball/player-profile/ProfileTimeline';
import { useToast } from '@/components/ui/sonner';
import type { PlayerTimelineReadModel } from '@/lib/baseball/read-models/timeline';

export interface PlayerTimelineClientProps {
  /** The viewer-filtered read model (already player-scoped + visibility-gated). */
  model: PlayerTimelineReadModel;
  /** Server-resolved map of which events the player has already acknowledged. */
  initialAcks: Record<string, boolean>;
}

export function PlayerTimelineClient({ model, initialAcks }: PlayerTimelineClientProps) {
  // ── Acknowledgement (OUTCOME step) ──────────────────────────────────────────
  // Optimistic, self-scoped. Seed from the server map; overlay local intent so
  // the chip flips instantly; revert on a typed/thrown failure. pendingAckIds
  // disables the chip mid-flight so a double-tap can't double-fire.
  // router.refresh() reconciles the server cache after each mutation so a
  // subsequent navigation reflects the stored state (same pattern as
  // PlayerTodayClient — coach-player parity on the acknowledgement mechanic).
  const router = useRouter();
  const { addToast } = useToast();
  const [, startAckTransition] = useTransition();
  const [ackOverrides, setAckOverrides] = useState<Record<string, boolean>>({});
  const [pendingAckIds, setPendingAckIds] = useState<Set<string>>(() => new Set());

  const mergedAcks = useMemo(
    () => ({ ...initialAcks, ...ackOverrides }),
    [initialAcks, ackOverrides],
  );

  const handleToggleAck = useCallback(
    (eventId: string, next: boolean) => {
      setAckOverrides((prev) => ({ ...prev, [eventId]: next }));
      setPendingAckIds((prev) => {
        const n = new Set(prev);
        n.add(eventId);
        return n;
      });

      startAckTransition(async () => {
        const clearPending = () =>
          setPendingAckIds((prev) => {
            const n = new Set(prev);
            n.delete(eventId);
            return n;
          });
        try {
          const res = next
            ? await acknowledgeTimelineEvent(eventId)
            : await withdrawTimelineAcknowledgement(eventId);
          if (res?.success) {
            addToast({
              type: 'success',
              title: next ? 'Acknowledged' : 'Acknowledgement withdrawn',
            });
            // Reconcile the now-invalidated server cache so a subsequent
            // navigation (or back-button) reflects the persisted state.
            router.refresh();
          } else {
            setAckOverrides((prev) => ({ ...prev, [eventId]: !next }));
            addToast({
              type: 'error',
              title: 'Could not update',
              description: res?.error ?? 'Please try again.',
            });
          }
        } catch {
          setAckOverrides((prev) => ({ ...prev, [eventId]: !next }));
          addToast({
            type: 'error',
            title: 'Could not update',
            description: 'Please try again.',
          });
        } finally {
          clearPending();
        }
      });
    },
    [startAckTransition, addToast, router],
  );

  return (
    <ProfileTimeline
      events={model.events}
      viewerRole="player"
      hiddenCount={model.hiddenCount}
      error={model.error}
      acknowledged={mergedAcks}
      onToggleAck={handleToggleAck}
      pendingAckIds={pendingAckIds}
    />
  );
}

export default PlayerTimelineClient;
