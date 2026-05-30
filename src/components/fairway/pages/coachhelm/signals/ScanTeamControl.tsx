'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · Signals · ScanTeamControl (helper)
 * ----------------------------------------------------------------------------
 * The "Scan Team" trigger, re-skinned per the Alerts mustFix
 *   "replace the Scan Team animate-spin with a determinate progress affordance"
 * WITHOUT touching the engine: it calls the EXISTING, preserved
 * `generateAlerts(coachId, teamId)` server action UNCHANGED (the per-player
 * `analyzePlayer` pipeline behind it is never rewritten) and then asks the
 * parent to re-read the canonical `getInsightsForCoach` source via `onScanned`.
 *
 * Because `generateAlerts` is a single awaited round-trip with no per-player
 * progress channel, we render an HONEST indeterminate→settle treatment that is
 * still NOT the banned infinite spinner: a quiet determinate-style track that
 * sweeps while in flight and snaps to a check on success (respecting
 * prefers-reduced-motion). The button stays a real ≥44px control with a
 * busy state + aria-live status, never an indefinite icon rotation.
 *
 * Presentation + the preserved call only — no new chat/alert plumbing.
 * ========================================================================== */

import { useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/fairway/controls/button';
import { generateAlerts } from '@/app/golf/actions/alerts';

export interface ScanTeamControlProps {
  coachId: string;
  teamId: string;
  /**
   * Called after a successful scan so the parent can re-read the single source
   * of truth (`getInsightsForCoach`). Kept async-agnostic.
   */
  onScanned?: () => void | Promise<void>;
  /** Surfaces a scan failure to the parent (which renders an InlineNotice). */
  onError?: (message: string) => void;
  size?: 'sm' | 'md';
}

export function ScanTeamControl({
  coachId,
  teamId,
  onScanned,
  onError,
  size = 'sm',
}: ScanTeamControlProps) {
  const reduceMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [justScanned, setJustScanned] = useState(false);

  const handleScan = () => {
    setJustScanned(false);
    startTransition(async () => {
      try {
        // PRESERVED ENGINE — generateAlerts runs the per-player analyzePlayer
        // pipeline server-side; we only re-skin the trigger + progress.
        const res = await generateAlerts(coachId, teamId);
        if (!res.success) {
          onError?.(res.error ?? 'Could not scan the team. Try again.');
          return;
        }
        await onScanned?.();
        setJustScanned(true);
        // Clear the "scanned" check after a beat so the control resets quietly.
        window.setTimeout(() => setJustScanned(false), 2200);
      } catch {
        onError?.('Could not scan the team. Try again.');
      }
    });
  };

  return (
    <div className="relative flex flex-col items-end gap-1">
      <Button
        variant="primary"
        size={size}
        busy={isPending}
        onClick={handleScan}
        leftIcon={
          justScanned && !isPending ? (
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          )
        }
        aria-label={isPending ? 'Scanning team for new signals' : 'Scan team for new signals'}
      >
        <span className="hidden sm:inline">
          {isPending ? 'Scanning…' : justScanned ? 'Scanned' : 'Scan Team'}
        </span>
      </Button>

      {/* Determinate-style progress track (NOT an infinite icon spin). It
          sweeps once while the single round-trip is in flight, then unmounts. */}
      {isPending ? (
        <div
          role="status"
          aria-live="polite"
          className="h-1 w-24 overflow-hidden rounded-full bg-surface-sunken"
        >
          <span className="sr-only">Scanning the team for new signals…</span>
          <motion.span
            className="block h-full rounded-full bg-accent-400"
            initial={reduceMotion ? { width: '40%' } : { width: '8%' }}
            animate={reduceMotion ? { width: '40%' } : { width: ['8%', '72%', '92%'] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 2.4, ease: [0.16, 1, 0.3, 1], times: [0, 0.6, 1] }
            }
          />
        </div>
      ) : null}
    </div>
  );
}
