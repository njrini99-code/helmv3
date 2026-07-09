'use client';

// =============================================================================
// src/components/baseball/performance/PlayerInspectorPanel.tsx
//
// D1 — Player Inspector panel for the Performance Command Center.
//
// Slide-in right-side drawer triggered by clicking a player row in the
// readiness queue. Shows:
//   • Today plan (session title, prescribed main lift, session status)
//   • Last session summary (actual load + RPE when available)
//   • Soreness mini-preview (read-only SorenessBodyMap)
//   • Bodyweight delta (7-day trend from board row)
//   • Readiness flags + suggested action (from computation)
//   • ActionRail: Modify Lift, Add Note, Follow-up (gated on capabilities)
//   • Mark Limited button (gated on canModifyAvailability)
//   • Link to full player profile
//
// Uses the same spring animation as peek-panel/PeekPanel.tsx. Backdrop click
// + Escape key close the panel. Focus is trapped for keyboard navigation.
//
// Soreness body map renders with readOnly={true} and an empty SorenessMapState
// because region-level soreness data is not part of the board-row payload; the
// overall severity number is displayed as a compact badge above the map.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { SorenessBodyMap } from '@/components/lifting/soreness/SorenessBodyMap';
import { ActionRail } from '@/components/baseball/ui/ActionRail';
import type { ActionRailAction } from '@/components/baseball/ui/ActionRail';
import { readinessBandLabel, readinessBandTone } from '@/lib/baseball/lifting/readiness-compute';
import { Button } from '@/components/ui/button';
import { PaperCard } from '@/components/baseball/living-annual';
import {
  IconX,
  IconDumbbell,
  IconActivity,
  IconAlertCircle,
  IconExternalLink,
  IconLock,
} from '@/components/icons';
import type {
  BaseballWeightRoomBoardRow,
  BaseballReadinessComputation,
} from '@/lib/types/baseball-lifting-v11';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlayerInspectorPanelProps {
  playerId: string;
  playerName: string;
  position?: string | null;
  boardRow: BaseballWeightRoomBoardRow | null;
  readiness: BaseballReadinessComputation | null;
  readinessWithheld: boolean;
  /** Gating: whether the current coach can prescribe or modify lift sessions. */
  canManageLifting: boolean;
  /** Gating: whether the current coach can set availability status. */
  canModifyAvailability: boolean;
  onClose: () => void;
  /** Called when an ActionRail action is triggered. The parent handles routing. */
  onAction: (action: ActionRailAction, playerId: string) => void;
  /** Called when the "Mark Limited" button is clicked. */
  onMarkLimited: (playerId: string) => void;
}

// ---------------------------------------------------------------------------
// Tone map (mirrors PerformanceCommandCenter for visual consistency)
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<'success' | 'warning' | 'error' | 'info', string> = {
  success: 'bg-primary-50 text-primary-700 border-primary-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error:   'bg-red-50 text-red-700 border-red-200',
  info:    'bg-warm-50 text-warm-700 border-warm-200',
};

const SESSION_STATUS_LABEL: Record<string, string> = {
  assigned:  'Not started',
  started:   'In progress',
  completed: 'Complete',
  modified:  'Modified',
  missed:    'Missed',
  excused:   'Excused',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-eyebrow font-semibold uppercase tracking-wider text-warm-400">
      {children}
    </h3>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-xs text-warm-500">{label}</span>
      <span className="text-xs font-medium text-warm-800">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlayerInspectorPanel({
  playerId,
  playerName,
  position,
  boardRow,
  readiness,
  readinessWithheld,
  canManageLifting,
  canModifyAvailability,
  onClose,
  onAction,
  onMarkLimited,
}: PlayerInspectorPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Keyboard: Escape closes the panel ──────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ── Body scroll lock while the panel is open ────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Focus first interactive element on mount ───────────────────────────
  useEffect(() => {
    const el = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    el?.focus();
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────
  const session = boardRow?.session ?? null;
  const sorenessOverall = boardRow?.soreness_overall ?? null;
  const bwDelta = boardRow?.bodyweight_delta_7d ?? null;
  const bandTone = readiness ? readinessBandTone(readiness.band) : ('info' as const);
  const bandLabel = readiness ? readinessBandLabel(readiness.band) : null;

  // Compute ActionRail actions based on capabilities
  const availableActions = useMemo<ActionRailAction[]>(() => {
    const actions: ActionRailAction[] = [];
    if (canManageLifting) actions.push('modify_lift');
    actions.push('add_note');
    actions.push('add_followup');
    return actions;
  }, [canManageLifting]);

  const handleAction = useCallback(
    (action: ActionRailAction) => onAction(action, playerId),
    [onAction, playerId],
  );

  const handleMarkLimited = useCallback(
    () => onMarkLimited(playerId),
    [onMarkLimited, playerId],
  );

  // ── Framer-motion variants ──────────────────────────────────────────────
  const panelVariants = prefersReducedMotion
    ? {}
    : {
        initial: { x: 400, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit:    { x: 400, opacity: 0 },
        transition: { type: 'spring' as const, stiffness: 400, damping: 35, mass: 0.8 },
      };

  const backdropVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit:    { opacity: 0 },
        transition: { duration: 0.15 },
      };

  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────────────── */}
      <motion.div
        {...backdropVariants}
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Panel ──────────────────────────────────────────────────────── */}
      <motion.div
        {...panelVariants}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Player inspector: ${playerName}`}
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-full max-w-[400px]',
          'flex flex-col',
          'bg-cream-50/95 backdrop-blur-xl',
          'shadow-2xl shadow-black/10',
          'border-l border-warm-200/50',
          'overflow-hidden',
        )}
      >
        {/* ── Close button ─────────────────────────────────────────────── */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close inspector"
          className={cn(
            'absolute top-4 right-4 z-10',
            'w-11 h-11 flex items-center justify-center',
            'rounded-xl bg-warm-100/80 backdrop-blur-sm',
            'text-warm-500 hover:text-warm-700 hover:bg-warm-200/80',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          )}
        >
          <IconX size={18} />
        </Button>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="border-b border-warm-100 p-5 pr-14">
          <p className="text-eyebrow font-semibold uppercase tracking-wider text-primary-600">
            Player Inspector
          </p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-warm-900 truncate">
            {playerName}
          </h2>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {position && (
              <span className="text-sm font-medium text-warm-600">{position}</span>
            )}
            {readiness && bandLabel && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                  TONE_CLASS[bandTone],
                )}
              >
                {bandLabel}
              </span>
            )}
          </div>
        </div>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Today Plan ─────────────────────────────────────────────── */}
          <section className="border-b border-warm-50 p-5">
            <SectionHeading>
              <IconDumbbell size={11} className="inline mr-1" />
              Today Plan
            </SectionHeading>
            {session ? (
              <div className="space-y-1">
                {session.title && (
                  <InfoRow label="Session" value={session.title} />
                )}
                <InfoRow
                  label="Status"
                  value={SESSION_STATUS_LABEL[session.status] ?? session.status}
                />
                {boardRow?.prescribed_main_lift && (
                  <InfoRow label="Main lift" value={boardRow.prescribed_main_lift} />
                )}
                {boardRow?.actual_main_load != null && (
                  <InfoRow
                    label="Actual load"
                    value={`${boardRow.actual_main_load} lb`}
                  />
                )}
                {boardRow?.main_rpe != null && (
                  <InfoRow
                    label="RPE"
                    value={String(boardRow.main_rpe)}
                  />
                )}
                {session.estimated_minutes != null && (
                  <InfoRow
                    label="Est. duration"
                    value={`${session.estimated_minutes} min`}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-warm-400 italic">No session scheduled today.</p>
            )}
          </section>

          {/* ── Soreness preview ─────────────────────────────────────────── */}
          {!readinessWithheld && (
            <section className="border-b border-warm-50 p-5">
              <SectionHeading>
                <IconActivity size={11} className="inline mr-1" />
                Soreness
              </SectionHeading>
              {sorenessOverall != null && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-warm-500">Overall severity:</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums',
                      sorenessOverall >= 7
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : sorenessOverall >= 4
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-primary-50 text-primary-700 border-primary-200',
                    )}
                  >
                    {sorenessOverall}/10
                  </span>
                </div>
              )}
              {/* Read-only body map — shows region highlights from check-in data.
                  An empty value ({}) renders the neutral body silhouette shape.
                  Region-level data requires a dedicated per-player fetch
                  (not available in the board-row payload). */}
              <PaperCard className="rounded-xl">
                <SorenessBodyMap
                  value={{}}
                  onChange={() => {}}
                  readOnly={true}
                />
              </PaperCard>
              {sorenessOverall == null && (
                <p className="mt-2 text-center text-xs text-warm-400 italic">
                  No soreness check-in recorded today.
                </p>
              )}
            </section>
          )}

          {/* ── Bodyweight ─────────────────────────────────────────────── */}
          <section className="border-b border-warm-50 p-5">
            <SectionHeading>
              <IconActivity size={11} className="inline mr-1" />
              Bodyweight
            </SectionHeading>
            {bwDelta != null ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-warm-500">7-day change:</span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    bwDelta <= -3
                      ? 'text-amber-700'
                      : bwDelta >= 3
                      ? 'text-primary-700'
                      : 'text-warm-700',
                  )}
                >
                  {bwDelta > 0 ? '+' : ''}{bwDelta} lb
                </span>
              </div>
            ) : (
              <p className="text-sm text-warm-400 italic">No bodyweight data available.</p>
            )}
          </section>

          {/* ── Readiness flags ────────────────────────────────────────── */}
          {readiness && (readiness.reasons.length > 0 || readiness.suggested_action) && (
            <section className="border-b border-warm-50 p-5">
              <SectionHeading>
                <IconAlertCircle size={11} className="inline mr-1" />
                Readiness Flags
              </SectionHeading>
              {readiness.reasons.length > 0 && (
                <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-warm-600">
                  {readiness.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              {readiness.suggested_action && (
                <p className="mt-1 text-xs font-medium text-warm-700">
                  → {readiness.suggested_action}
                </p>
              )}
              <div className="mt-2 text-eyebrow text-warm-400">
                Confidence: {readiness.confidence}
                {readiness.stale && ' · stale data'}
                {readiness.missing_inputs.length > 0 &&
                  ` · missing: ${readiness.missing_inputs.join(', ')}`}
              </div>
            </section>
          )}

          {/* ── Spacer to prevent footer overlap on short content ──────── */}
          <div className="h-4" />
        </div>

        {/* ── Actions footer ───────────────────────────────────────────── */}
        <div className="border-t border-warm-100 bg-cream-50/80 p-4 space-y-3">
          {/* Mark Limited — gated on canModifyAvailability */}
          {canModifyAvailability && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<IconLock size={14} />}
              onClick={handleMarkLimited}
              className="w-full justify-start text-amber-700 border-amber-200 hover:bg-amber-50"
            >
              Mark Limited
            </Button>
          )}

          {/* ActionRail — Modify Lift (gated), Add Note, Follow-up */}
          <ActionRail
            availableActions={availableActions}
            onAction={handleAction}
            className="flex-wrap"
          />

          {/* Full profile link */}
          <Link
            href={`/baseball/dashboard/players/${playerId}`}
            className={cn(
              'flex w-full items-center justify-center gap-1.5',
              'rounded-lg px-3 py-2 text-xs font-medium text-warm-500',
              'transition-colors hover:text-warm-700 hover:bg-warm-100/60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
            )}
            onClick={onClose}
          >
            <IconExternalLink size={13} />
            View full profile
          </Link>
        </div>
      </motion.div>
    </>
  );
}
