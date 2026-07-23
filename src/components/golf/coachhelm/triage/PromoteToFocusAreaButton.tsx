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
 * PREFILLED FocusAreaModal, not a silent one-click create: a single click
 * used to fire `createFocusAreaFromInsight` directly with zero coach input
 * (bare title/claim, a server-guessed category, no metric) — a different,
 * lower-fidelity shape than every other create-focus-area surface in the
 * app. Now it opens the SAME `FocusAreaModal` PlayersGridView and
 * DevelopmentDrill use, pre-filled from the signal (player, best-effort
 * category, title, claim, and — when the guessed category has one — the
 * first catalog metric with the player's real current value autofilled), so
 * the coach confirms or edits before the write happens. The fast path is
 * preserved: every field the modal requires (`player_id`, `title`) is
 * already valid on open, so a single "Prescribe focus area" click still
 * completes the flow in one step.
 *
 * Still calls `createFocusAreaFromInsight` (NOT the v2/camelCase sibling) so
 * the effectiveness-ledger side effects — acknowledging the source insight +
 * `recordInsightAction({ action_type: 'create_focus' })` — fire exactly as
 * before. The coach's (possibly edited) category is threaded through via the
 * action's optional `area_type` override so what the coach sees in the modal
 * is what actually saves, instead of being silently discarded in favor of
 * the server's own insight_type-derived guess.
 *
 * When the source insight carries attached drills, the modal itself renders
 * a compact read-only "Practice Rx" preview (via `sourceInsightId`) — see
 * FocusAreaModal.tsx. Purely informational; no new write path here.
 *
 * Reports success via `onPromoted` — the caller (TriageDesk) removes the
 * signal from the queue and jumps to the Players view IN PLACE
 * (`?view=players`), never the old `/golf/dashboard/development` route (a
 * permanentRedirect shim that just bounces back here — see the Task 9
 * diagnosis).
 * ========================================================================== */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/fairway';
import {
  FocusAreaModal,
  type FocusAreaModalSubmit,
} from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import {
  metricsForArea,
  readMetricValue,
  suggestTarget,
  type AreaAutoFillStats,
} from '@/lib/coachhelm/focus-areas/catalog';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';

export interface PromoteToFocusAreaButtonProps {
  signal: GroupedSignal;
  coachId: string;
  onPromoted: () => void;
  /** The signal's player display name — feeds the modal's (single-option)
   *  Player field. Falls back to a neutral label when the caller doesn't
   *  have it resolved yet. */
  playerName?: string | null;
  /** This player's cached stats — feeds the modal's metric autofill (current
   *  value + suggested target). Absent stats degrade to the modal's own
   *  honest "no rounds yet" empty state, never a fabricated number. */
  playerStats?: AreaAutoFillStats | null;
}

/**
 * Best-effort category → area_type guess for the prefill only — mirrors the
 * `mapInsightCategoryToAreaType` switch already duplicated in
 * InsightCard.tsx / HubInsightSignalCard.tsx for the identical purpose. The
 * coach can always change the category before confirming; the actual create
 * call passes whatever the coach leaves selected through as an explicit
 * override (see `createFocusAreaFromInsight`'s `area_type` param), so a
 * wrong guess here is a UX nit, never a data-correctness issue.
 */
function guessAreaType(category: string): string {
  switch (category) {
    case 'putting':
      return 'putting';
    case 'tee':
      return 'driving';
    case 'approach':
      return 'iron_play';
    case 'short_game':
      return 'short_game';
    case 'scoring':
      return 'other';
    case 'pressure':
      return 'mental_game';
    case 'course_management':
      return 'mental_game';
    default:
      return 'other';
  }
}

export function PromoteToFocusAreaButton({
  signal,
  coachId,
  onPromoted,
  playerName,
  playerStats,
}: PromoteToFocusAreaButtonProps) {
  const [open, setOpen] = useState(false);

  if (signal.kind !== 'insight' || !signal.playerId) return null;
  const playerId = signal.playerId;

  const areaType = guessAreaType(signal.category);
  const firstMetric = metricsForArea(areaType)[0] ?? null;
  const currentValue = firstMetric ? readMetricValue(firstMetric, playerStats) : null;
  const targetValue = firstMetric ? suggestTarget(firstMetric, currentValue) : null;

  async function handleSubmit(payload: FocusAreaModalSubmit) {
    const res = await createFocusAreaFromInsight({
      insight_id: signal.id,
      player_id: payload.player_id,
      coach_id: coachId,
      title: payload.title,
      description: payload.description,
      insight_type: signal.category,
      area_type: payload.area_type,
      target_metric: payload.target_metric,
      current_value: payload.current_value,
      target_value: payload.target_value,
    });
    if (res.success) onPromoted();
    return { success: res.success, error: res.error };
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />}
        onClick={() => setOpen(true)}
      >
        Prescribe
      </Button>
      <FocusAreaModal
        open={open}
        onOpenChange={setOpen}
        mode="coach"
        players={[{ id: playerId, name: playerName || 'This player' }]}
        playerStats={{ [playerId]: playerStats ?? undefined }}
        playerId={playerId}
        sourceInsightId={signal.id}
        initial={{
          player_id: playerId,
          area_type: areaType,
          title: signal.title,
          description: signal.claim || '',
          target_metric: firstMetric?.key ?? '',
          current_value: currentValue,
          target_value: targetValue,
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}
