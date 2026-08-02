'use client';

/**
 * ============================================================================
 * Fairway · Rounds-new · FairwayRoundSummarySheet — the finish-round celebration
 * ----------------------------------------------------------------------------
 * The most celebratory moment of the create-round flow, re-skinned in the warm
 * Fairway system. Replaces the legacy summary drawer (pure cream tokens +
 * arbitrary `text-[44px]/[52px]` type) with:
 *   • a green `bg-accent-600` celebration header (radial highlight) carrying the
 *     total score on the `text-display` role + `font-fw-mono` numerals;
 *   • key-stat tiles in sunken wells (`bg-surface-sunken`);
 *   • a token-driven mini scorecard;
 *   • a Go Back / Submit Round action dock (Fairway `Button`s).
 *
 * PRESENTATION ONLY. The parent owns `pendingFinalStats` + the submit machinery;
 * this only renders the summary and calls `onGoBack` / `onSubmit`. ModalShell
 * self-scopes to `.fairway-ds`, so all warm tokens/fonts resolve inside.
 *
 * Shared on purpose: both the new-round and continue-round clients can mount
 * this single component to retire the ~180-line block that was copied verbatim
 * across the two files.
 * ========================================================================== */

import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { Flag } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import type { HoleStats } from '@/lib/types/golf';

export interface FairwayRoundSummarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Per-hole stats for the completed round (drives all totals + the scorecard). */
  finalStats: HoleStats[];
  courseName: string;
  onGoBack: () => void;
  onSubmit: () => void;
}

export function FairwayRoundSummarySheet({
  open,
  onOpenChange,
  finalStats,
  courseName,
  onGoBack,
  onSubmit,
}: FairwayRoundSummarySheetProps) {
  const prefersReducedMotion = useReducedMotion();

  const totalScore = finalStats.reduce((sum, h) => sum + (h?.score ?? 0), 0);
  const totalPar = finalStats.reduce((sum, h) => sum + (h?.par ?? 0), 0);
  const toPar = totalScore - totalPar;
  const totalPutts = finalStats.reduce((sum, h) => sum + (h?.putts ?? 0), 0);
  const fairwaysHit = finalStats.filter(h => h?.fairwayHit === true).length;
  const fairwayEligible = finalStats.filter(h => h?.fairwayHit !== null).length;
  const girCount = finalStats.filter(h => h?.greenInRegulation === true).length;
  const colCount = Math.min(finalStats.length, 9);
  const toParLabel = toPar === 0 ? 'E' : `${toPar > 0 ? '+' : ''}${toPar}`;

  const ScoreCell = ({ h }: { h: HoleStats }) => {
    const diff = (h?.score ?? 0) - (h?.par ?? 0);
    const cls =
      diff <= -2 ? 'text-accent-700 bg-accent-100 font-medium'
        : diff === -1 ? 'text-accent-600 bg-accent-50 font-medium'
          : diff === 0 ? 'text-text-secondary bg-surface font-medium'
            : diff === 1 ? 'text-fw-warning-ink bg-fw-warning-bg font-medium'
              : 'text-fw-danger-ink bg-fw-danger-bg font-medium';
    return (
      <div className={cn('py-1.5 text-center', cls)}>
        <span className="font-fw-mono text-xs tabular-nums">{h?.score}</span>
      </div>
    );
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Round Complete"
      hideTitle
      hideClose
      className="p-0 overflow-y-auto"
    >
      <LazyMotion features={loadFeatures}>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
        >
          {/* Celebration header */}
          <div className="relative overflow-hidden rounded-t-fw-lg bg-accent-600 px-6 pb-5 pt-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.16),transparent_60%)]" />
            <m.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.15, duration: 0.4, type: 'spring', stiffness: 200, damping: 15 }}
              className="relative"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-text-on-accent/20 backdrop-blur-sm">
                <Flag className="h-6 w-6 text-text-on-accent" aria-hidden />
              </div>
              <h2 className="mb-1 font-fw-display text-body-lg font-medium text-text-on-accent/90">Round Complete</h2>
              <div className="flex items-baseline justify-center gap-2">
                <m.span
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.25, duration: 0.3 }}
                  className="font-fw-mono text-display tabular-nums tracking-[-0.025em] text-text-on-accent"
                >
                  {totalScore}
                </m.span>
                <m.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.35 }}
                  className={cn(
                    'font-fw-sans text-body-lg font-medium',
                    toPar === 0 ? 'text-text-on-accent/70' : toPar < 0 ? 'text-accent-100' : 'text-fw-warning-ink',
                  )}
                >
                  ({toParLabel})
                </m.span>
              </div>
              <p className="mt-1 font-fw-sans text-body-sm text-text-on-accent/70">{courseName}</p>
            </m.div>
          </div>

          <div className="p-6">
            {/* Key stats */}
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2, duration: 0.3 }}
              className="mb-5 grid grid-cols-3 gap-3"
            >
              <div className="rounded-fw-md border border-border-subtle bg-surface-sunken p-3 text-center">
                <p className="font-fw-display text-h3 font-medium tabular-nums tracking-[-0.012em] text-text-primary">{totalPutts}</p>
                <p className="font-fw-sans text-xs font-medium text-text-tertiary">Putts</p>
              </div>
              <div className="rounded-fw-md border border-border-subtle bg-surface-sunken p-3 text-center">
                <p className="font-fw-display text-h3 font-medium tabular-nums tracking-[-0.012em] text-text-primary">{fairwaysHit}/{fairwayEligible}</p>
                <p className="font-fw-sans text-xs font-medium text-text-tertiary">Fairways</p>
              </div>
              <div className="rounded-fw-md border border-border-subtle bg-surface-sunken p-3 text-center">
                <p className="font-fw-display text-h3 font-medium tabular-nums tracking-[-0.012em] text-text-primary">{girCount}/{finalStats.length}</p>
                <p className="font-fw-sans text-xs font-medium text-text-tertiary">GIR</p>
              </div>
            </m.div>

            {/* Mini scorecard */}
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.3, duration: 0.3 }}
              className="mb-6"
            >
              <p className="mb-2 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">Scorecard</p>
              <div className="overflow-x-auto overflow-hidden rounded-fw-md border border-border-subtle">
                {/* Front 9 (or all 9 for a 9-hole round) */}
                <div className="grid gap-px bg-border-subtle" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                  {finalStats.slice(0, 9).map((_, idx) => (
                    <div key={`h${idx}`} className="bg-surface-sunken py-1 text-center">
                      <span className="font-fw-sans text-eyebrow font-medium text-text-tertiary">{idx + 1}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-px bg-border-subtle" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                  {finalStats.slice(0, 9).map((h, idx) => (
                    <div key={`p${idx}`} className="bg-surface py-1 text-center">
                      <span className="font-fw-mono text-eyebrow text-text-tertiary">{h?.par}</span>
                    </div>
                  ))}
                </div>
                <div className="grid gap-px bg-border-subtle" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                  {finalStats.slice(0, 9).map((h, idx) => (
                    <ScoreCell key={`s${idx}`} h={h} />
                  ))}
                </div>

                {/* Back 9 */}
                {finalStats.length > 9 && (
                  <>
                    <div className="h-px bg-border-strong/40" />
                    <div className="grid gap-px bg-border-subtle" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                      {finalStats.slice(9, 18).map((_, idx) => (
                        <div key={`h2${idx}`} className="bg-surface-sunken py-1 text-center">
                          <span className="font-fw-sans text-eyebrow font-medium text-text-tertiary">{idx + 10}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-px bg-border-subtle" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                      {finalStats.slice(9, 18).map((h, idx) => (
                        <div key={`p2${idx}`} className="bg-surface py-1 text-center">
                          <span className="font-fw-mono text-eyebrow text-text-tertiary">{h?.par}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-px bg-border-subtle" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                      {finalStats.slice(9, 18).map((h, idx) => (
                        <ScoreCell key={`s2${idx}`} h={h} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </m.div>

            {/* Action dock */}
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.4, duration: 0.3 }}
              className="flex gap-3"
            >
              <Button variant="secondary" className="flex-1" onClick={onGoBack}>
                Go Back
              </Button>
              <Button variant="primary" className="flex-1" onClick={onSubmit}>
                Submit Round
              </Button>
            </m.div>
          </div>
        </m.div>
      </LazyMotion>
    </ModalShell>
  );
}
