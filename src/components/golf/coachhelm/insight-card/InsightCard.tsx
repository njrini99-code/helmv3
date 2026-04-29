'use client';

/**
 * InsightCard — the ONE primitive replacing AIInsightsPanel, InsightCard
 * (coach), AlertCard, and the V2* round-review boxes. Three densities
 * (`compact` / `default` / `hero`) × two audiences (`player` / `coach`).
 *
 * Contract: docs/superpowers/plans/2026-04-22-insight-delivery/00-design-contract.md
 *
 * Key architectural choices:
 *   - Tone is derived (not passed in) via `deriveTone(insight)`. Keeps the
 *     API small and ensures the five visual tones stay in lockstep with the
 *     lifecycle / priority / impact fields.
 *   - Drills render INLINE on collapsed default + hero (Rule 3). Not behind
 *     an expand. Two clicks deep is the old pattern — this primitive is one.
 *   - `audience='player'` uses 2nd-person + Helpful/Got It/Dismiss; coach
 *     switches to 3rd-person + Acknowledge/Dismiss/Create Focus Area.
 *   - Motion is LazyMotion-friendly (`m.*` not `motion.*`) — the app already
 *     mounts `<LazyMotion>` at the shell layer.
 */
import { forwardRef, useState, useTransition } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconChevronDown,
  IconCheck,
  IconX,
  IconWarning,
  IconInfo,
  IconTrophy,
  IconHelp,
} from '@/components/icons';
import { EvidencePanel } from '@/components/golf/coachhelm/insights/EvidencePanel';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { deriveTone, type DerivedTone } from './tone-derivation';
import { MovementPill } from './MovementPill';
import { WhyPopover } from './WhyPopover';
import { DrillChips } from './DrillChips';
import { ResolutionCelebration } from './ResolutionCelebration';
import { PromoteToFocusAreaButton } from '../PromoteToFocusAreaButton';

export type InsightAction =
  | 'rate_helpful'
  | 'rate_not_helpful'
  | 'acknowledged'
  | 'dismissed'
  | 'create_focus_area'
  | 'view_drill'
  | 'open_details';

export interface InsightCardProps {
  insight: EvidenceInsight;
  density?: 'compact' | 'default' | 'hero';
  audience: 'player' | 'coach';
  /** When false, hides inline drill chips. Default true. */
  showDrills?: boolean;
  /** When false, hides action buttons. Defaults to `true` for player audience. */
  showActions?: boolean;
  onAction?: (action: InsightAction, insightId: string) => Promise<void> | void;
  onClick?: (insightId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared tone visual config. Key off `DerivedTone`.
// ---------------------------------------------------------------------------

interface ToneConfig {
  icon: typeof IconSparkles;
  bgClass: string;
  borderClass: string;
  iconColor: string;
  accentBar: string;
  pulse: boolean;
}

// ---------------------------------------------------------------------------
// Outcome badge — surfaces the strokes-saved-per-round result once the
// nightly outcome backfill writer has marked an insight as improved /
// no_change / worsened. NOTE: `outcome_status` and `outcome_measured_at`
// live on the `golf_coach_insights` row but are NOT yet projected by
// `INSIGHT_SELECT` in `src/app/golf/actions/insight-delivery.ts`. The action
// needs to add `outcome_status, outcome_measured_at` to the select clause
// (and to `EvidenceInsight`) for this badge to light up. Until then the
// helper short-circuits and the badge silently no-ops, which is the
// expected default for the typical "no outcome yet" case anyway.
type OutcomeStatus = 'improved' | 'no_change' | 'worsened';

interface InsightOutcomeFields {
  outcome_status?: OutcomeStatus | string | null;
}

function readOutcomeStatus(insight: EvidenceInsight): OutcomeStatus | null {
  const status = (insight as EvidenceInsight & InsightOutcomeFields).outcome_status;
  if (status === 'improved' || status === 'no_change' || status === 'worsened') {
    return status;
  }
  return null;
}

interface OutcomeBadgeProps {
  insight: EvidenceInsight;
  className?: string;
}

function OutcomeBadge({ insight, className }: OutcomeBadgeProps) {
  const status = readOutcomeStatus(insight);
  if (!status) return null;

  // The card already uses `evidence.strokes_impact` everywhere as the
  // estimated stroke-per-round magnitude, so we reuse it here. (When the
  // action eventually exposes a separate `stroke_impact` column we can
  // prefer that — both represent the same quantity.)
  const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));
  const hasMeaningfulImpact = Number.isFinite(impact) && impact > 0;

  if (status === 'improved' && hasMeaningfulImpact) {
    return (
      <span
        data-testid="insight-outcome-badge"
        data-outcome="improved"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
          'bg-primary-100 text-primary-700 border border-primary-200/70',
          'text-[10px] font-medium tabular-nums',
          className,
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          width={10}
          height={10}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8l3-4 3 4" />
        </svg>
        Saved {impact.toFixed(1)} strokes/rd
      </span>
    );
  }

  if (status === 'worsened') {
    return (
      <span
        data-testid="insight-outcome-badge"
        data-outcome="worsened"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
          'bg-amber-50 text-amber-700 border border-amber-200/70',
          'text-[10px] font-medium',
          className,
        )}
      >
        Outcome regressed
      </span>
    );
  }

  // status === 'no_change' is intentionally omitted — too noisy on the feed.
  return null;
}

const TONE_CONFIG: Record<DerivedTone, ToneConfig> = {
  encouraging: {
    icon: IconTrophy,
    bgClass: 'bg-primary-50/70',
    borderClass: 'border-primary-200/60',
    iconColor: 'text-primary-600',
    accentBar: 'bg-primary-500',
    pulse: false,
  },
  neutral: {
    icon: IconInfo,
    bgClass: 'bg-warm-50/70',
    borderClass: 'border-warm-200/60',
    iconColor: 'text-warm-600',
    accentBar: 'bg-warm-400',
    pulse: false,
  },
  cautionary: {
    icon: IconWarning,
    bgClass: 'bg-amber-50/70',
    borderClass: 'border-amber-200/60',
    iconColor: 'text-amber-600',
    accentBar: 'bg-amber-500',
    pulse: false,
  },
  urgent: {
    icon: IconWarning,
    bgClass: 'bg-red-50/70',
    borderClass: 'border-red-200/60',
    iconColor: 'text-red-600',
    accentBar: 'bg-red-500',
    pulse: true,
  },
  celebratory: {
    icon: IconSparkles,
    bgClass: 'bg-purple-50/70',
    borderClass: 'border-purple-200/60',
    iconColor: 'text-purple-600',
    accentBar: 'bg-purple-500',
    pulse: false,
  },
};

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export const InsightCard = forwardRef<HTMLDivElement, InsightCardProps>(function InsightCard(
  {
    insight,
    density = 'default',
    audience,
    showDrills = true,
    showActions,
    onAction,
    onClick,
    className,
  },
  ref,
) {
  const tone = deriveTone(insight);
  const config = TONE_CONFIG[tone];
  const effectiveShowActions = showActions ?? audience === 'player';
  const hasActions = effectiveShowActions && !!onAction;

  if (density === 'compact') {
    // Compact renders a <button>, so we intentionally drop the forwarded ref
    // here — the primitive's public forwardRef is typed as HTMLDivElement to
    // serve the default + hero (GlassCard-based) surfaces. Compact callers
    // rarely need a ref; if they do, they can render their own wrapper.
    return (
      <CompactInsightRow
        insight={insight}
        tone={tone}
        config={config}
        onClick={onClick}
        className={className}
      />
    );
  }

  const cardNode =
    density === 'hero' ? (
      <HeroInsightCardInner
        ref={ref}
        insight={insight}
        tone={tone}
        config={config}
        audience={audience}
        showDrills={showDrills}
        hasActions={hasActions}
        onAction={onAction}
        onClick={onClick}
        className={className}
      />
    ) : (
      <DefaultInsightCard
        ref={ref}
        insight={insight}
        tone={tone}
        config={config}
        audience={audience}
        showDrills={showDrills}
        hasActions={hasActions}
        onAction={onAction}
        onClick={onClick}
        className={className}
      />
    );

  // Resolved + player surfaces get the celebration wrapper (Rule 7 + Rule 10).
  // Confetti only fires on first view — the wrapper reads
  // `metadata.celebration_shown_at` to gate it.
  if (insight.lifecycle_state === 'resolved' && audience === 'player') {
    return <ResolutionCelebration insight={insight}>{cardNode}</ResolutionCelebration>;
  }

  return cardNode;
});

// ---------------------------------------------------------------------------
// Compact density — single-row list item
// ---------------------------------------------------------------------------

interface CompactInsightRowProps {
  insight: EvidenceInsight;
  tone: DerivedTone;
  config: ToneConfig;
  onClick?: (insightId: string) => void;
  className?: string;
}

const CompactInsightRow = forwardRef<HTMLButtonElement, CompactInsightRowProps>(
  function CompactInsightRow({ insight, tone, config, onClick, className }, ref) {
    const Icon = config.icon;
    const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));

    return (
      <button
        ref={ref}
        type="button"
        data-testid="insight-card-compact"
        data-tone={tone}
        onClick={() => onClick?.(insight.id)}
        className={cn(
          'group w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left',
          'border transition-colors',
          config.bgClass,
          config.borderClass,
          'hover:bg-cream-100/82',
          className,
        )}
      >
        <div className={cn('w-7 h-7 rounded-lg bg-cream-100/82 flex items-center justify-center flex-shrink-0', config.iconColor)}>
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warm-900 truncate">{insight.title}</p>
          <p className="text-xs text-warm-500 truncate">
            {insight.evidence.your_value_display || insight.evidence.metric_label}
            {' · '}
            <span className="tabular-nums">~{impact.toFixed(1)} strokes</span>
          </p>
        </div>
        <IconChevronDown size={16} className="text-warm-400 -rotate-90 flex-shrink-0" aria-hidden />
      </button>
    );
  },
);

// ---------------------------------------------------------------------------
// Default density — standard feed card with collapsible expand
// ---------------------------------------------------------------------------

interface CardInnerProps {
  insight: EvidenceInsight;
  tone: DerivedTone;
  config: ToneConfig;
  audience: 'player' | 'coach';
  showDrills: boolean;
  hasActions: boolean;
  onAction?: (action: InsightAction, insightId: string) => Promise<void> | void;
  onClick?: (insightId: string) => void;
  className?: string;
}

const DefaultInsightCard = forwardRef<HTMLDivElement, CardInnerProps>(
  function DefaultInsightCard(
    { insight, tone, config, audience, showDrills, hasActions, onAction, onClick, className },
    ref,
  ) {
    const [expanded, setExpanded] = useState(false);
    const Icon = config.icon;
    const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));
    const title = formatTitle(insight, audience);
    const content = formatContent(insight, audience);
    const hasDrills = Boolean(showDrills && insight.drills && insight.drills.length > 0);

    return (
      <GlassCard
        ref={ref}
        variant="primary"
        padding="none"
        hover={false}
        className={cn(
          'relative overflow-hidden',
          config.bgClass,
          config.borderClass,
          'border',
          className,
        )}
        data-testid="insight-card-default"
        data-tone={tone}
      >
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', config.accentBar)} />
        {config.pulse && (
          <span
            className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 animate-pulse"
            aria-hidden
          />
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-lg bg-cream-100/82 shadow-sm flex items-center justify-center flex-shrink-0',
                config.iconColor,
              )}
            >
              <Icon size={18} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className="font-semibold text-warm-900 text-sm cursor-pointer hover:text-primary-700 transition-colors"
                  onClick={() => onClick?.(insight.id)}
                >
                  {title}
                </h4>
                <WhyPopover insight={insight} />
              </div>

              <p className="text-xs text-warm-600 mt-1 line-clamp-2">{content}</p>

              <MovementPill insight={insight} className="mt-2" />

              <EvidencePanel evidence={insight.evidence} compact />

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-warm-400 tabular-nums">
                  ~{impact.toFixed(1)} strokes/round
                </span>
                {insight.resolved_at && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">
                    Resolved
                  </span>
                )}
                <OutcomeBadge insight={insight} />
              </div>
            </div>

            <button
              type="button"
              aria-label={expanded ? 'Collapse insight' : 'Expand insight'}
              onClick={() => setExpanded((s) => !s)}
              className="flex-shrink-0 p-1 text-warm-400 hover:text-warm-700 transition-colors"
            >
              <m.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="block">
                <IconChevronDown size={18} />
              </m.span>
            </button>
          </div>

          {/* Drill chips inline on collapsed default (Rule 3). */}
          {hasDrills && insight.drills && (
            <div className="mt-3">
              <DrillChips
                insightId={insight.id}
                drills={insight.drills}
                insight={{ title: insight.title, category: insight.category }}
              />
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <m.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-warm-200/55">
                <div className="pt-3">
                  <EvidencePanel evidence={insight.evidence} compact={false} />
                </div>

                {hasActions && onAction && (
                  <InsightActions
                    insight={insight}
                    audience={audience}
                    onAction={onAction}
                  />
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </GlassCard>
    );
  },
);

// ---------------------------------------------------------------------------
// Hero density — large display-serif title, impact number, expanded evidence
// ---------------------------------------------------------------------------

const HeroInsightCardInner = forwardRef<HTMLDivElement, CardInnerProps>(
  function HeroInsightCardInner(
    { insight, tone, config, audience, showDrills, hasActions, onAction, onClick, className },
    ref,
  ) {
    const Icon = config.icon;
    const impact = Math.abs(Number(insight.evidence.strokes_impact ?? 0));
    const title = formatTitle(insight, audience);
    const content = formatContent(insight, audience);
    const hasDrills = Boolean(showDrills && insight.drills && insight.drills.length > 0);

    return (
      <GlassCard
        ref={ref}
        variant="primary"
        padding="none"
        hover={false}
        className={cn(
          'relative overflow-hidden',
          config.bgClass,
          config.borderClass,
          'border',
          className,
        )}
        data-testid="insight-card-hero"
        data-tone={tone}
        onClick={onClick ? () => onClick(insight.id) : undefined}
      >
        <div className={cn('absolute top-0 left-0 right-0 h-1', config.accentBar)} />
        {config.pulse && (
          <span
            className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"
            aria-hidden
          />
        )}

        <div className="p-6 md:p-8 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-11 h-11 rounded-xl bg-cream-50/92 shadow-sm flex items-center justify-center flex-shrink-0',
                  config.iconColor,
                )}
              >
                <Icon size={22} />
              </div>
              <WhyPopover insight={insight} />
            </div>

            <div className="text-right flex-shrink-0">
              <div
                data-testid="hero-strokes-impact"
                className="text-3xl md:text-4xl font-semibold text-warm-900 tabular-nums leading-none tracking-tight"
              >
                ~{impact.toFixed(1)}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-warm-500 mt-1">
                strokes/round
              </div>
            </div>
          </div>

          <div>
            <h2
              data-testid="hero-title"
              className="text-[22px] md:text-[24px] leading-tight font-semibold text-warm-900 tracking-tight"
            >
              {title}
            </h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <MovementPill insight={insight} />
              <OutcomeBadge insight={insight} />
            </div>
            <p className="mt-3 text-base text-warm-700 leading-relaxed">{content}</p>
          </div>

          <EvidencePanel evidence={insight.evidence} compact={false} />

          {hasDrills && insight.drills && (
            <div>
              <DrillChips
                insightId={insight.id}
                drills={insight.drills}
                insight={{ title: insight.title, category: insight.category }}
              />
            </div>
          )}

          {hasActions && onAction && (
            <div className="pt-2 border-t border-warm-200/55">
              <InsightActions
                insight={insight}
                audience={audience}
                onAction={onAction}
                emphasis
              />
            </div>
          )}
        </div>
      </GlassCard>
    );
  },
);

// ---------------------------------------------------------------------------
// Action row — shared between default + hero
// ---------------------------------------------------------------------------

interface InsightActionsProps {
  insight: EvidenceInsight;
  audience: 'player' | 'coach';
  onAction: (action: InsightAction, insightId: string) => Promise<void> | void;
  /** When true, renders the primary action button larger (hero density). */
  emphasis?: boolean;
}

function InsightActions({ insight, audience, onAction, emphasis = false }: InsightActionsProps) {
  const [helpfulPending, startHelpful] = useTransition();
  const [ackPending, startAck] = useTransition();
  const [dismissPending, startDismiss] = useTransition();
  const [focusPending, startFocus] = useTransition();

  const fire = (
    action: InsightAction,
    startFn: (cb: () => void) => void,
  ) => {
    startFn(() => {
      void Promise.resolve(onAction(action, insight.id));
    });
  };

  // The promote button renders its own bottom-sheet flow and calls
  // createFocusAreaFromInsight directly — independent of the parent's
  // onAction handler. We only suppress it for resolved insights (already
  // graduated to a focus area or done).
  const promotable =
    insight.lifecycle_state !== 'resolved' && insight.status !== 'resolved';

  return (
    <div className={cn('flex flex-wrap items-center gap-2 pt-3', emphasis && 'gap-3')}>
      {audience === 'player' ? (
        <>
          <button
            type="button"
            disabled={helpfulPending}
            data-testid="action-rate-helpful"
            onClick={(e) => {
              e.stopPropagation();
              fire('rate_helpful', startHelpful);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors',
              helpfulPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconHelp size={14} />
            Helpful
          </button>
          <button
            type="button"
            disabled={ackPending}
            data-testid="action-acknowledged"
            onClick={(e) => {
              e.stopPropagation();
              fire('acknowledged', startAck);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors',
              ackPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconCheck size={14} />
            Got it
          </button>
          {promotable && (
            <PromoteToFocusAreaButton
              source="insight"
              sourceId={insight.id}
              playerId={insight.player_id}
              suggestedTitle={insight.title}
              suggestedDescription={insight.content}
              suggestedAreaType={mapInsightCategoryToAreaType(insight.category)}
            />
          )}
          <button
            type="button"
            disabled={dismissPending}
            data-testid="action-dismissed"
            onClick={(e) => {
              e.stopPropagation();
              fire('dismissed', startDismiss);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
              'text-warm-500 hover:text-warm-700 hover:bg-cream-100/68 transition-colors',
              dismissPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconX size={14} />
            Dismiss
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={ackPending}
            data-testid="action-acknowledged"
            onClick={(e) => {
              e.stopPropagation();
              fire('acknowledged', startAck);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors',
              ackPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconCheck size={14} />
            Acknowledge
          </button>
          {promotable ? (
            <PromoteToFocusAreaButton
              source="insight"
              sourceId={insight.id}
              playerId={insight.player_id}
              suggestedTitle={insight.title}
              suggestedDescription={insight.content}
              suggestedAreaType={mapInsightCategoryToAreaType(insight.category)}
              className={emphasis ? 'px-4 py-2 text-sm' : undefined}
              label="Create focus area"
            />
          ) : (
            <button
              type="button"
              disabled={focusPending}
              data-testid="action-create-focus-area"
              onClick={(e) => {
                e.stopPropagation();
                fire('create_focus_area', startFocus);
              }}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                'bg-primary-500 text-white hover:bg-primary-600 transition-colors',
                focusPending && 'opacity-60 pointer-events-none',
                emphasis && 'px-4 py-2 text-sm',
              )}
            >
              Create focus area
            </button>
          )}
          <button
            type="button"
            disabled={dismissPending}
            data-testid="action-dismissed"
            onClick={(e) => {
              e.stopPropagation();
              fire('dismissed', startDismiss);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
              'text-warm-500 hover:text-warm-700 hover:bg-cream-100/68 transition-colors',
              dismissPending && 'opacity-60 pointer-events-none',
            )}
          >
            <IconX size={14} />
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy helpers — 2nd vs 3rd person
// ---------------------------------------------------------------------------

function formatTitle(insight: EvidenceInsight, audience: 'player' | 'coach'): string {
  if (audience === 'player') {
    return rewriteForPlayer(insight.title);
  }
  return insight.title;
}

function formatContent(insight: EvidenceInsight, audience: 'player' | 'coach'): string {
  if (audience === 'player') {
    return rewriteForPlayer(insight.content);
  }
  return insight.content;
}

/**
 * Light 2nd-person rewrite. The generators usually author in a neutral voice
 * with "the player" or "they" — we soft-swap those to "you / your" so the
 * player dashboard reads like a direct note. No LLM, no fancy morphology.
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

/**
 * Maps an `EvidenceInsight.category` to the focus-area type vocabulary the
 * development.ts action expects. Unknown / null categories fall through to
 * `other` so the action can still accept them.
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
