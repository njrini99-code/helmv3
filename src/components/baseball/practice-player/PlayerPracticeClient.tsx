'use client';

// =============================================================================
// src/components/baseball/practice-player/PlayerPracticeClient.tsx
//
// Player-facing practice plan view, migrated onto "The Living Annual" kit
// (docs/baseball/design-system-living-annual.md; map: docs/baseball/
// ui-migration-map.md Lane 3 "today"-adjacent Passport row — same premium bar
// as Player Today, since this is the player's practice execution surface).
//
// PRESENTATION ONLY. Every prop (practices / teamless / fetchError) and the
// expand/collapse interaction state are unchanged — only the render moved to
// the kit: SectionMasthead, PaperCard record-book cards, InkBadge status
// stamps, EditorsLetter empty/error states (no yellow/amber warning boxes),
// and Reveal entrance in place of hand-rolled fade-ins.
//
// HONESTY RULES (carried over):
//   - Never shows staff_only blocks (filtered by server action).
//   - Class-conflict flags only appear when class schedule data was available
//     AND a wall-clock start time was present on the practice. No fake flags.
//   - If fetch failed, shows a user-friendly error with no raw internals.
// =============================================================================

import { useState } from 'react';
import { LazyMotion, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { AlertTriangle, Package, UserCircle2, BarChart2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IconClock, IconMapPin, IconChevronDown, IconChevronUp } from '@/components/icons';
import type { PlayerPracticeView } from '@/app/baseball/actions/practice';
import { cn } from '@/lib/utils';
import { fairwayScope } from '@/lib/redesign/flag';
import { SectionMasthead, EditorsLetter, PaperCard, InkBadge, Reveal } from '@/components/baseball/living-annual';

interface Props {
  practices: PlayerPracticeView[];
  teamless?: boolean;
  fetchError?: string;
}

const PAGE_SHELL = 'mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-10';

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
  const [expandedId, setExpandedId] = useState<string | null>(
    // Auto-expand the most recent practice on first load.
    practices.length > 0 ? (practices[0]?.id ?? null) : null,
  );

  if (teamless) {
    return (
      <div className={fairwayScope('min-h-dvh')}>
        <div className={PAGE_SHELL}>
          <EditorsLetter
            ink="team"
            title="No team yet"
            body="Join a team to see your published practice plans."
          />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={fairwayScope('min-h-dvh')}>
        <div className={PAGE_SHELL}>
          <EditorsLetter
            ink="team"
            title="Could not load practice plans"
            body="Please try refreshing."
          />
        </div>
      </div>
    );
  }

  // ONE shared masthead for every non-terminal state (matches every other LA
  // surface's SectionMasthead usage) — the empty-vs-populated body is the only
  // thing that varies below it.
  return (
    <div className={fairwayScope('min-h-dvh')}>
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE PASSPORT · SCHEDULE" title="Practice Plans" ink="team">
          <p className="max-w-prose font-annual text-body-sm text-text-secondary">
            Your published schedule, blocks, and what to bring.
          </p>
        </SectionMasthead>

        <div className="mt-8">
          {practices.length === 0 ? (
            <EditorsLetter
              ink="team"
              live
              title="No practice plans yet"
              body="When your coaches publish a practice plan, it will appear here."
            />
          ) : (
            <div className="space-y-4">
              {practices.map((practice, idx) => (
                <Reveal key={practice.id} staggerIndex={Math.min(idx, 6)}>
                  <PracticeCard
                    practice={practice}
                    expanded={expandedId === practice.id}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === practice.id ? null : practice.id))
                    }
                  />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PracticeCard — single glanceable practice card with expand / collapse.
// =============================================================================

/** InkBadge tone/variant for the player's own attendance — never red/amber. */
const ATTENDANCE_TONE: Record<string, { label: string; tone: 'team' | 'sodium' | 'neutral'; variant: 'soft' | 'solid' }> = {
  present: { label: 'Present', tone: 'team', variant: 'solid' },
  limited: { label: 'Limited', tone: 'sodium', variant: 'soft' },
  absent: { label: 'Absent', tone: 'sodium', variant: 'solid' },
  excused: { label: 'Excused', tone: 'neutral', variant: 'soft' },
};

function PracticeCard({
  practice,
  expanded,
  onToggle,
}: {
  practice: PlayerPracticeView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const prefersReduced = useReducedMotion();
  const conflictCount = practice.blocks.filter((b) => b.hasClassConflict).length;
  const attendance = practice.myAttendanceStatus
    ? (ATTENDANCE_TONE[practice.myAttendanceStatus] ?? { label: practice.myAttendanceStatus, tone: 'neutral' as const, variant: 'soft' as const })
    : null;

  return (
    <PaperCard className="overflow-hidden p-0">
      {/* Card header — always visible, tap to expand */}
      <Button
        type="button"
        variant="ghost"
        className="flex w-full items-start justify-between gap-3 rounded-none px-5 py-4 text-left"
        aria-expanded={expanded}
        aria-controls={`practice-body-${practice.id}`}
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          {/* Title + date */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-annual text-body-md font-semibold text-text-primary">{practice.title}</h2>
            {practice.calendarDate && (
              <InkBadge
                label={new Date(practice.calendarDate + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                tone="team"
              />
            )}
          </div>

          {/* Focus + meta row */}
          {practice.focus && (
            <p className="mt-0.5 truncate font-annual text-body-sm text-text-secondary">{practice.focus}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-eyebrow text-text-tertiary">
            {practice.calendarStartTime && (
              <span className="inline-flex items-center gap-1">
                <IconClock size={11} aria-hidden />
                {practice.calendarStartTime}
                {practice.calendarEndTime && ` – ${practice.calendarEndTime}`}
              </span>
            )}
            {practice.location && (
              <span className="inline-flex items-center gap-1">
                <IconMapPin size={11} aria-hidden />
                {practice.location}
              </span>
            )}
            <span>{practice.blocks.length} block{practice.blocks.length !== 1 ? 's' : ''}</span>
            {practice.totalMinutes > 0 && <span>{practice.totalMinutes} min</span>}
          </div>
        </div>

        {/* Right: conflict badge + attendance + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {conflictCount > 0 && (
            <InkBadge
              label={`${conflictCount} conflict${conflictCount !== 1 ? 's' : ''}`}
              tone="sodium"
              variant="solid"
            />
          )}
          {attendance && <InkBadge label={attendance.label} tone={attendance.tone} variant={attendance.variant} />}
          <span className="text-text-tertiary" aria-hidden>
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </span>
        </div>
      </Button>

      {/* Expanded body */}
      <LazyMotion features={loadFeatures}>
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
              <div className="border-t border-[color:var(--hairline)] px-5 pb-5 pt-4">
                {practice.blocks.length === 0 ? (
                  <p className="font-annual text-body-sm text-text-secondary">No blocks in this practice.</p>
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
      </LazyMotion>
    </PaperCard>
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
      className={cn(
        'rounded-fw-sm border px-3 py-2.5',
        block.hasClassConflict
          ? 'border-[color:var(--hairline)] bg-sodium/5'
          : 'border-[color:var(--hairline)] bg-[var(--paper-canvas)]',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Block number */}
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-microbadge font-bold text-grade-plus"
          aria-hidden
        >
          {index}
        </span>

        <div className="min-w-0 flex-1">
          {/* Activity headline */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-annual text-body-sm font-semibold text-text-primary">{block.activity}</span>
            {block.stationType && <InkBadge label={block.stationType} tone="neutral" />}
            {block.isMeasured && (
              <span className="inline-flex items-center gap-1 text-microbadge font-medium uppercase tracking-[0.1em] text-grade-plus">
                <BarChart2 className="h-2.5 w-2.5" aria-hidden />
                Measured
              </span>
            )}
          </div>

          {/* Time + location */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-eyebrow text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <IconClock size={11} className="text-grade-plus" aria-hidden />
              {timeLabel}
            </span>
            {block.location && (
              <span className="inline-flex items-center gap-1">
                <IconMapPin size={11} aria-hidden />
                {block.location}
              </span>
            )}
            {block.coachOwnerName && (
              <span className="inline-flex items-center gap-1">
                <UserCircle2 className="h-3 w-3" aria-hidden />
                {block.coachOwnerName}
              </span>
            )}
          </div>

          {/* Class conflict — a quiet ink line, never a colored warning box. */}
          {block.hasClassConflict && (
            <p className="mt-1.5 flex items-start gap-1.5 font-annual text-body-sm text-sodium">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Class conflict:</span>{' '}
                {block.conflictingClasses.join(', ')} overlaps this block. See your coach.
              </span>
            </p>
          )}
        </div>

        {/* Detail toggle (if there's extra info) */}
        {hasDetail && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0 text-text-tertiary"
            aria-expanded={detailOpen}
            aria-label={`${detailOpen ? 'Hide' : 'Show'} details for ${block.activity}`}
            onClick={() => setDetailOpen((v) => !v)}
          >
            {detailOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </Button>
        )}
      </div>

      {/* Expandable detail: description + equipment + group */}
      {detailOpen && hasDetail && (
        <div className="ml-8 mt-2 space-y-1.5 font-annual text-body-sm text-text-secondary">
          {block.description && <p className="leading-relaxed">{block.description}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-eyebrow text-text-tertiary">
            {block.groupLabel && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-text-secondary">Group:</span>
                {block.groupLabel}
              </span>
            )}
            {block.equipment && (
              <span className="inline-flex items-center gap-1">
                <Package className="h-3 w-3" aria-hidden />
                {block.equipment}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
