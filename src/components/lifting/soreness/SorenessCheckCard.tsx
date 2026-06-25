'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessCheckCard.tsx
//
// Player "Soreness Check" card — the full screen interaction surface.
//
// Layout (per mockup spec §5):
//   Eyebrow:  "HELM LIFTING LAB"
//   Title:    "Soreness Check"
//   Subtitle: "Due before 10:00 AM" (when request has due_at)
//
//   Prompt mode:
//     [ ✓ Ready to Go  ]   ← big green primary
//     [ Report Soreness ]  ← ghost / outline secondary
//
//   Map mode: body map + submit / back
//   Done mode: green confirmation pill
//
// Haptic on every meaningful tap. Skeleton-free (data arrives server-side).
// =============================================================================

import { useState, useCallback, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { haptic } from '@/lib/lifting/haptics';
import {
  submitReadyToGo,
  submitSorenessMap,
} from '@/app/lifting/actions/soreness';
import type { SorenessCheckRequest } from '@/lib/types/helm-lifting-checkins';
import { IconCheckCircle2, IconAlertCircle, IconClock, IconLoader } from '@/components/icons';
import { ReadyToGoButton } from './ReadyToGoButton';
import { SorenessBodyMap } from './SorenessBodyMap';
import type { SorenessMapState } from './SorenessBodyMap';
import { isSorenessRegionId } from '@/lib/lifting/soreness-regions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  request: SorenessCheckRequest | null;
  orgId: string;
  athleteId: string;
  alreadySubmitted?: boolean;
  sorenessStatus?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueTime(r: SorenessCheckRequest): string {
  if (r.due_at) {
    const t = new Date(r.due_at);
    return t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return null as unknown as string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SorenessCheckCard({
  request,
  orgId,
  athleteId,
  alreadySubmitted = false,
  sorenessStatus,
}: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [mode, setMode] = useState<'prompt' | 'map' | 'done'>(
    alreadySubmitted ? 'done' : 'prompt',
  );
  const [mapState, setMapState] = useState<SorenessMapState>({});
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dueTime = request ? formatDueTime(request) : null;

  // One-tap ready path
  const handleReadyToGo = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = await submitReadyToGo({
      orgId,
      athleteId,
      checkinDate: today,
      requestId: request?.id ?? null,
      submittedFrom: 'player_today',
    });
    if (!result.success && result.error) {
      throw new Error(result.error);
    }
    startTransition(() => setMode('done'));
  }, [orgId, athleteId, request]);

  // Open map mode
  const handleReportSoreness = useCallback(() => {
    haptic('tap');
    setMode('map');
  }, []);

  // Submit full body map
  const handleSubmitMap = useCallback(async () => {
    const entries = Object.entries(mapState).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    setIsPending(true);
    setError(null);
    haptic('success');
    try {
      const regions = entries
        .filter(([id]) => isSorenessRegionId(id))
        .map(([id, e]) => ({
          regionId: id,
          severity: e!.severity,
          tags: e!.tags.length > 0 ? e!.tags : undefined,
          note: e!.note || null,
        }));

      const today = new Date().toISOString().slice(0, 10);
      const result = await submitSorenessMap({
        orgId,
        athleteId,
        checkinDate: today,
        requestId: request?.id ?? null,
        regions,
        sorenessOverall: Math.max(...regions.map((r) => r.severity)),
        submittedFrom: 'player_today',
      });
      if (!result.success && result.error) {
        setError(result.error);
      } else {
        startTransition(() => setMode('done'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit.');
    } finally {
      setIsPending(false);
    }
  }, [mapState, orgId, athleteId, request]);

  const mapCount = Object.keys(mapState).length;

  return (
    <div className="rounded-3xl glass-standard border border-white/20 shadow-glass overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-warm-100/60">
        {/* Eyebrow */}
        <p className="text-micro font-semibold uppercase tracking-[0.15em] text-primary-600 mb-1">
          Helm Lifting Lab
        </p>

        {/* Title + due time row */}
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-semibold text-warm-900 leading-tight">
            Soreness Check
          </h2>
          {dueTime && (
            <div className="flex items-center gap-1 text-xs text-warm-500 shrink-0 pb-0.5">
              <IconClock size={12} />
              <span>Due before {dueTime}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 py-6">
        <AnimatePresence mode="wait">
          {/* ── DONE ── */}
          {mode === 'done' && (
            <motion.div
              key="done"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 rounded-2xl bg-primary-50 border border-primary-200 px-4 py-4"
            >
              <IconCheckCircle2 size={22} className="text-primary-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary-900">
                  {sorenessStatus === 'reported_soreness'
                    ? 'Soreness reported.'
                    : 'Marked ready to go.'}
                </p>
                <p className="text-xs text-primary-700 mt-0.5">
                  Check-in complete for today.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── PROMPT ── */}
          {mode === 'prompt' && (
            <motion.div
              key="prompt"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <ReadyToGoButton onConfirm={handleReadyToGo} />

              <Button
                type="button"
                variant="outline"
                onClick={handleReportSoreness}
                className="w-full rounded-2xl border border-warm-200 bg-transparent px-6 py-3.5
                  text-sm font-semibold text-warm-700 hover:bg-warm-50 transition-colors duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                Report Soreness
              </Button>
            </motion.div>
          )}

          {/* ── MAP ── */}
          {mode === 'map' && (
            <motion.div
              key="map"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-5"
            >
              <SorenessBodyMap value={mapState} onChange={setMapState} />

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <IconAlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMode('prompt')}
                  className="flex-1 rounded-2xl border border-warm-200 bg-warm-50 px-4 py-3
                    text-sm font-semibold text-warm-600 hover:bg-warm-100 transition-colors duration-150
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSubmitMap}
                  disabled={mapCount === 0 || isPending}
                  className="flex-[2] rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white
                    shadow-sm hover:bg-primary-700 transition-all duration-150 active:scale-[0.98]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <IconLoader size={15} className="animate-spin" />
                      Submitting…
                    </span>
                  ) : mapCount === 0 ? (
                    'Select an area first'
                  ) : (
                    `Submit ${mapCount === 1 ? '1 area' : `${mapCount} areas`}`
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
