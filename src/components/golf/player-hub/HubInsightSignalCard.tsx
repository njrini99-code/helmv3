'use client';

/**
 * HubInsightSignalCard — the single high-impact insight rendered on the
 * player home screen. The "engagement multiplier" that turns 100% of daily
 * home visits into engine-aware visits.
 *
 * Design contract:
 *   docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 *
 * Behavior:
 *   - If `insight` is null → renders nothing. Home stays clean.
 *   - If present → renders a fairway-native `default`-density signal card
 *     under a section eyebrow ("From your CoachHelm").
 *   - A small "Dismiss for today" affordance sets `hub_signal_dismissed_{YYYY-MM-DD}`
 *     in localStorage. The flag resets at midnight.
 *
 * Wave 3 token port (player home premium pass): the legacy chrome here was
 * `@/components/golf/coachhelm/insight-card/InsightCard` — a pre-fairway
 * component still painting `bg-cream-100/55` / `border-warm-200/40` /
 * `text-warm-700` glass, the one visible material seam on an otherwise
 * all-fairway page. That primitive is shared by several OTHER surfaces
 * (Insights workspace, round-review Fingerprint hero, the coach/player
 * Insights feed) outside this packet's ownership, so porting it in place
 * would touch pages this wave doesn't own. Lower-risk fix: render this ONE
 * slot on the fairway `InsightCard` primitive (`@/components/fairway`,
 * `variant="default"`) directly, mapping the same `EvidenceInsight` row onto
 * it — no shared file touched, this page's card now reads as fairway
 * end-to-end. `DrillChips` / `DrillSheet` (the interaction the mission calls
 * out as must-keep-working) are reused UNCHANGED via the insight-card barrel;
 * `WhyPopover` / `MovementPill` are intentionally NOT embedded here (both
 * paint legacy warm/amber chrome) — replaced with a plain evidence readout +
 * the fairway `TrendChip` for the same "movement" signal, both token-native.
 *
 * Ownership: wired to `getTopInsightForPlayer(playerId)` server-side via the
 * parent (`page.tsx`). This component receives the already-fetched insight so
 * it can stay purely presentational + handle the client-only dismiss state.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { InsightCard as FairwayInsightCard } from '@/components/fairway/cards-insight/InsightCard';
import { Button } from '@/components/fairway/controls/button';
import { TrendChip } from '@/components/fairway/charts/TrendChip';
import {
  DrillChips,
  isImprovement,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import { ResolutionCelebration } from '@/components/golf/coachhelm/insight-card/ResolutionCelebration';
import {
  FocusAreaModal,
  type FocusAreaModalSubmit,
} from '@/components/fairway/pages/coachhelm/FocusAreaModal';
import { createFocusAreaFromInsightV2 } from '@/app/golf/actions/development';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightMovement } from '@/lib/coachhelm/v2/insights/types';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { IconSparkles, IconCheck, IconHelp, IconX, IconTarget } from '@/components/icons';
import { useToast } from '@/components/ui/sonner';

export interface HubInsightSignalCardProps {
  insight: EvidenceInsight | null;
}

/** Format a local (not UTC) YYYY-MM-DD key so a player who dismisses at 11pm
 *  local time doesn't see the card come back at midnight UTC. */
function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `hub_signal_dismissed_${y}-${m}-${d}`;
}

/** Removes any `hub_signal_dismissed_*` keys that aren't for today. Keeps
 *  localStorage tidy so old keys don't accumulate across weeks of use. */
function pruneStaleDismissKeys(currentKey: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('hub_signal_dismissed_') && key !== currentKey) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable (private mode, quota exceeded) — safe to skip.
  }
}

/**
 * Light 2nd-person rewrite, mirroring the legacy InsightCard's private
 * `rewriteForPlayer` (not exported from that file — this primitive renders
 * its own card shell now, so it keeps its own copy of the same simple regex
 * chain rather than reaching into that file's internals). The generators
 * usually author in a neutral voice with "the player" / "they" — soft-swap
 * those to "you / your" so the card reads like a direct note.
 */
function rewriteForPlayer(text: string): string {
  if (!text) return '';
  return text
    .replace(/\bthe player's\b/gi, 'your')
    .replace(/\bthe player\b/gi, 'you')
    .replace(/\bthey are\b/gi, "you're")
    .replace(/\bthey're\b/gi, "you're")
    .replace(/\btheir\b/gi, 'your')
    .replace(/\bthey\b/gi, 'you');
}

/** Same zero-leverage guard the legacy card used: a composite / non-standing
 *  row's `strokes_impact` backfill can legitimately be exactly 0 — showing
 *  "~0.0 strokes" under an otherwise real insight reads as noise. */
function hasDisplayableImpact(strokesImpact: number | null | undefined): boolean {
  const impact = Math.abs(Number(strokesImpact ?? 0));
  return Number.isFinite(impact) && Math.round(impact * 10) > 0;
}

/** Mirrors MovementPill's own magnitude formatter (not exported from that
 *  file — see the module doc above for why this card doesn't import it). */
function formatMovementMagnitude(fraction: number): string | null {
  const pct = Math.abs(Number(fraction) || 0);
  if (pct <= 0) return null;
  if (pct >= 1) return `${(pct + 1).toFixed(1)}x`;
  return `${Math.round(pct * 100)}%`;
}

type DerivedPriority = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Priority tier for the fairway card — mirrors the legacy `deriveTone`
 *  severity ordering (urgent > cautionary > encouraging > neutral), folding
 *  the resolved/celebratory case into `medium` (the fairway primitive has no
 *  distinct celebratory tier; `ResolutionCelebration`'s own header covers that
 *  framing instead). */
function priorityFor(insight: EvidenceInsight): DerivedPriority {
  if (insight.lifecycle_state === 'resolved') return 'medium';
  if (insight.priority === 'urgent') return 'critical';
  const evidence = insight.evidence;
  const strokesImpact = Math.abs(Number(evidence?.strokes_impact ?? 0));
  const confidence = Number(evidence?.confidence ?? 0);
  if (insight.category === 'pressure' && strokesImpact > 2) return 'critical';
  if (insight.priority === 'high') return 'high';
  if (strokesImpact * confidence > 1.0) return 'high';
  return 'info';
}

/**
 * Promote-to-focus-area — the shared FocusAreaModal (fixed player, mode=
 * 'player' — this card only ever renders on the player's own home). Replaces
 * the retired vaul-Drawer `PromoteToFocusAreaButton`; still calls
 * `createFocusAreaFromInsightV2` so the same active-immediately status branch
 * + `recordInsightAction` ledger side effect inside that action keep firing
 * exactly as before.
 */
function PromoteFocusAreaAction({ insight }: { insight: EvidenceInsight }) {
  const [open, setOpen] = useState(false);
  const areaType = mapInsightCategoryToAreaType(insight.category);

  async function handleSubmit(
    payload: FocusAreaModalSubmit,
  ): Promise<{ success: boolean; error?: string }> {
    const res = await createFocusAreaFromInsightV2({
      playerId: payload.player_id,
      insightId: insight.id,
      title: payload.title,
      description: payload.description ?? '',
      areaType: payload.area_type,
      targetMetric: payload.target_metric ?? undefined,
      targetValue: payload.target_value ?? undefined,
    });
    return { success: res.success, error: res.error };
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        data-testid="action-create-focus-area"
        leftIcon={<IconTarget size={13} />}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Add to focus areas
      </Button>
      <FocusAreaModal
        open={open}
        onOpenChange={setOpen}
        mode="player"
        players={[{ id: insight.player_id, name: 'This player' }]}
        playerStats={{}}
        playerId={insight.player_id}
        sourceInsightId={insight.id}
        initial={{
          player_id: insight.player_id,
          area_type: areaType,
          title: insight.title,
          description: insight.content,
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}

export function HubInsightSignalCard({ insight }: HubInsightSignalCardProps) {
  const router = useRouter();
  const [dismissedToday, setDismissedToday] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  const [helpfulPending, startHelpful] = useTransition();
  const [ackPending, startAck] = useTransition();
  const [dismissPending, startDismiss] = useTransition();
  const { addToast } = useToast();

  // Hydrate dismiss state from localStorage. `dismissedToday === null` on the
  // first render prevents a flash of the card before we know if the player has
  // already dismissed it today.
  useEffect(() => {
    try {
      const key = todayKey();
      pruneStaleDismissKeys(key);
      setDismissedToday(localStorage.getItem(key) === '1');
    } catch {
      setDismissedToday(false);
    }
  }, []);

  const handleDismissForToday = useCallback(() => {
    try {
      localStorage.setItem(todayKey(), '1');
    } catch {
      // Non-fatal — card still hides for this session.
    }
    setHidden(true);
  }, []);

  const handleAction = useCallback(
    async (action: InsightAction, insightId: string) => {
      switch (action) {
        case 'rate_helpful':
        case 'rate_not_helpful':
        case 'acknowledged':
        case 'dismissed': {
          const rating =
            action === 'rate_helpful'
              ? 'helpful'
              : action === 'rate_not_helpful'
                ? 'not_helpful'
                : action === 'acknowledged'
                  ? 'acknowledged'
                  : 'dismissed';
          try {
            await rateInsightAsPlayer({ insightId, rating });
          } catch (err) {
            // Server-side action logs via logServerError already. Toast
            // instead of swallowing so the player knows the rating didn't
            // save — and leave the card visible rather than hiding it on a
            // failed dismiss.
            addToast({
              type: 'error',
              title: 'Could not save feedback',
              description:
                err instanceof Error ? err.message : 'Please try again in a moment.',
            });
            return;
          }
          if (action === 'dismissed') {
            setHidden(true);
          }
          startTransition(() => {
            router.refresh();
          });
          return;
        }
        case 'open_details':
          router.push(`/golf/dashboard/coachhelm?focus=${insightId}`);
          return;
        case 'view_drill':
        case 'create_focus_area':
          // view_drill is handled inside DrillChips' bottom sheet; create_focus_area
          // is a coach-only action — no-op here.
          return;
      }
    },
    [router, addToast],
  );

  const fire = useCallback(
    (action: InsightAction, startFn: (cb: () => void) => void, insightId: string) => {
      startFn(() => {
        void Promise.resolve(handleAction(action, insightId));
      });
    },
    [handleAction],
  );

  const movement = (insight?.metadata?.movement ?? null) as InsightMovement | null;
  const movementChip = useMemo(() => {
    if (!insight || !movement) return null;
    const improving = isImprovement(movement.direction, insight.evidence.metric);
    const pctLabel = formatMovementMagnitude(Number(movement.percent_change ?? 0));
    const delta = Math.abs(Number(movement.to ?? 0) - Number(movement.from ?? 0));
    return {
      direction: improving ? ('improving' as const) : ('declining' as const),
      magnitude: pctLabel ?? `${delta.toFixed(1)}pt`,
    };
  }, [insight, movement]);

  if (!insight) return null;
  if (hidden) return null;
  // Suppress until we've hydrated the dismiss state to avoid a flash.
  if (dismissedToday === null) return null;
  if (dismissedToday) return null;

  const title = rewriteForPlayer(insight.title);
  const content = rewriteForPlayer(insight.content);
  const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));
  const showImpact = hasDisplayableImpact(insight.evidence.strokes_impact);
  const hasDrills = Boolean(insight.drills && insight.drills.length > 0);
  const promotable = insight.lifecycle_state !== 'resolved' && insight.status !== 'resolved';

  const cardNode = (
    <FairwayInsightCard
      variant="default"
      priority={priorityFor(insight)}
      title={title}
      overline={insight.resolved_at ? 'Resolved' : undefined}
      interactive
      openLabel={`Open details for "${insight.title}"`}
      onClick={() => router.push(`/golf/dashboard/coachhelm?focus=${insight.id}`)}
      data-testid="insight-card-default"
      evidence={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span>
            <span className="font-fw-mono font-medium tabular-nums text-text-primary">
              {insight.evidence.your_value_display}
            </span>
            <span className="text-text-tertiary"> vs {insight.evidence.comparison_label}</span>
          </span>
          {movementChip ? (
            <span className="inline-flex items-center gap-1.5">
              <TrendChip direction={movementChip.direction} size="sm" />
              <span className="text-eyebrow text-text-tertiary">
                {movementChip.magnitude} since last check
              </span>
            </span>
          ) : null}
          {showImpact ? (
            <span className="font-fw-mono tabular-nums text-text-tertiary">
              ~{impact.toFixed(1)} strokes/round
            </span>
          ) : null}
        </div>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={helpfulPending}
            data-testid="action-rate-helpful"
            leftIcon={<IconHelp size={13} />}
            onClick={(e) => {
              e.stopPropagation();
              fire('rate_helpful', startHelpful, insight.id);
            }}
          >
            Helpful
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={ackPending}
            data-testid="action-acknowledged"
            leftIcon={<IconCheck size={13} />}
            onClick={(e) => {
              e.stopPropagation();
              fire('acknowledged', startAck, insight.id);
            }}
          >
            Got it
          </Button>
          {promotable ? <PromoteFocusAreaAction insight={insight} /> : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={dismissPending}
            data-testid="action-dismissed"
            leftIcon={<IconX size={13} />}
            onClick={(e) => {
              e.stopPropagation();
              fire('dismissed', startDismiss, insight.id);
            }}
          >
            Dismiss
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p>{content}</p>
        {/* DrillChips renders its own interactive chip buttons (opening
            DrillSheet) — the fairway card's `children` slot sits inside the
            open-detail overlay's click-through zone (`pointer-events-none`
            on the parent), so this needs its own `pointer-events-auto` +
            `z-20` override to stay clickable, mirroring how the card's own
            `actions` row does the same for its buttons. Without this the
            drill chips would render but silently swallow every tap. */}
        {hasDrills && insight.drills ? (
          <div className="relative z-20 pointer-events-auto">
            <DrillChips
              insightId={insight.id}
              drills={insight.drills}
              insight={{ title: insight.title, category: insight.category }}
            />
          </div>
        ) : null}
      </div>
    </FairwayInsightCard>
  );

  return (
    <section
      data-testid="hub-insight-signal-card"
      aria-label="Top insight from your CoachHelm"
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconSparkles size={14} className="text-accent-600" aria-hidden />
          <h2 className="text-eyebrow font-medium text-text-tertiary uppercase tracking-[0.12em] border-b border-border-subtle pb-0.5">
            From your CoachHelm
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleDismissForToday}
          data-testid="hub-insight-dismiss-today"
          className="text-caption font-medium text-text-tertiary hover:text-text-primary"
        >
          Dismiss for today
        </Button>
      </div>

      {insight.lifecycle_state === 'resolved' ? (
        <ResolutionCelebration insight={insight}>{cardNode}</ResolutionCelebration>
      ) : (
        cardNode
      )}
    </section>
  );
}

/**
 * Maps an `EvidenceInsight.category` to the focus-area type vocabulary the
 * development.ts action expects. Mirrors the legacy InsightCard's private
 * helper (kept local for the same reason as `rewriteForPlayer` above).
 */
function mapInsightCategoryToAreaType(category: EvidenceInsight['category']): string {
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
