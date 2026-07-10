'use client';

// =============================================================================
// src/components/baseball/command-center/DailyBriefPanel.tsx
//
// Wave 4 / P4.4 — Embedded AI daily-brief surface for the Command Center.
// Wave 10 / P10.4 — wired to the CoachHelm baseball engine.
//
// This is the SURFACE the CoachHelm baseball engine writes into. It reads the
// AI-sourced items present in the command-center read model (RiskFeedItem[]
// where sourceRef.source === 'ai' — the read model flags rows whose
// insight_type matches /ai|engine|coachhelm|.../, which is exactly what the
// engine emits, e.g. 'coachhelm_two_strike_chase') and presents them as a
// coach's morning brief. When there is no AI output yet it shows an HONEST empty
// state — it does NOT fabricate a brief. Confidence is shown verbatim from the
// read model (never a fake 100%).
//
// Wave-10 wiring: an OPTIONAL `onGenerate` callback connects this surface to the
// engine action (src/app/baseball/actions/coachhelm.ts → runBaseballEngine, or
// generateTeamInsights). When provided, the header shows a Refresh control and
// the empty state shows a Generate CTA so a coach can run the engine on demand;
// `generating` drives the busy state and `lastGeneratedAt` shows freshness. The
// component stays presentational — it OWNS no data fetching; the parent passes
// the callback + refreshes the read model after it resolves.
//
// Pure presentational client component: takes already-resolved, already-
// authorized data + capability-aware callbacks. No DB access, no black
// backgrounds.
// =============================================================================

import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import {
  IconSparkles,
  IconBrain,
  IconExternalLink,
  IconInfo,
  IconRefresh,
  IconX,
  IconCheck,
  IconArrowRight,
} from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { RiskFeedItem } from '@/lib/baseball/read-models/command-center';
import type { BaseballInsightFeedback } from '@/lib/types';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface DailyBriefPanelProps {
  /**
   * The full risk feed from the read model. The panel itself filters to
   * AI-sourced items so callers can pass the same array used by RiskFeedStrip.
   */
  items: RiskFeedItem[];
  /** Coach first name for the greeting, optional. */
  coachName?: string;
  /** True while the read model is still loading. */
  loading?: boolean;
  /** Honest error string from the read model, if any. */
  error?: string | null;
  /** Capability-aware: open a player's detail when permitted. */
  onOpenPlayer?: (playerId: string) => void;
  /** Max brief items to surface (default 5). */
  maxItems?: number;
  /**
   * Wave-10 engine wiring. When provided, the panel shows a Refresh control in
   * the header and a Generate CTA in the empty state. The parent runs the engine
   * action (runBaseballEngine / generateTeamInsights) and refreshes the read
   * model. Omit to keep the pre-engine read-only behavior. Capability-gated by
   * the parent — only pass it for users allowed to run the engine.
   */
  onGenerate?: () => void | Promise<void>;
  /** True while the engine run is in flight (drives the busy state). */
  generating?: boolean;
  /** ISO timestamp of the last engine run, for an honest freshness label. */
  lastGeneratedAt?: string | null;
  /**
   * Per-insight triage callbacks (V2 AI contract: every AI output must be
   * dismissible/resolvable + carry a suggested action). When provided, each
   * brief row shows Dismiss / Helpful·Not-helpful / Add to actions. The parent
   * runs the capability-gated actions (dismissInsight / submitInsightFeedback /
   * convertInsightToAction) and refreshes the read model. Omit to keep the row
   * read-only. The `item.id` is the baseball_coach_insights row id.
   */
  onDismiss?: (insightId: string) => void | Promise<void>;
  onFeedback?: (insightId: string, feedback: BaseballInsightFeedback) => void | Promise<void>;
  onConvert?: (insightId: string) => void | Promise<void>;
  /** Insight id with an action in flight (disables that row's controls). */
  busyInsightId?: string | null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function confidenceLabel(confidence: number | null): string | null {
  if (confidence == null) return null;
  return `${Math.round(confidence * 100)}%`;
}

/** Honest "updated N ago" label from an ISO timestamp. Null when unknown. */
function freshnessLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `Updated ${days}d ago`;
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// -----------------------------------------------------------------------------
// DailyBriefPanel
// -----------------------------------------------------------------------------

export function DailyBriefPanel({
  items,
  coachName,
  loading = false,
  error = null,
  onOpenPlayer,
  maxItems = 5,
  onGenerate,
  generating = false,
  lastGeneratedAt = null,
  onDismiss,
  onFeedback,
  onConvert,
  busyInsightId = null,
}: DailyBriefPanelProps) {
  const reduceMotion = useReducedMotion();
  const fresh = freshnessLabel(lastGeneratedAt);
  const hasTriage = !!(onDismiss || onFeedback || onConvert);

  // Only AI-sourced items belong in the AI brief. Coach-authored notes live in
  // the RiskFeedStrip, not here.
  const aiItems = items
    .filter((i) => i.sourceRef.source === 'ai')
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
    )
    .slice(0, maxItems);

  const name = coachName?.trim().split(' ')[0];

  return (
    <section
      aria-label="AI daily brief"
      className="relative overflow-hidden rounded-2xl border border-primary-200/50 bg-gradient-to-br from-primary-50/80 via-cream-100/75 to-cream-100/75 p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 shadow-sm">
          <IconSparkles size={18} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-warm-900 leading-tight">
            {greeting()}{name ? `, ${name}` : ''}
          </h3>
          <p className="text-eyebrow text-primary-700/80 mt-0.5 inline-flex items-center gap-1">
            <IconBrain size={11} /> CoachHelm daily brief
            {fresh && (
              <span className="text-warm-400">· {fresh}</span>
            )}
          </p>
        </div>
        {onGenerate && (
          <Button
            variant="ghost"
            size="icon-sm"
            isLoading={generating}
            onClick={() => void onGenerate()}
            aria-label={generating ? 'Refreshing brief' : 'Refresh brief'}
            title="Refresh brief"
            className="flex-shrink-0 text-primary-600"
          >
            <IconRefresh size={16} />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="block" className="h-14 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-pursuit/20 bg-pursuit/10 p-4 text-center">
          <IconInfo size={18} className="text-pursuit mx-auto mb-1.5" />
          <p className="text-sm text-pursuit font-medium">{error}</p>
        </div>
      ) : aiItems.length === 0 ? (
        // HONEST empty — the engine has not produced a brief yet.
        <div className="rounded-xl border border-primary-200/50 bg-cream-50 p-6 text-center">
          <IconSparkles size={22} className="text-primary-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-warm-800">No insights yet</p>
          <p className="text-xs text-warm-500 mt-1 max-w-xs mx-auto">
            Your daily brief appears here once the CoachHelm engine analyzes
            recent stats, workload, and trends. Upload sessions to give it
            something to work with.
          </p>
          {onGenerate && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={generating}
              leftIcon={<IconRefresh size={14} />}
              onClick={() => void onGenerate()}
              className="mt-3"
            >
              {generating ? 'Analyzing…' : 'Generate brief'}
            </Button>
          )}
        </div>
      ) : (
        <LazyMotion features={loadFeatures}>
          <m.ul
            className="space-y-2.5"
            initial={reduceMotion ? false : 'hidden'}
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          >
            {aiItems.map((item) => {
              const conf = confidenceLabel(item.confidence);
              const clickable = !!onOpenPlayer && !!item.playerId;
              const rowBusy = busyInsightId === item.id;
              const summary = (
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-warm-900">{item.title}</p>
                    {item.body && (
                      <p className="text-xs text-warm-600 mt-0.5 line-clamp-2">
                        {item.body}
                      </p>
                    )}
                    {conf && (
                      <span className="text-eyebrow text-primary-600/80 tabular-nums mt-1 inline-block">
                        {conf} confidence
                      </span>
                    )}
                  </div>
                  {clickable && (
                    <IconExternalLink
                      size={13}
                      className="text-primary-500 flex-shrink-0 mt-0.5"
                    />
                  )}
                </div>
              );
              return (
                <m.li
                  key={item.id}
                  variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                  className={`rounded-xl border border-primary-100 bg-cream-50 transition-opacity ${rowBusy ? 'opacity-60' : ''}`}
                >
                  {clickable ? (
                    // Custom full-width brief-row affordance (hover lift +
                    // focus-visible ring) the design-system Button does not
                    // express; intentional raw button. Only the summary opens the
                    // player — the triage controls below sit OUTSIDE it so we
                    // never nest interactive elements.
                    // eslint-disable-next-line helm/no-raw-button
                    <button
                      type="button"
                      onClick={() => item.playerId && onOpenPlayer?.(item.playerId)}
                      className="block w-full text-left rounded-t-xl p-3 transition-[transform,box-shadow,background-color] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
                    >
                      {summary}
                    </button>
                  ) : (
                    <div className="p-3">{summary}</div>
                  )}

                  {/* Triage row — V2 AI contract: dismissible/resolvable + a
                      suggested action. Capability-gated by the parent (controls
                      only render when the viewer may run the engine). */}
                  {hasTriage && (
                    <div className="flex items-center gap-1 border-t border-primary-100/70 px-2.5 py-1.5">
                      {onConvert && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={rowBusy}
                          isLoading={rowBusy}
                          leftIcon={<IconArrowRight size={13} />}
                          onClick={() => void onConvert(item.id)}
                          className="!px-2 !py-1 text-eyebrow font-medium text-primary-700 hover:bg-primary-50"
                        >
                          Add to actions
                        </Button>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        {onFeedback && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={rowBusy}
                              onClick={() => void onFeedback(item.id, 'helpful')}
                              aria-label="Mark insight helpful"
                              title="Helpful"
                              className="text-warm-400 hover:text-primary-600"
                            >
                              <IconCheck size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={rowBusy}
                              onClick={() => void onFeedback(item.id, 'not_helpful')}
                              aria-label="Mark insight not helpful"
                              title="Not helpful"
                              className="text-warm-400 hover:text-pursuit"
                            >
                              <IconX size={14} />
                            </Button>
                          </>
                        )}
                        {onDismiss && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => void onDismiss(item.id)}
                            className="!px-2 !py-1 text-eyebrow font-medium text-warm-500 hover:text-warm-800 hover:bg-warm-100"
                          >
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </m.li>
              );
            })}
          </m.ul>
        </LazyMotion>
      )}
    </section>
  );
}
