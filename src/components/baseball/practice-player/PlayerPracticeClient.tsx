'use client';

// =============================================================================
// src/components/baseball/practice-player/PlayerPracticeClient.tsx
//
// Player-facing practice plan view — mobile-first, glanceable, premium.
//
// DESIGN BAR (California-modern × neo-futurism):
//   - Cream bg (#FFFEFA), Helm green primary, warm-gray text.
//   - Glass cards: bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl
//   - Editorial type hierarchy, generous spacing, thumb-friendly tap targets (≥44px).
//   - Skeleton loaders (not raw spinners), honest empty states.
//   - Subtle framer-motion (cinematic, respects prefers-reduced-motion).
//   - Class-conflict flag: amber, never neon; honest only when data exists.
//   - Accessible: role/aria on interactive elements, focus-visible rings, Escape.
//
// HONESTY RULES:
//   - Never shows staff_only blocks (filtered by server action).
//   - Class-conflict flags only appear when class schedule data was available
//     AND a wall-clock start time was present on the practice. No fake flags.
//   - If fetch failed, shows a user-friendly error with no raw internals.
// =============================================================================

import { useState } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ClipboardList,
  Clock,
  MapPin,
  UserCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Package,
  BarChart2,
} from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';
import type { PlayerPracticeView } from '@/app/baseball/actions/practice';

interface Props {
  practices: PlayerPracticeView[];
  teamless?: boolean;
  fetchError?: string;
}

/** Format a minute offset as a relative offset label: "+0m … +2h 15m". */
function fmtOffsetMin(offset: number, duration: number): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return h > 0 ? `${h}:${mm}` : `${mm}m`;
  };
  if (offset === 0 && duration > 0) return `${fmt(duration)}`;
  return `+${offset}m — ${fmt(duration)}`;
}

/** Convert HH:mm start time + offset into a wall-clock label. */
function wallClockLabel(startTime: string | null, offsetMin: number, durationMin: number): string | null {
  if (!startTime) return null;
  const parts = startTime.split(':').map(Number);
  const h = parts[0] ?? NaN;
  const m = parts[1] ?? NaN;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const blockStart = h * 60 + m + offsetMin;
  const blockEnd = blockStart + durationMin;
  const fmt = (total: number) => {
    const hh = Math.floor(total / 60) % 24;
    const mm = String(total % 60).padStart(2, '0');
    const ampm = hh >= 12 ? 'pm' : 'am';
    const display = hh % 12 === 0 ? 12 : hh % 12;
    return `${display}:${mm}${ampm}`;
  };
  return `${fmt(blockStart)} – ${fmt(blockEnd)}`;
}

export function PlayerPracticeClient({ practices, teamless, fetchError }: Props) {
  const prefersReduced = useReducedMotion();
  const [expandedId, setExpandedId] = useState<string | null>(
    // Auto-expand the most recent practice on first load.
    practices.length > 0 ? (practices[0]?.id ?? null) : null,
  );

  if (teamless) {
    return (
      <div className="min-h-dvh bg-[#FFFEFA] px-4 py-8">
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No team yet"
          description="Join a team to see your published practice plans."
        />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-dvh bg-[#FFFEFA] px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-red-100 bg-red-50/60 p-5 text-sm text-red-700">
            Could not load practice plans. Please try refreshing.
          </div>
        </div>
      </div>
    );
  }

  if (practices.length === 0) {
    return (
      <div className="min-h-dvh bg-[#FFFEFA] px-4 py-8">
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No practice plans yet"
          description="When your coaches publish a practice plan, it will appear here."
        />
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-dvh bg-[#FFFEFA]">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          {/* Page header */}
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-warm-400">Schedule</p>
            <h1 className="mt-1 text-2xl font-bold text-warm-900">Practice Plans</h1>
            <p className="mt-1 text-sm text-warm-500">
              Your published schedule, blocks, and what to bring.
            </p>
          </div>

          {/* Practice cards */}
          <div className="space-y-4">
            {practices.map((practice, idx) => (
              <m.div
                key={practice.id}
                initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  prefersReduced ? undefined : { duration: 0.28, delay: Math.min(idx * 0.05, 0.2) }
                }
              >
                <PracticeCard
                  practice={practice}
                  expanded={expandedId === practice.id}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === practice.id ? null : practice.id))
                  }
                  prefersReduced={!!prefersReduced}
                />
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}

// =============================================================================
// PracticeCard — single glanceable practice card with expand / collapse.
// =============================================================================

function PracticeCard({
  practice,
  expanded,
  onToggle,
  prefersReduced,
}: {
  practice: PlayerPracticeView;
  expanded: boolean;
  onToggle: () => void;
  prefersReduced: boolean;
}) {
  const conflictCount = practice.blocks.filter((b) => b.hasClassConflict).length;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/20 bg-white/70 shadow-glass backdrop-blur-xl">
      {/* Card header — always visible, tap to expand */}
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        aria-expanded={expanded}
        aria-controls={`practice-body-${practice.id}`}
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          {/* Title + date */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-warm-900 truncate">{practice.title}</h2>
            {practice.calendarDate && (
              <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                {new Date(practice.calendarDate + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>

          {/* Focus + meta row */}
          {practice.focus && (
            <p className="mt-0.5 text-xs text-warm-500 truncate">{practice.focus}</p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-warm-400">
            {practice.calendarStartTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {practice.calendarStartTime}
                {practice.calendarEndTime && ` – ${practice.calendarEndTime}`}
              </span>
            )}
            {practice.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {practice.location}
              </span>
            )}
            <span>{practice.blocks.length} block{practice.blocks.length !== 1 ? 's' : ''}</span>
            {practice.totalMinutes > 0 && (
              <span>{practice.totalMinutes} min</span>
            )}
          </div>
        </div>

        {/* Right: conflict badge + attendance + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {conflictCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
            </span>
          )}
          {practice.myAttendanceStatus && (
            <AttendancePill status={practice.myAttendanceStatus} />
          )}
          <span className="text-warm-400" aria-hidden>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            id={`practice-body-${practice.id}`}
            role="region"
            aria-label={`${practice.title} blocks`}
            initial={prefersReduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-warm-100 px-5 pb-5 pt-4">
              {practice.blocks.length === 0 ? (
                <p className="text-sm text-warm-500">No blocks in this practice.</p>
              ) : (
                <ol className="space-y-3" aria-label="Practice blocks">
                  {practice.blocks.map((block, i) => (
                    <PracticeBlockRow
                      key={block.id}
                      block={block}
                      index={i + 1}
                      practiceStartTime={practice.calendarStartTime}
                    />
                  ))}
                </ol>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </article>
  );
}

// =============================================================================
// PracticeBlockRow — individual block in the glanceable schedule.
// =============================================================================

function PracticeBlockRow({
  block,
  index,
  practiceStartTime,
}: {
  block: PlayerPracticeView['blocks'][number];
  index: number;
  practiceStartTime: string | null;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  const wallClock = wallClockLabel(practiceStartTime, block.startOffsetMin, block.durationMin);
  const offsetLabel = fmtOffsetMin(block.startOffsetMin, block.durationMin);
  const timeLabel = wallClock ?? offsetLabel;

  const hasDetail = !!(block.description || block.equipment || block.coachOwnerName || block.groupLabel);

  return (
    <li
      className={`rounded-xl border transition-colors ${
        block.hasClassConflict
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-warm-100 bg-cream-50/60 hover:border-warm-200 hover:bg-cream-50'
      }`}
    >
      {/* Primary row — always visible */}
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-3">
          {/* Block number */}
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700"
            aria-hidden
          >
            {index}
          </span>

          <div className="min-w-0 flex-1">
            {/* Activity headline */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-warm-900">{block.activity}</span>
              {block.stationType && (
                <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warm-600">
                  {block.stationType}
                </span>
              )}
              {block.isMeasured && (
                <span className="inline-flex items-center gap-0.5 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600">
                  <BarChart2 className="h-2.5 w-2.5" />
                  Measured
                </span>
              )}
            </div>

            {/* Time + location */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-warm-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary-500" />
                {timeLabel}
              </span>
              {block.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {block.location}
                </span>
              )}
              {block.coachOwnerName && (
                <span className="inline-flex items-center gap-1">
                  <UserCircle2 className="h-3 w-3" />
                  {block.coachOwnerName}
                </span>
              )}
            </div>

            {/* Class conflict warning */}
            {block.hasClassConflict && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-100/70 px-2.5 py-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700">
                  <span className="font-medium">Class conflict:</span>{' '}
                  {block.conflictingClasses.join(', ')} overlaps this block.
                  <span className="ml-1 text-amber-500">See your coach.</span>
                </p>
              </div>
            )}
          </div>

          {/* Detail toggle (if there's extra info) */}
          {hasDetail && (
            <button
              type="button"
              className="ml-auto shrink-0 rounded-lg p-1 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/40"
              aria-expanded={detailOpen}
              aria-label={`${detailOpen ? 'Hide' : 'Show'} details for ${block.activity}`}
              onClick={() => setDetailOpen((v) => !v)}
            >
              {detailOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Expandable detail: description + equipment + group */}
        {detailOpen && hasDetail && (
          <div className="ml-8 mt-2 space-y-1.5 text-xs text-warm-600">
            {block.description && (
              <p className="leading-relaxed">{block.description}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {block.groupLabel && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-warm-500">Group:</span>
                  {block.groupLabel}
                </span>
              )}
              {block.equipment && (
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3 text-warm-400" />
                  {block.equipment}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

// =============================================================================
// AttendancePill — compact status pill for player's own attendance on a card.
// =============================================================================

const ATTENDANCE_DISPLAY: Record<string, { label: string; className: string }> = {
  present: { label: 'Present', className: 'bg-primary-100 text-primary-700' },
  limited: { label: 'Limited', className: 'bg-amber-100 text-amber-700' },
  absent: { label: 'Absent', className: 'bg-red-100 text-red-700' },
  excused: { label: 'Excused', className: 'bg-warm-100 text-warm-600' },
};

function AttendancePill({ status }: { status: string }) {
  const display = ATTENDANCE_DISPLAY[status] ?? { label: status, className: 'bg-warm-100 text-warm-500' };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${display.className}`}>
      {display.label}
    </span>
  );
}
