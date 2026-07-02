'use client';

// =============================================================================
// src/components/baseball/performance/PerformanceCommandCenter.tsx
//
// V11 Performance Command Center (spec L39-79) — Living-Annual pass (P4.14.a,
// spec: docs/baseball/design-system-living-annual.md §7; map/plan:
// docs/baseball/ui-migration-execution-plan.md §3.1 "performance"). The
// strength-coach first viewport, re-skinned onto the kit:
//   * KPI strip (spec L54-60) → `<KPIContentsStrip>` on a green rule.
//   * Today Weight Room board (spec L82-117) → a wall of Paper rows.
//   * Readiness & availability queue (spec L119-150) → transparent,
//     NON-MEDICAL bands + reasons, quiet ink instead of amber/red boxes.
//
// PRESENTATION ONLY — same props, same read-model, same
// `readinessWithheld` honesty gate, same Lab adapters upstream (untouched).
// `PlayerInspectorPanel` (the slide-in drawer) is reused verbatim; this
// pass does not edit it. Sub-routes (builder/groups/live/programs) are
// deferred to a follow-up wave.
// =============================================================================

import { useMemo, useState, useCallback, type KeyboardEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/fairway';
import { IconActivity, IconClipboardList, IconUsers, IconLayers } from '@/components/icons';
import { cn } from '@/lib/utils';
import { readinessBandLabel } from '@/lib/baseball/lifting/readiness-compute';
import { PlayerInspectorPanel } from './PlayerInspectorPanel';
import type { ActionRailAction } from '@/components/baseball/ui/ActionRail';
import type {
  BaseballPerformanceKpis,
  BaseballWeightRoomBoardRow,
  BaseballReadinessComputation,
  BaseballReadinessBand,
} from '@/lib/types/baseball-lifting-v11';
import {
  SectionMasthead,
  Eyebrow,
  PaperCard,
  HairlineRule,
  PositionChip,
  StatReadout,
  Reveal,
  pressableClass,
  GRADE_TEXT_CLASS,
  GRADE_VAR,
  KPIContentsStrip,
  EmptyIssue,
  type GradeBand,
  type KPIContentsItem,
} from '@/components/baseball/living-annual';

interface Props {
  teamName: string;
  trainingWeekLabel: string;
  kpis: BaseballPerformanceKpis;
  board: BaseballWeightRoomBoardRow[];
  readiness: BaseballReadinessComputation[];
  readinessWithheld: boolean;
  playerNameById: Record<string, string>;
  isLoading?: boolean;
  /** Whether the current coach can modify lift prescriptions (can_manage_lifting). */
  canManageLifting?: boolean;
  /** Whether the current coach can set availability status (can_modify_availability). */
  canModifyAvailability?: boolean;
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  assigned: 'Not started',
  started: 'In progress',
  completed: 'Complete',
  modified: 'Modified',
  missed: 'Missed',
  excused: 'Excused',
};

// Readiness band → the kit's existing 20-80 grade ramp (low/avg/plus). Three
// bands is a deliberate simplification of the six real bands: the exact
// wording (readinessBandLabel) still carries the full precision, the ramp
// just gives the eye a quiet green/graphite/muted-clay-red read instead of a
// yellow/amber status box. `red` alone gets the `solid` (heavier ground)
// treatment so "hold and review" reads with more weight than "modify".
const BAND_RAMP: Record<BaseballReadinessBand, GradeBand> = {
  green: 'plus',
  yellow: 'avg',
  orange_lower: 'low',
  orange_upper: 'low',
  red: 'low',
  blue: 'avg',
};

function BandChip({ band }: { band: BaseballReadinessBand | null }) {
  if (!band) {
    return (
      <span className="inline-flex items-center rounded-fw-sm border border-[color:var(--hairline)] px-1.5 py-0.5 font-annual text-microbadge uppercase leading-none tracking-[0.12em] text-text-tertiary">
        No check-in
      </span>
    );
  }
  const ramp = BAND_RAMP[band];
  const solid = band === 'red';
  const varRef = GRADE_VAR[ramp];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-fw-sm px-1.5 py-0.5 font-annual text-microbadge uppercase leading-none tracking-[0.12em]',
        GRADE_TEXT_CLASS[ramp],
        solid && 'border',
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${varRef} ${solid ? 16 : 8}%, transparent)`,
        borderColor: solid ? `color-mix(in oklch, ${varRef} 32%, transparent)` : undefined,
      }}
    >
      {readinessBandLabel(band)}
    </span>
  );
}

/** A quiet label + value cell inside a `WeightRoomRow` (Group / Status / Main lift). */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">{label}</span>
      <span className="max-w-[11rem] truncate font-annual text-body-sm text-text-primary">{value}</span>
    </div>
  );
}

/** One Today Weight Room record — name plate + readiness + record-book stats, on a green rule. */
function WeightRoomRow({
  row,
  readinessWithheld,
}: {
  row: BaseballWeightRoomBoardRow;
  readinessWithheld: boolean;
}) {
  const delta = row.bodyweight_delta_7d;
  const deltaTone = delta != null && delta <= -3 ? GRADE_TEXT_CLASS.low : undefined;
  const mainLift = row.prescribed_main_lift
    ? `${row.prescribed_main_lift}${row.actual_main_load != null ? ` · ${row.actual_main_load} lb` : ''}`
    : '—';

  return (
    <div>
      <div className="flex flex-col gap-3 px-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <Link
            href={`/baseball/dashboard/performance/players/${row.player_id}`}
            className={cn(
              'truncate rounded-fw-sm font-annual leading-none text-text-primary',
              pressableClass({ ink: 'team', tint: false }),
            )}
          >
            <span className="font-normal text-text-secondary">{row.first_name} </span>
            <span className="font-semibold uppercase" style={{ fontVariant: 'small-caps' }}>
              {row.last_name}
            </span>
          </Link>
          {row.primary_position ? <PositionChip label={row.primary_position} size="sm" /> : null}
          {readinessWithheld ? (
            <span className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">Gated</span>
          ) : (
            <BandChip band={row.readiness_band} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatCell label="Group" value={row.group_names[0] ?? '—'} />
          <StatCell label="Status" value={SESSION_STATUS_LABEL[row.session.status] ?? row.session.status} />
          <StatCell label="Main lift" value={mainLift} />
          <div className="flex min-w-[3.5rem] flex-col items-start gap-1 sm:items-end">
            <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">BW Δ7d</span>
            {delta == null ? (
              <span className="font-annual tabular-nums text-text-tertiary">—</span>
            ) : (
              <StatReadout value={delta} prefix={delta > 0 ? '+' : ''} className={deltaTone} />
            )}
          </div>
        </div>
      </div>
      <HairlineRule ink="team" />
    </div>
  );
}

export function PerformanceCommandCenter({
  teamName,
  trainingWeekLabel,
  kpis,
  board,
  readiness,
  readinessWithheld,
  playerNameById,
  isLoading = false,
  canManageLifting = false,
  canModifyAvailability = false,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  // Stale check-ins (8d+ old, low confidence) collapse into one summary row so
  // the queue surfaces genuinely-actionable flags first instead of a wall of
  // near-identical "check-in is 8d old · stale data" cards.
  const [staleOpen, setStaleOpen] = useState(false);
  const router = useRouter();

  // ── Inspector selection helpers ─────────────────────────────────────────
  const handleRowClick = useCallback((playerId: string) => {
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedPlayerId(null);
  }, []);

  // ── Action routing from inspector ───────────────────────────────────────
  const handleInspectorAction = useCallback(
    (action: ActionRailAction, playerId: string) => {
      const profileBase = `/baseball/dashboard/players/${playerId}`;
      const performBase = `/baseball/dashboard/performance/players/${playerId}`;
      switch (action) {
        case 'modify_lift':
          router.push(performBase);
          break;
        case 'add_note':
          router.push(profileBase);
          break;
        case 'add_followup':
          router.push(profileBase);
          break;
        default:
          router.push(profileBase);
      }
      setSelectedPlayerId(null);
    },
    [router],
  );

  const handleMarkLimited = useCallback(
    (playerId: string) => {
      router.push(`/baseball/dashboard/players/${playerId}`);
      setSelectedPlayerId(null);
    },
    [router],
  );

  // ── Selected player data ────────────────────────────────────────────────
  const selectedBoardRow = useMemo(
    () => (selectedPlayerId ? (board.find((b) => b.player_id === selectedPlayerId) ?? null) : null),
    [board, selectedPlayerId],
  );

  const selectedReadiness = useMemo(
    () => (selectedPlayerId ? (readiness.find((r) => r.player_id === selectedPlayerId) ?? null) : null),
    [readiness, selectedPlayerId],
  );

  // ── KPI / board / queue derivations (hoisted above early return per Rules of Hooks) ──
  const kpiItems: KPIContentsItem[] = useMemo(
    () => [
      { label: 'Today completion', value: kpis.today_completion_pct, unit: '%', emphasis: kpis.today_completion_pct >= 80 },
      { label: 'Missed lifts', value: kpis.missed_lifts },
      { label: 'Readiness risk', value: kpis.readiness_risk },
      { label: 'New PRs', value: kpis.new_prs, leader: kpis.new_prs > 0 },
      { label: 'Pitcher red flags', value: kpis.pitcher_red_flags },
      { label: 'Load mods pending', value: kpis.load_modifications_pending },
      { label: 'Bodyweight alerts', value: kpis.bodyweight_alerts },
    ],
    [kpis],
  );

  const filteredBoard = useMemo(
    () => (statusFilter === 'all' ? board : board.filter((b) => b.session.status === statusFilter)),
    [board, statusFilter],
  );

  // Readiness queue: only the rows that need a decision (not green / no-checkin).
  const queue = useMemo(
    () =>
      readiness
        .filter((r) => r.band !== 'green')
        .sort((a, b) => bandRank(b.band) - bandRank(a.band)),
    [readiness],
  );

  // Split into actionable (fresh) flags vs stale check-ins. The stale group is
  // dominated by identical "8d+ old, low-confidence" rows and gets collapsed.
  const freshQueue = useMemo(() => queue.filter((r) => !r.stale), [queue]);
  const staleQueue = useMemo(() => queue.filter((r) => r.stale), [queue]);
  const boardEmpty = board.length === 0;
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    [],
  );

  const renderQueueRow = (r: BaseballReadinessComputation) => {
    const isSelected = selectedPlayerId === r.player_id;
    return (
      <li key={r.player_id}>
        {/* A bespoke tappable Paper tile (not `<Button>`) — `pressableClass`
            owns the press/hover physics per the interaction-layer doctrine
            (motion.ts §7.1); `role="button"` + a manual Enter/Space handler
            keeps it keyboard-operable, mirroring `PlayerRowPlate`'s onClick
            row shape. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleRowClick(r.player_id)}
          onKeyDown={activateOnEnterOrSpace(() => handleRowClick(r.player_id))}
          aria-pressed={isSelected}
          aria-label={`Inspect ${playerNameById[r.player_id] ?? 'player'}`}
          className={cn(
            'w-full rounded-fw-md border p-3 text-left',
            pressableClass({ ink: 'team' }),
            isSelected ? 'border-grade-plus bg-grade-plus/[0.06]' : 'border-[color:var(--hairline)]',
          )}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <span className={cn('font-annual text-body-lg', isSelected ? 'text-grade-plus' : 'text-text-primary')}>
              {playerNameById[r.player_id] ?? 'Player'}
            </span>
            <BandChip band={r.band} />
          </div>
          {r.reasons.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc font-annual text-body-sm text-text-secondary">
              {r.reasons.slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          {r.suggested_action && (
            <p className="mt-1.5 font-annual text-body-sm font-medium text-text-primary">→ {r.suggested_action}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            <span>Confidence: {r.confidence}</span>
            {r.stale && <span className={GRADE_TEXT_CLASS.low}>· stale data</span>}
            {r.missing_inputs.length > 0 && <span>· missing: {r.missing_inputs.join(', ')}</span>}
          </div>
        </div>
      </li>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading command center…">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-[1.5px] w-full" />
            </div>
          ))}
        </div>
        {/* Board + queue skeleton */}
        <div className="grid gap-6 lg:grid-cols-3">
          <PaperCard className="space-y-4 p-5 lg:col-span-2">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton variant="circular" className="h-8 w-8 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </PaperCard>
          <PaperCard className="space-y-4 p-5">
            <Skeleton className="h-5 w-48" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-fw-md" />
              ))}
            </div>
          </PaperCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Masthead ────────────────────────────────────────────────────── */}
      <SectionMasthead
        eyebrow="THE PRESSBOX · WEIGHT ROOM"
        title="Performance"
        ink="team"
        actions={
          <Button asChild variant="primary" size="sm" leftIcon={<IconActivity size={16} />}>
            <Link href="/baseball/dashboard/performance/live">Live Weight Room</Link>
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow ink="muted">
            {teamName} · {trainingWeekLabel} · {todayLabel}
          </Eyebrow>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" leftIcon={<IconClipboardList size={16} />}>
              <Link href="/baseball/dashboard/performance/programs">Programs</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" leftIcon={<IconUsers size={16} />}>
              <Link href="/baseball/dashboard/performance/groups">Groups</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" leftIcon={<IconLayers size={16} />}>
              <Link href="/baseball/dashboard/performance/builder">Builder</Link>
            </Button>
          </div>
        </div>
      </SectionMasthead>

      {/* ── KPI strip: the real numbers, on a green rule ───────────────── */}
      <div>
        <KPIContentsStrip items={kpiItems} columns={4} />
        <p className="mt-3 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          {kpis.today_completed}/{kpis.today_total} sessions completed today
        </p>
      </div>

      <div className={cn('grid gap-6', boardEmpty ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>
        {/* Today Weight Room board */}
        <div className={boardEmpty ? undefined : 'lg:col-span-2'}>
          <PaperCard className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <Eyebrow ink="team">Today Weight Room</Eyebrow>
                <p className="mt-1 font-annual text-body-sm text-text-secondary">
                  Who is lifting, status, readiness, and the main lift.
                </p>
              </div>
              <NativeSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm"
                aria-label="Filter board by session status"
              >
                <option value="all">All statuses</option>
                {Object.entries(SESSION_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <HairlineRule ink="team" className="mb-2" />

            {board.length === 0 ? (
              <EmptyIssue
                variant="today"
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/baseball/dashboard/performance/programs">Open programs</Link>
                  </Button>
                }
              />
            ) : filteredBoard.length === 0 ? (
              <EmptyIssue
                variant="generic"
                action={
                  <Button variant="secondary" size="sm" onClick={() => setStatusFilter('all')}>
                    Show all statuses
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[560px]">
                  {filteredBoard.map((b, i) => (
                    <Reveal key={b.session.id} staggerIndex={Math.min(i, 10)}>
                      <WeightRoomRow row={b} readinessWithheld={readinessWithheld} />
                    </Reveal>
                  ))}
                </div>
              </div>
            )}
          </PaperCard>
        </div>

        {/* Readiness & availability queue */}
        <div>
          <PaperCard className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Eyebrow ink="team">Readiness queue</Eyebrow>
              {!readinessWithheld && queue.length > 0 ? (
                <span className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                  Click a row to inspect
                </span>
              ) : null}
            </div>
            <p className="mb-4 font-annual text-body-sm text-text-secondary">
              Operational review only — not a medical assessment.
            </p>
            <HairlineRule ink="team" className="mb-4" />

            {readinessWithheld ? (
              <EmptyIssue
                variant="generic"
                action={
                  <p className="font-annual text-body-sm text-text-secondary">
                    You need the readiness-view capability to see soreness, sleep, and availability.
                  </p>
                }
              />
            ) : queue.length === 0 ? (
              <EmptyIssue
                variant="generic"
                action={
                  <p className="font-annual text-body-sm text-text-secondary">
                    All clear — no athletes flagged for review today.
                  </p>
                }
              />
            ) : (
              <div className="space-y-3">
                {freshQueue.length > 0 ? (
                  <ul className="space-y-3">{freshQueue.map(renderQueueRow)}</ul>
                ) : (
                  staleQueue.length > 0 && (
                    <p className="rounded-fw-md border border-[color:var(--hairline)] px-3 py-2.5 font-annual text-body-sm leading-relaxed text-text-secondary">
                      No fresh flags today. The check-ins below are just out of date — nudge these
                      athletes to re-report.
                    </p>
                  )
                )}

                {staleQueue.length > 0 && (
                  <div className="rounded-fw-md border border-[color:var(--hairline)]">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setStaleOpen((o) => !o)}
                      onKeyDown={activateOnEnterOrSpace(() => setStaleOpen((o) => !o))}
                      aria-expanded={staleOpen}
                      className={cn(
                        'flex w-full items-center justify-between rounded-fw-md px-3 py-2.5 text-left',
                        pressableClass({ ink: 'team' }),
                      )}
                    >
                      <span className="font-annual text-body-sm font-medium text-text-primary">
                        {staleQueue.length} athlete{staleQueue.length === 1 ? '' : 's'} with stale
                        check-ins (8d+)
                      </span>
                      <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus">
                        {staleOpen ? 'Hide' : 'Review'}
                      </span>
                    </div>
                    {staleOpen && <ul className="space-y-3 p-3 pt-0">{staleQueue.map(renderQueueRow)}</ul>}
                  </div>
                )}
              </div>
            )}
          </PaperCard>
        </div>
      </div>

      {/* ── Player Inspector panel (slide-in drawer, reused verbatim) ────── */}
      <AnimatePresence>
        {selectedPlayerId && (
          <PlayerInspectorPanel
            key={selectedPlayerId}
            playerId={selectedPlayerId}
            playerName={playerNameById[selectedPlayerId] ?? 'Player'}
            position={selectedBoardRow?.primary_position ?? null}
            boardRow={selectedBoardRow}
            readiness={selectedReadiness}
            readinessWithheld={readinessWithheld}
            canManageLifting={canManageLifting}
            canModifyAvailability={canModifyAvailability}
            onClose={handleCloseInspector}
            onAction={handleInspectorAction}
            onMarkLimited={handleMarkLimited}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function bandRank(band: BaseballReadinessBand): number {
  switch (band) {
    case 'red': return 5;
    case 'orange_lower':
    case 'orange_upper': return 4;
    case 'blue': return 3;
    case 'yellow': return 2;
    case 'green': return 1;
  }
}

/** Enter/Space activation for a `role="button"` div (kit-atom tappable tiles
 *  use `pressableClass`, not `<Button>`, so they need this themselves —
 *  mirrors `PlayerRowPlate`'s own `handleKey`). */
function activateOnEnterOrSpace(onActivate: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  };
}
