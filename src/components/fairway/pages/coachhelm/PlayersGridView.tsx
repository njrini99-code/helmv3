'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · PlayersGridView — the "Players" tab INSTRUMENT ROSTER
 * ----------------------------------------------------------------------------
 * The coach Development surface, re-homed as the CoachHelm "Players" tab in the
 * flat-Apple language (matching FairwayEffectiveness): a roster-health HEADER
 * INSTRUMENT (a ranked cluster on flat matte panels) that leads the surface, then
 * the player roster as a LEGIBLE MATTE DataTable, and the focus-areas board on a
 * flat InstrumentPanel hosting the shared FocusAreaCard vocabulary.
 *
 * ── THE HEADER INSTRUMENT (roster health, ranked, live) ─────────────────────
 *   PRIMARY (focal) — a FLAT big-number readout of DEVELOPMENT COVERAGE (share
 *     of the roster carrying an active focus area). Dims to "awaiting roster"
 *     with no players. No gauge, no needle, no arc.
 *   SECONDARY rail — the OUTCOME MIX SegmentBar (improved / no change / worsened
 *     from recorded focus-area outcomes — the closed-loop payoff) over a recorded-
 *     outcomes Readout. Honest "awaiting outcomes" until a verdict is captured.
 *   TERTIARY foot row — micro Readouts: players on roster, active focus areas,
 *     completed focus areas, players with recent rounds.
 *
 * Dense data stays MATTE + legible: the roster table is a bordered Surface; the
 * header + focus-areas bezel are flat matte panels.
 *
 * PRESERVE + IMPORT UNCHANGED (blueprint consumesLoaders):
 *   src/app/golf/actions/development.ts
 *     · createFocusArea, updateFocusArea, completeFocusArea, updateFocusAreaProgress
 *     · recordFocusAreaOutcome (closes the effectiveness write loop)
 *   src/components/fairway/pages/coachhelm/areaTypes.ts (shared 8-AREA_TYPES + auto-fill)
 *
 * OUTCOME CAPTURE (live): FocusAreaCard role="coach" gets the recordFocusAreaOutcome
 * control (Improved / No change / Worsened) threaded through handleRecordOutcome.
 *
 * ACCEPTS the same props the development route fetches (players, focusAreas,
 * coachId, playerStats) — only the per-player stats SOURCE swaps to the cache in
 * the route fork (perf fix); this presentation reads whatever stats it is given.
 *
 * This is a PRESENTATION + LAYOUT rebuild — every handler, the form lifecycle,
 * the create/edit ModalShell, the areaTypes auto-fill, and all five development.ts
 * actions are imported + called UNCHANGED. A starved instrument reads as a dim
 * "awaiting signal — N of M", never a fabricated 0.
 *
 * ADDITIVE ONLY — imported by nothing live until the route fork; renders inside a
 * `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CoachHelmShell } from './CoachHelmShell';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';
import { GoalsSection } from './GoalsSection';
import { CausalWhyPanel } from './CausalWhyPanel';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import type { FairwayGoalCardData } from './FairwayGoalCard';
import {
  AREA_TYPES,
  getAreaType,
  getProgressPercent,
  getAreaAutoFill,
  type AreaAutoFillStats,
} from './areaTypes';
import { Inset } from '@/components/fairway/surfaces';
import {
  // The instrument cockpit kit — the warm-glass hero header (matches
  // FairwayEffectiveness): ranked cluster, frosted bezels, honest big readouts.
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  SegmentBar,
  type SegmentBarPart,
} from '@/components/fairway';
import {
  DataTable,
  type ColumnDef,
} from '@/components/fairway/data-table';
import { Avatar } from '@/components/fairway/controls/avatar';
import { Button } from '@/components/fairway/controls/button';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Badge } from '@/components/fairway/controls/badge';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import {
  FormSection,
  FormField,
  Input,
  TextArea,
  Select,
  NumberField,
} from '@/components/fairway/forms';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { Target as LucideTarget } from 'lucide-react';
import { IconPlus, IconChevronRight } from '@/components/icons';
import {
  createFocusArea,
  updateFocusArea,
  completeFocusArea,
  deleteFocusArea,
  updateFocusAreaProgress,
  recordFocusAreaOutcome,
  type FocusAreaOutcome,
} from '@/app/golf/actions/development';

/* ---------------------------------------------------------------------------
 * Props — mirror the development route's loader output EXACTLY
 * ------------------------------------------------------------------------- */

export interface PlayersGridPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  hometown: string | null;
  state: string | null;
}

export interface PlayersGridFocusArea extends FocusAreaCardData {
  player_id: string;
  coach_id?: string | null;
  player?: PlayersGridPlayer | null;
}

export interface PlayersGridStats {
  rounds_played: number;
  avg_score: number | null;
  avg_putts: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  best_score: number | null;
  recent_trend: 'improving' | 'declining' | 'stable' | null;
  /** Optional recent scoring series (oldest→newest) for the inline Sparkline. */
  score_series?: number[] | null;
}

export interface PlayersGridViewProps {
  players: PlayersGridPlayer[];
  focusAreas: PlayersGridFocusArea[];
  coachId: string;
  playerStats: Record<string, PlayersGridStats>;
  /** SSR-known urgent/high open-signal count for the shell badge. */
  signalCount?: number | null;
  /**
   * v3 GOALS (redesign fork ONLY, read-only): each player's assigned/shared
   * ACTIVE goals, each composed with its live standing snapshot. Drives the
   * roster "Goals" count column + the scoped per-player GoalsSection cards.
   * Coaches do not create/accept goals here (they assign via the focus-area
   * flow) — so GoalsSection is mounted role="coach", canCreate={false},
   * suggestions={[]}.
   */
  goalsByPlayer?: Record<string, FairwayGoalCardData[]>;
  /** Owning-player display name keyed by player_id (coach goal-card labels). */
  playerNameById?: Record<string, string>;
  /**
   * Deduped + ranked causal-engine relationships keyed by player_id ("why their
   * scores move"). Read by the route via getTeamCausalRelationships(teamId)
   * inside the redesign fork. Surfaced in the scoped per-player Focus-areas view;
   * a player absent from the map (or with []) renders CausalWhyPanel's honest
   * empty state. Defaults to {} so the route may omit it during incremental wiring.
   */
  causalByPlayer?: Record<string, CausalRelationshipRow[]>;
  /** Load error from the route (honest error state, distinct from empty). */
  loadError?: string | null;
  /**
   * F133: deep-link target. Coach surfaces (FairwayPlayerInsight, GenomeDetailView)
   * link to `/golf/dashboard/development?player=<id>` to land scoped to one player.
   * The route validates the id against the team roster and passes it here so the
   * grid opens on that player instead of silently ignoring the param.
   */
  initialSelectedPlayerId?: string | null;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Form state (verbatim shape from development-client.tsx)
 * ------------------------------------------------------------------------- */

interface FocusAreaForm {
  player_id: string;
  area_type: string;
  title: string;
  description: string;
  target_metric: string;
  current_value: string;
  target_value: string;
}

const EMPTY_FORM: FocusAreaForm = {
  player_id: '',
  area_type: 'driving',
  title: '',
  description: '',
  target_metric: '',
  current_value: '',
  target_value: '',
};

const AREA_OPTIONS = AREA_TYPES.map((a) => ({ value: a.value, label: a.label }));

function playerName(p?: PlayersGridPlayer | null): string {
  if (!p) return 'Player';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

/** Plain-English trend display for the roster row (real recent_trend, not a
 *  fabricated series). Lower scores are better, so "declining" is the warning. */
const TREND_DISPLAY: Record<
  'improving' | 'declining' | 'stable',
  { label: string; cls: string; arrow: string }
> = {
  improving: { label: 'Improving', cls: 'text-fw-success', arrow: '↗' },
  declining: { label: 'Declining', cls: 'text-fw-warning', arrow: '↘' },
  stable: { label: 'Steady', cls: 'text-text-tertiary', arrow: '→' },
};

/* ---------------------------------------------------------------------------
 * Per-player roster row (one player + their stat snapshot)
 * ------------------------------------------------------------------------- */

interface RosterRow {
  player: PlayersGridPlayer;
  stats: PlayersGridStats | undefined;
  activeCount: number;
  completedCount: number;
}

/** A roster row flagged for coach triage, with a ranked priority + plain reason. */
interface NeedRow {
  row: RosterRow;
  priority: number;
  reason: string;
}

/* ---------------------------------------------------------------------------
 * PlayersGridView
 * ------------------------------------------------------------------------- */

export function PlayersGridView({
  players,
  focusAreas,
  coachId,
  playerStats,
  signalCount,
  goalsByPlayer = {},
  playerNameById = {},
  causalByPlayer = {},
  loadError,
  initialSelectedPlayerId = null,
  className,
}: PlayersGridViewProps) {
  const router = useRouter();

  // F133: seed from the ?player= deep-link (route-validated) so a coach arriving
  // from a player's insight/genome card lands scoped to that player.
  const [selectedPlayerId, setSelectedPlayerId] = React.useState<string | null>(initialSelectedPlayerId);
  // "grid" = roster table; "areas" = the flat focus-area board. Local view-state
  // only (no data wiring change). Default "grid" — but when we arrive on a
  // ?player= deep-link, open straight on the SCOPED "areas" view so the surface
  // actually matches the "Showing <name>" chip (F133 contract); landing on the
  // full roster while claiming a single player is a data lie.
  const [view, setView] = React.useState<'grid' | 'areas'>(
    initialSelectedPlayerId ? 'areas' : 'grid',
  );

  // Modal + form state — same lifecycle as the legacy client, re-skinned chrome.
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlayersGridFocusArea | null>(null);
  const [form, setForm] = React.useState<FocusAreaForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [completingId, setCompletingId] = React.useState<string | null>(null);

  // Log-progress dialog — a focused Fairway ModalShell that replaces the
  // off-brand native window.prompt. The write wiring (updateFocusAreaProgress)
  // is unchanged; only the value-capture UI is re-skinned.
  const [logTarget, setLogTarget] = React.useState<FocusAreaCardData | null>(null);
  const [logValue, setLogValue] = React.useState<number | null>(null);
  // Optional coach note on the bump — required for the progress_notes append that
  // feeds the per-area Sparkline (updateFocusAreaProgress only appends with a note).
  const [logNote, setLogNote] = React.useState('');
  const [logSaving, setLogSaving] = React.useState(false);

  // Delete-focus-area dialog — a forced-choice destructive confirm (the action
  // layer + legacy UI both have delete; the redesign restores the affordance).
  const [deleteTarget, setDeleteTarget] = React.useState<FocusAreaCardData | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  /* ---- derived ---- */

  const rosterRows: RosterRow[] = React.useMemo(
    () =>
      players.map((player) => {
        const areas = focusAreas.filter((fa) => fa.player_id === player.id);
        return {
          player,
          stats: playerStats[player.id],
          activeCount: areas.filter(
            (a) => a.status === 'active' || a.status === 'in_progress',
          ).length,
          completedCount: areas.filter((a) => a.status === 'completed').length,
        };
      }),
    [players, focusAreas, playerStats],
  );

  const visibleAreas = React.useMemo(
    () =>
      selectedPlayerId
        ? focusAreas.filter((fa) => fa.player_id === selectedPlayerId)
        : focusAreas,
    [focusAreas, selectedPlayerId],
  );

  /* ---- roster-health header metrics (derived from the SAME props; no new
         fetch). Honest counts only — a starved instrument dims, never fakes. -- */
  const rosterHealth = React.useMemo(() => {
    const totalPlayers = players.length;

    // Players carrying at least one active/in-progress focus area → coverage.
    const playersWithActive = new Set(
      focusAreas
        .filter((fa) => fa.status === 'active' || fa.status === 'in_progress')
        .map((fa) => fa.player_id),
    ).size;

    const activeAreas = focusAreas.filter(
      (fa) => fa.status === 'active' || fa.status === 'in_progress',
    ).length;
    const completedAreas = focusAreas.filter((fa) => fa.status === 'completed').length;

    // Players with at least one recorded round (props-fed stats; no recompute).
    const playersWithRounds = players.filter(
      (p) => (playerStats[p.id]?.rounds_played ?? 0) > 0,
    ).length;

    // Recorded focus-area outcomes → the closed-loop payoff (verbatim verdicts).
    const outcomeTally = focusAreas.reduce(
      (acc, fa) => {
        switch (fa.outcome_status) {
          case 'improved':
            acc.improved += 1;
            break;
          case 'no_change':
            acc.noChange += 1;
            break;
          case 'worsened':
            acc.worsened += 1;
            break;
          default:
            break;
        }
        return acc;
      },
      { improved: 0, noChange: 0, worsened: 0 },
    );

    return {
      totalPlayers,
      playersWithActive,
      coverage: totalPlayers > 0 ? playersWithActive / totalPlayers : 0,
      activeAreas,
      completedAreas,
      playersWithRounds,
      outcomeTally,
      totalOutcomes:
        outcomeTally.improved + outcomeTally.noChange + outcomeTally.worsened,
    };
  }, [players, focusAreas, playerStats]);

  /* ---- coach triage: who needs a look, ranked. Declining (esp. uncoached)
         first, then players with rounds but no active focus area. Real
         recent_trend + coverage from the SAME props — no new fetch, no fake. -- */
  const needsAttention: NeedRow[] = React.useMemo(() => {
    return rosterRows
      .map((row): NeedRow => {
        const trend = row.stats?.recent_trend ?? null;
        const rounds = row.stats?.rounds_played ?? 0;
        const uncoached = row.activeCount === 0;
        if (trend === 'declining' && uncoached)
          return { row, priority: 3, reason: 'Trending down · no focus area' };
        if (trend === 'declining') return { row, priority: 2, reason: 'Trending down' };
        if (rounds > 0 && uncoached) return { row, priority: 1, reason: 'No focus area yet' };
        return { row, priority: 0, reason: '' };
      })
      .filter((n) => n.priority > 0)
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          (b.row.stats?.avg_score ?? 0) - (a.row.stats?.avg_score ?? 0),
      );
  }, [rosterRows]);

  const selectedPlayer = selectedPlayerId
    ? players.find((p) => p.id === selectedPlayerId) ?? null
    : null;

  /* ---- create / edit handlers (logic preserved) ---- */

  function openCreate(playerId?: string) {
    setForm({ ...EMPTY_FORM, player_id: playerId ?? selectedPlayerId ?? '' });
    setEditing(null);
    setCreateOpen(true);
  }

  function openEdit(fa: FocusAreaCardData) {
    const row = fa as PlayersGridFocusArea;
    setEditing(row);
    setForm({
      player_id: row.player_id,
      area_type: row.area_type || 'driving',
      title: row.title || '',
      description: row.description || '',
      target_metric: row.target_metric || '',
      current_value: row.current_value?.toString() || '',
      target_value: row.target_value?.toString() || '',
    });
    setCreateOpen(true);
  }

  // Area-type change → suggested metric + auto-filled current value (VERBATIM
  // logic, now routed through the shared getAreaAutoFill from areaTypes.ts).
  function onAreaTypeChange(areaType: string) {
    const stats = playerStats[form.player_id] as AreaAutoFillStats | undefined;
    const { suggestedMetric, autoCurrentValue } = getAreaAutoFill(areaType, stats);
    setForm((prev) => ({
      ...prev,
      area_type: areaType,
      target_metric: suggestedMetric,
      current_value: autoCurrentValue,
    }));
  }

  // Player change → re-run the SAME auto-fill for the currently-selected area
  // against the NEW player's stats. Without this, picking Area first then
  // changing Player leaves current_value / target_metric stale for the prior
  // player (the snapshot strip would also disagree with the numeric fields).
  // Editing locks the player Select, so this only runs in the create flow.
  function onPlayerChange(playerId: string) {
    const stats = playerStats[playerId] as AreaAutoFillStats | undefined;
    setForm((prev) => {
      const { suggestedMetric, autoCurrentValue } = getAreaAutoFill(prev.area_type, stats);
      return {
        ...prev,
        player_id: playerId,
        target_metric: suggestedMetric,
        current_value: autoCurrentValue,
      };
    });
  }

  async function handleSave() {
    if (!form.player_id || !form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        area_type: form.area_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        target_metric: form.target_metric.trim() || null,
        current_value: form.current_value ? parseFloat(form.current_value) : null,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
      };

      const res = editing
        ? await updateFocusArea(editing.id, payload)
        : await createFocusArea({
            player_id: form.player_id,
            coach_id: coachId,
            ...payload,
          });

      if (res.success) {
        fairwayToast.success(editing ? 'Focus area updated' : 'Focus area created');
        setCreateOpen(false);
        setEditing(null);
        setForm(EMPTY_FORM);
        router.refresh();
      } else {
        fairwayToast.error(res.error ?? 'Could not save focus area');
      }
    } catch {
      fairwayToast.error('Could not save focus area');
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(fa: FocusAreaCardData) {
    setCompletingId(fa.id);
    try {
      const res = await completeFocusArea(fa.id);
      if (res.success) {
        fairwayToast.success('Focus area marked complete');
        router.refresh();
      } else {
        fairwayToast.error(res.error ?? 'Could not complete focus area');
      }
    } catch {
      fairwayToast.error('Could not complete focus area');
    } finally {
      setCompletingId(null);
    }
  }

  // Log progress: opens a focused Fairway dialog (the lightweight bump — the
  // full editor lives in the edit modal). Prefills the current value so the
  // coach edits from where they are; the write happens in submitLogProgress.
  function handleLogProgress(fa: FocusAreaCardData) {
    setLogTarget(fa);
    setLogValue(fa.current_value ?? null);
    setLogNote('');
  }

  // PRESERVED: identical updateFocusAreaProgress(id, value) call the native
  // prompt fired — now with the value from the dialog's NumberField PLUS an
  // optional note. A note is what makes updateFocusAreaProgress append a
  // progress_notes entry, which is the source the per-area Sparkline reads — so
  // passing it here lets coach-logged progress actually populate the trend chart.
  async function submitLogProgress() {
    if (!logTarget || logSaving) return;
    if (logValue == null || !Number.isFinite(logValue)) {
      fairwayToast.error('Enter a number to log progress');
      return;
    }
    setLogSaving(true);
    try {
      const trimmedNote = logNote.trim();
      const res = await updateFocusAreaProgress(
        logTarget.id,
        logValue,
        trimmedNote ? { note: trimmedNote } : undefined,
      );
      if (res.success) {
        fairwayToast.success('Progress logged');
        setLogTarget(null);
        setLogNote('');
        router.refresh();
      } else {
        fairwayToast.error(res.error ?? 'Could not log progress');
      }
    } catch {
      fairwayToast.error('Could not log progress');
    } finally {
      setLogSaving(false);
    }
  }

  // Delete a focus area — arms the forced-choice confirm; the write runs in
  // confirmDelete (mirrors the legacy ConfirmDialog + deleteFocusArea wiring).
  function handleDelete(fa: FocusAreaCardData) {
    setDeleteTarget(fa);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await deleteFocusArea(deleteTarget.id);
      if (res.success) {
        fairwayToast.success('Focus area deleted');
        setDeleteTarget(null);
        router.refresh();
      } else {
        fairwayToast.error(res.error ?? 'Could not delete focus area');
      }
    } catch {
      fairwayToast.error('Could not delete focus area');
    } finally {
      setDeleting(false);
    }
  }

  // Record outcome: credits the source insight + completes the focus area
  // (closes the CoachHelm effectiveness loop). The card owns the toast; we just
  // perform the write and refresh on success so the card reflects the verdict.
  async function handleRecordOutcome(fa: FocusAreaCardData, outcome: FocusAreaOutcome) {
    const res = await recordFocusAreaOutcome(fa.id, outcome);
    if (res.success) router.refresh();
    return res;
  }

  /* ---- roster table columns ---- */

  const columns = React.useMemo<ColumnDef<RosterRow, unknown>[]>(
    () => [
      {
        id: 'player',
        header: 'Player',
        cell: ({ row }) => {
          const p = row.original.player;
          return (
            <div className="flex items-center gap-3">
              <Avatar src={p.avatar_url} name={playerName(p)} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-fw-sans font-medium text-text-primary">
                  {playerName(p)}
                </p>
                <p className="font-fw-sans text-eyebrow text-text-tertiary">
                  {p.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : ''}
                  {p.handicap != null
                    ? `${p.graduation_year ? ' · ' : ''}${p.handicap < 0 ? '+' : ''}${Math.abs(p.handicap)} HCP`
                    : ''}
                </p>
              </div>
            </div>
          );
        },
        meta: { noWrap: true },
      },
      {
        id: 'rounds',
        header: 'Rounds',
        accessorFn: (r) => r.stats?.rounds_played ?? 0,
        cell: ({ row }) => (
          <span className="font-fw-mono tabular-nums text-text-secondary">
            {row.original.stats?.rounds_played ?? 0}
          </span>
        ),
        // Lower-priority on phones — hidden < sm so the 6-col roster doesn't force
        // a horizontal scroll on a 360px viewport (the high-signal columns stay).
        meta: {
          align: 'right',
          numeric: true,
          headerClassName: 'hidden sm:table-cell',
          cellClassName: 'hidden sm:table-cell',
        },
      },
      {
        id: 'avg_score',
        header: 'Avg score',
        cell: ({ row }) => {
          const s = row.original.stats;
          return s?.avg_score != null ? (
            <span className="font-fw-mono tabular-nums text-text-primary">{s.avg_score}</span>
          ) : (
            <span className="text-text-tertiary">—</span>
          );
        },
        meta: { align: 'right', numeric: true },
      },
      {
        id: 'trend',
        header: 'Trend',
        cell: ({ row }) => {
          const t = row.original.stats?.recent_trend ?? null;
          if (!t) {
            return <span className="font-fw-sans text-eyebrow text-text-tertiary">—</span>;
          }
          const m = TREND_DISPLAY[t];
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-fw-sans text-caption font-medium',
                m.cls,
              )}
            >
              <span aria-hidden>{m.arrow}</span>
              {m.label}
            </span>
          );
        },
        meta: { align: 'right' },
      },
      {
        id: 'areas',
        header: 'Focus areas',
        cell: ({ row }) => {
          const { activeCount, completedCount } = row.original;
          if (activeCount === 0 && completedCount === 0) {
            return <span className="font-fw-sans text-eyebrow text-text-tertiary">None yet</span>;
          }
          return (
            <div className="flex items-center justify-end gap-1.5">
              {activeCount > 0 ? (
                <Badge tone="accent" size="sm" numeric>
                  {activeCount} active
                </Badge>
              ) : null}
              {completedCount > 0 ? (
                <StatusPill tone="success" size="sm">
                  {completedCount} done
                </StatusPill>
              ) : null}
            </div>
          );
        },
        meta: { align: 'right' },
      },
      {
        // v3 GOALS — count of the player's assigned/shared ACTIVE goals.
        // Mirrors the Focus-areas column's muted-zero / accent-badge treatment.
        id: 'goals',
        header: 'Goals',
        accessorFn: (r) => (goalsByPlayer[r.player.id] ?? []).length,
        cell: ({ row }) => {
          const goalCount = (goalsByPlayer[row.original.player.id] ?? []).length;
          if (goalCount === 0) {
            return <span className="font-fw-sans text-eyebrow text-text-tertiary">None yet</span>;
          }
          return (
            <div className="flex items-center justify-end">
              <Badge tone="accent" size="sm" numeric>
                {goalCount} active
              </Badge>
            </div>
          );
        },
        // Lower-priority on phones — hidden < sm (see Rounds). Player / Avg score /
        // Trend / Focus areas remain the phone-first roster snapshot.
        meta: {
          align: 'right',
          headerClassName: 'hidden sm:table-cell',
          cellClassName: 'hidden sm:table-cell',
        },
      },
      {
        // Per-row NAVIGATE affordance — a trailing chevron that signals the row
        // itself opens the player's scoped focus-area view (recognition over
        // recall, Nielsen #6). The whole row is the click target (DataTable
        // onRowClick); this is the visible "what does clicking do" cue so the
        // affordance isn't buried in the table caption. Not a separate button
        // (the row owns the click) — aria-hidden, so screen readers get the
        // row's role="button" + name, not a duplicate control.
        id: 'view',
        header: () => <span className="sr-only">Open scoped focus areas</span>,
        enableSorting: false,
        cell: () => (
          <span className="flex items-center justify-end text-text-tertiary">
            <IconChevronRight size={16} aria-hidden />
          </span>
        ),
        meta: { align: 'right', cellClassName: 'w-8' },
      },
    ],
    [goalsByPlayer],
  );

  /* ---- header actions ---- */

  const headerActions = (
    <div className="flex items-center gap-2">
      <Segmented
        size="sm"
        value={view}
        onValueChange={(v) => setView(v as 'grid' | 'areas')}
        options={[
          { value: 'grid', label: 'Roster' },
          { value: 'areas', label: 'Focus areas' },
        ]}
        aria-label="Players view"
      />
      <Button
        variant="primary"
        size="sm"
        leftIcon={<IconPlus size={15} />}
        onClick={() => openCreate()}
      >
        New focus area
      </Button>
    </div>
  );

  return (
    <CoachHelmShell
      active="players"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title="Players"
      description="Assign and track measurable development focus areas across your roster."
      actions={headerActions}
      className={className}
    >
      <div className="space-y-6">
        {loadError ? (
          <InlineNotice tone="danger" title="Couldn't load development data">
            {loadError}
          </InlineNotice>
        ) : null}

        {/* ── ROSTER-HEALTH HEADER INSTRUMENT — the hero. A ranked cluster on
              warm glass: coverage gauge focal, outcome-mix rail, micro-readout
              foot row. Reads from the same props (no new fetch). ── */}
        <RosterHealthHeader health={rosterHealth} needs={needsAttention} onAdd={openCreate} />

        {/* Player filter chip strip (selecting a player scopes the areas view). */}
        {selectedPlayer ? (
          <div className="flex items-center gap-3">
            <span className="font-fw-sans text-body-sm text-text-secondary">
              Showing{' '}
              <span className="font-medium text-text-primary">{playerName(selectedPlayer)}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedPlayerId(null)}>
              Clear filter
            </Button>
          </div>
        ) : null}

        {view === 'grid' ? (
          /* ---- ROSTER TABLE (MATTE — dense rows stay legible; glass is for the
                 hero header, not the table). A calm bordered Surface, never glass.
                 A sparse Fraunces section label organizes it. ---- */
          <section aria-label="Team roster" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                Roster · {rosterRows.length} player{rosterRows.length === 1 ? '' : 's'}
              </p>
              <p className="font-fw-sans text-caption text-text-tertiary">
                Tap a player to scope their focus areas
              </p>
            </div>
            {/* The DataTable owns its OWN bordered matte surface (rounded-card +
                border-border-subtle + bg-surface). No outer Surface wrapper —
                wrapping it would nest two bordered/rounded panels (a faint double
                hairline). */}
            <DataTable<RosterRow>
              data={rosterRows}
              columns={columns}
              density="comfortable"
              getRowId={(r) => r.player.id}
              ariaLabel="Team roster with development snapshot"
              onRowClick={(r) => {
                setSelectedPlayerId(r.player.id);
                setView('areas');
              }}
              rowActions={[
                {
                  id: 'add',
                  label: 'Add focus area',
                  icon: <IconPlus size={16} />,
                  onSelect: (r) => openCreate(r.player.id),
                },
                {
                  id: 'genome',
                  label: 'View genome',
                  icon: <IconChevronRight size={16} />,
                  onSelect: (r) => router.push(`/golf/dashboard/coachhelm/genome/${r.player.id}`),
                },
              ]}
              emptyState={
                loadError ? (
                  /* P099 — when the load failed, an empty roster is a SYMPTOM of
                     the failure, not a real "no players" state. Show an honest
                     error empty (the top-of-page InlineNotice carries the detail)
                     instead of the cheerful add-players prompt that would mask it. */
                  <EmptyState
                    icon={LucideTarget}
                    title="Couldn't load the roster"
                    description="We hit an error loading your players. Try refreshing the page."
                  />
                ) : (
                  <EmptyState
                    icon={LucideTarget}
                    title="No players on the active roster"
                    description="Add players to your team to assign development focus areas."
                  />
                )
              }
            />
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {/* ---- v3 GOALS (READ-ONLY) — scoped to the selected player, mounted
                   ABOVE the focus-area board. Coaches view assigned/shared goals
                   here; they assign via the focus-area flow, so canCreate={false}
                   and suggestions={[]} (suggestions are player-facing). The empty
                   state ("No goals assigned yet") is owned by GoalsSection. ---- */}
            {selectedPlayerId ? (
              <GoalsSection
                // eslint-disable-next-line jsx-a11y/aria-role
                role="coach"
                canCreate={false}
                activeGoals={goalsByPlayer[selectedPlayerId] ?? []}
                suggestions={[]}
                playerNameById={playerNameById}
              />
            ) : null}

            {/* ---- WHY THEIR SCORES MOVE — the causal-engine layer, scoped to the
                   selected player. Genuine golf_causal_relationships output,
                   deduped + ranked by the read action. Honest-empty (player with
                   no rows / absent from the map) handled inside CausalWhyPanel. ---- */}
            {selectedPlayerId ? (
              <CausalWhyPanel
                relationships={causalByPlayer?.[selectedPlayerId] ?? []}
                title="Why their scores move"
              />
            ) : null}

            {/* ---- FOCUS-AREA BOARD (on warm glass — the focus-areas hero bezel) ---- */}
            <FocusAreaBoard
              areas={visibleAreas}
              players={players}
              completingId={completingId}
              onEdit={openEdit}
              onComplete={handleComplete}
              onLogProgress={handleLogProgress}
              onDelete={handleDelete}
              onRecordOutcome={handleRecordOutcome}
              onCreate={() => openCreate()}
              showPlayerName={!selectedPlayerId}
            />
          </div>
        )}
      </div>

      {/* ---- CREATE / EDIT MODAL ---- */}
      <FocusAreaModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setEditing(null);
            setForm(EMPTY_FORM);
          }
        }}
        editing={Boolean(editing)}
        form={form}
        setForm={setForm}
        players={players}
        playerStats={playerStats}
        onAreaTypeChange={onAreaTypeChange}
        onPlayerChange={onPlayerChange}
        onSave={handleSave}
        saving={saving}
      />

      {/* ---- LOG-PROGRESS DIALOG (replaces native window.prompt) ---- */}
      <ModalShell
        open={logTarget != null}
        onOpenChange={(o) => {
          if (!o && !logSaving) {
            setLogTarget(null);
            setLogNote('');
          }
        }}
        size="sm"
        title="Log progress"
        description={logTarget?.title || 'Focus area'}
      >
        <ModalShell.Body>
          <div className="space-y-4">
            <FormField
              label={logTarget?.target_metric ? `New value (${logTarget.target_metric})` : 'New value'}
              required
            >
              <NumberField value={logValue} onValueChange={(v) => setLogValue(v)} />
            </FormField>
            {logTarget?.current_value != null ? (
              <p className="font-fw-sans text-caption text-text-tertiary">
                Current{' '}
                <span className="font-fw-mono tabular-nums text-text-secondary">
                  {logTarget.current_value}
                </span>
                {logTarget.target_value != null ? (
                  <>
                    {' · target '}
                    <span className="font-fw-mono tabular-nums text-text-secondary">
                      {logTarget.target_value}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
            {/* Optional note — a note is what makes the write append a
                progress_notes entry, which is the per-area Sparkline's source.
                The helper text makes that cause-and-effect honest. */}
            <FormField
              label="Note"
              showOptional
              help="Add a note to record this point on the progress trend."
            >
              <TextArea
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="e.g. Drilled dispersion on the range — tighter today."
                rows={2}
              />
            </FormField>
          </div>
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button
            variant="ghost"
            onClick={() => {
              setLogTarget(null);
              setLogNote('');
            }}
            disabled={logSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={logSaving}
            disabled={logValue == null}
            onClick={submitLogProgress}
          >
            Save progress
          </Button>
        </ModalShell.Footer>
      </ModalShell>

      {/* ---- DELETE-FOCUS-AREA CONFIRM (forced-choice destructive) ---- */}
      <ModalShell
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteTarget(null);
        }}
        size="sm"
        title="Delete focus area?"
        description={deleteTarget?.title || 'Focus area'}
      >
        <ModalShell.Body>
          <InlineNotice tone="danger" title="This can’t be undone">
            Deleting removes this focus area and its progress history for the
            player. To keep the record, mark it complete instead.
          </InlineNotice>
        </ModalShell.Body>
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Keep focus area
          </Button>
          <Button variant="danger" busy={deleting} onClick={confirmDelete}>
            Delete focus area
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    </CoachHelmShell>
  );
}

/* ---------------------------------------------------------------------------
 * FocusAreaBoard — the flat focus-area grid (active first, completed collapsed)
 * ------------------------------------------------------------------------- */

function FocusAreaBoard({
  areas,
  players,
  completingId,
  onEdit,
  onComplete,
  onLogProgress,
  onDelete,
  onRecordOutcome,
  onCreate,
  showPlayerName,
}: {
  areas: PlayersGridFocusArea[];
  players: PlayersGridPlayer[];
  completingId: string | null;
  onEdit: (fa: FocusAreaCardData) => void;
  onComplete: (fa: FocusAreaCardData) => void;
  onLogProgress: (fa: FocusAreaCardData) => void;
  onDelete: (fa: FocusAreaCardData) => void;
  onRecordOutcome: (
    fa: FocusAreaCardData,
    outcome: FocusAreaOutcome,
  ) => Promise<{ success: boolean; error?: string; notice?: string }>;
  onCreate: () => void;
  showPlayerName: boolean;
}) {
  const byId = React.useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const active = areas.filter((a) => a.status !== 'completed');
  const completed = areas.filter((a) => a.status === 'completed');

  // The board mounts on a warm-glass instrument bezel (the focus-areas hero
  // surface). The FocusAreaCards INSIDE stay matte for legibility — glass frames
  // the hero, the dense cards stay readable.
  if (areas.length === 0) {
    return (
      <InstrumentPanel
        depth="base"
        header="Focus areas"
        padding="lg"
      >
        <EmptyState
          icon={LucideTarget}
          title="No focus areas yet"
          description="Assign a focus area to a player to start tracking measurable progress."
          action={
            // Secondary, not primary — the header already owns the single
            // dominant "New focus area" primary (one obvious CTA per screen).
            <Button variant="secondary" size="sm" leftIcon={<IconPlus size={15} />} onClick={onCreate}>
              New focus area
            </Button>
          }
        />
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel
      depth="base"
      padding="lg"
      header="Focus areas"
      readout={
        <Readout
          value={active.length}
          format={{ maximumFractionDigits: 0 }}
          label="Active"
          size="sm"
          align="end"
          state={active.length > 0 ? 'live' : 'awaiting'}
          samples={active.length === 0 ? { have: 0, need: 1 } : undefined}
          awaitingLabel="None active"
        />
      }
      className="flex flex-col gap-6"
    >
      {active.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {active.map((fa, i) => (
            <FocusAreaCard
              key={fa.id}
              focusArea={fa}
              // eslint-disable-next-line jsx-a11y/aria-role
              role="coach"
              index={i}
              playerName={showPlayerName ? playerName(byId.get(fa.player_id)) : undefined}
              onEdit={onEdit}
              onComplete={onComplete}
              onLogProgress={onLogProgress}
              onDelete={onDelete}
              onRecordOutcome={onRecordOutcome}
              completing={completingId === fa.id}
            />
          ))}
        </div>
      ) : null}

      {completed.length > 0 ? (
        <div className="space-y-3">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            Completed ({completed.length})
          </p>
          <div className="space-y-2">
            {completed.map((fa, i) => (
              <FocusAreaCard
                key={fa.id}
                focusArea={fa}
                // eslint-disable-next-line jsx-a11y/aria-role
                role="coach"
                index={i}
                playerName={showPlayerName ? playerName(byId.get(fa.player_id)) : undefined}
              />
            ))}
          </div>
        </div>
      ) : null}
    </InstrumentPanel>
  );
}

/* ---------------------------------------------------------------------------
 * RosterHealthHeader — the hero instrument cluster (ranked focal → secondary →
 * tertiary). Reads from props-derived rosterHealth ONLY (no new fetch). Honest:
 * a starved figure dims to "awaiting", never a fabricated 0.
 * ------------------------------------------------------------------------- */

interface RosterHealth {
  totalPlayers: number;
  playersWithActive: number;
  coverage: number;
  activeAreas: number;
  completedAreas: number;
  playersWithRounds: number;
  outcomeTally: { improved: number; noChange: number; worsened: number };
  totalOutcomes: number;
}

function RosterHealthHeader({
  health,
  needs,
  onAdd,
}: {
  health: RosterHealth;
  needs: NeedRow[];
  onAdd: (playerId?: string) => void;
}) {
  const {
    totalPlayers,
    playersWithActive,
    activeAreas,
    completedAreas,
    playersWithRounds,
    outcomeTally,
    totalOutcomes,
  } = health;

  // FOCAL — coach triage: WHO needs a look (trending down or uncoached), ranked.
  // The program-coverage stat is demoted to a subtext line; the eye lands on the
  // players, not an abstract percentage. Honest: dims to "awaiting" with no roster.
  const coveredText =
    totalPlayers > 0
      ? `${playersWithActive} of ${totalPlayers} player${totalPlayers === 1 ? '' : 's'} have an active focus area`
      : 'No players on the roster yet';
  const primary = (
    <InstrumentPanel
      depth="raised"
      padding="lg"
      header="Who needs your attention"
      as="section"
      className="flex flex-col gap-4"
    >
      {needs.length > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">
              {needs.length}
            </span>
            <span className="mb-2 font-fw-sans text-body-sm text-text-secondary">
              player{needs.length === 1 ? '' : 's'} to look at — trending down or without a focus area.
            </span>
          </div>
          <ul className="flex flex-col">
            {needs.slice(0, 5).map(({ row, reason }) => (
              <li
                key={row.player.id}
                className="flex items-center gap-3 border-t border-border-subtle py-2.5 first:border-t-0"
              >
                <Avatar src={row.player.avatar_url} name={playerName(row.player)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {playerName(row.player)}
                  </p>
                  <p className="font-fw-sans text-caption font-medium text-fw-warning">{reason}</p>
                </div>
                {row.stats?.avg_score != null ? (
                  <span className="hidden font-fw-mono text-caption tabular-nums text-text-tertiary sm:inline">
                    {row.stats.avg_score} avg
                  </span>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => onAdd(row.player.id)}>
                  Add focus area
                </Button>
              </li>
            ))}
          </ul>
          <span className="font-fw-sans text-caption text-text-tertiary">{coveredText}.</span>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">
            {totalPlayers > 0 ? '0' : '—'}
          </span>
          <span className="font-fw-sans text-body-sm text-text-secondary">
            {totalPlayers > 0
              ? 'Roster’s covered — everyone with rounds has a focus area and no one’s trending down.'
              : 'Awaiting roster — add players to start tracking who needs attention.'}
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">{coveredText}.</span>
        </div>
      )}
    </InstrumentPanel>
  );

  // SECONDARY — the closed-loop outcome mix + a recorded-outcomes readout.
  const outcomeParts: SegmentBarPart[] = [
    { label: 'Improved', value: outcomeTally.improved, tone: 'good' },
    { label: 'No change', value: outcomeTally.noChange, tone: 'neutral' },
    { label: 'Worsened', value: outcomeTally.worsened, tone: 'caution' },
  ];

  const outcomeInstrument =
    totalOutcomes > 0 ? (
      <SegmentBar
        title="Did the coaching land?"
        takeaway={`${totalOutcomes} focus-area outcome${totalOutcomes === 1 ? '' : 's'} recorded across the roster.`}
        parts={outcomeParts}
        primary="good"
      />
    ) : (
      <InstrumentPanel
        depth="base"
        header="Did the coaching land?"
        className="flex h-full flex-col justify-center"
      >
        <Readout
          label="Outcomes recorded"
          size="md"
          state="awaiting"
          samples={{ have: 0, need: 1 }}
          awaitingLabel="Awaiting outcomes"
        />
        <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
          Mark a focus area improved / no change / worsened to start the
          effectiveness loop.
        </p>
      </InstrumentPanel>
    );

  return (
    <InstrumentCluster
      ariaLabel="Roster development health"
      balance="focal"
      tertiaryColumns={4}
      primary={primary}
      secondary={[outcomeInstrument]}
      tertiary={[
        <InstrumentPanel key="players" depth="base" padding="md" className="h-full">
          <Readout
            value={totalPlayers}
            format={{ maximumFractionDigits: 0 }}
            label="Players"
            size="md"
            state={totalPlayers > 0 ? 'live' : 'awaiting'}
            samples={totalPlayers === 0 ? { have: 0, need: 1 } : undefined}
            awaitingLabel="No roster"
          />
        </InstrumentPanel>,
        <InstrumentPanel key="active" depth="base" padding="md" className="h-full">
          <Readout
            value={activeAreas}
            format={{ maximumFractionDigits: 0 }}
            label="Active focus areas"
            size="md"
            state={activeAreas > 0 ? 'live' : 'awaiting'}
            samples={activeAreas === 0 ? { have: 0, need: 1 } : undefined}
            awaitingLabel="None active"
          />
        </InstrumentPanel>,
        <InstrumentPanel key="completed" depth="base" padding="md" className="h-full">
          <Readout
            value={completedAreas}
            format={{ maximumFractionDigits: 0 }}
            label="Completed"
            size="md"
            state={completedAreas > 0 ? 'live' : 'awaiting'}
            samples={completedAreas === 0 ? { have: 0, need: 1 } : undefined}
            awaitingLabel="None yet"
          />
        </InstrumentPanel>,
        <InstrumentPanel key="rounds" depth="base" padding="md" className="h-full">
          <Readout
            value={playersWithRounds}
            format={{ maximumFractionDigits: 0 }}
            label="With recent rounds"
            size="md"
            state={playersWithRounds > 0 ? 'live' : 'awaiting'}
            samples={playersWithRounds === 0 ? { have: 0, need: 1 } : undefined}
            awaitingLabel="No rounds"
          />
        </InstrumentPanel>,
      ]}
    />
  );
}

/* ---------------------------------------------------------------------------
 * FocusAreaModal — shared ModalShell + FormField/FormSection/Select
 * ------------------------------------------------------------------------- */

function FocusAreaModal({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  players,
  playerStats,
  onAreaTypeChange,
  onPlayerChange,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: boolean;
  form: FocusAreaForm;
  setForm: React.Dispatch<React.SetStateAction<FocusAreaForm>>;
  players: PlayersGridPlayer[];
  playerStats: Record<string, PlayersGridStats>;
  onAreaTypeChange: (areaType: string) => void;
  /** Player change → re-run auto-fill for the current area vs the new player. */
  onPlayerChange: (playerId: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const playerOptions = React.useMemo(
    () => players.map((p) => ({ value: p.id, label: playerName(p) })),
    [players],
  );

  const stats = form.player_id ? playerStats[form.player_id] : undefined;
  const area = getAreaType(form.area_type);
  const canSave = Boolean(form.player_id && form.title.trim());

  /* ---- unsaved-changes guard (Nielsen #5 error prevention / #3 user control)
     Snapshot the form when the modal opens; a close attempt (Cancel, Esc, scrim,
     or the top-right close affordance — all route through onOpenChange/Cancel)
     while the form differs from that baseline shows an in-modal "Discard
     changes?" confirm instead of silently dropping the coach's input. ---- */
  const baselineRef = React.useRef<FocusAreaForm>(form);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    // On the closed→open transition, re-baseline to the form we opened with and
    // clear any stale confirm. (Open→closed is owned by the parent's reset.)
    if (open && !wasOpen.current) {
      baselineRef.current = form;
      setConfirmingDiscard(false);
    }
    wasOpen.current = open;
  }, [open, form]);

  const isDirty = React.useMemo(() => {
    const b = baselineRef.current;
    return (
      form.player_id !== b.player_id ||
      form.area_type !== b.area_type ||
      form.title !== b.title ||
      form.description !== b.description ||
      form.target_metric !== b.target_metric ||
      form.current_value !== b.current_value ||
      form.target_value !== b.target_value
    );
  }, [form]);

  // Single close gate: dirty → arm the discard confirm; clean → close for real.
  const requestClose = React.useCallback(() => {
    if (isDirty) {
      setConfirmingDiscard(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange]);

  const discardAndClose = React.useCallback(() => {
    setConfirmingDiscard(false);
    onOpenChange(false);
  }, [onOpenChange]);

  // Honest preview of progress for the chosen target (no fabricated meter).
  const previewPct =
    form.current_value && form.target_value
      ? getProgressPercent(
          parseFloat(form.current_value),
          parseFloat(form.target_value),
          form.target_metric,
        )
      : null;

  return (
    <ModalShell
      open={open}
      onOpenChange={(o) => {
        // Esc / scrim / close-button close requests pass through the guard.
        // Re-opens (o === true) pass straight through to the parent.
        if (o) onOpenChange(true);
        else requestClose();
      }}
      size="lg"
      title={editing ? 'Edit focus area' : 'New focus area'}
      description={
        editing
          ? 'Update the target and details for this development focus area.'
          : 'Assign a measurable development focus area to a player.'
      }
    >
      <ModalShell.Body>
        <div className="space-y-6">
          {/* Player + area */}
          <FormSection title="Assignment">
            <FormField label="Player" required>
              <Select
                placeholder="Select a player…"
                options={playerOptions}
                value={form.player_id || undefined}
                onValueChange={(v) => onPlayerChange(v ?? '')}
                disabled={editing}
              />
            </FormField>

            <FormField label="Focus area" required>
              <Select
                options={AREA_OPTIONS}
                value={form.area_type}
                onValueChange={(v) => v && onAreaTypeChange(v)}
              />
            </FormField>

            {/* Player snapshot — honest stat strip (no recompute; props-fed). */}
            {form.player_id ? (
              <Inset padding="sm" className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid h-8 w-8 flex-shrink-0 place-items-center rounded-fw-sm',
                    'bg-accent-50 text-accent-700',
                  )}
                >
                  <area.icon size={16} />
                </span>
                {stats && stats.rounds_played > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-fw-sans text-eyebrow text-text-secondary">
                    <span>
                      Avg{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.avg_score ?? '—'}
                      </span>
                    </span>
                    <span>
                      Putts{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.avg_putts ?? '—'}
                      </span>
                    </span>
                    <span>
                      FW{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.fairway_pct != null ? `${stats.fairway_pct}%` : '—'}
                      </span>
                    </span>
                    <span>
                      GIR{' '}
                      <span className="font-fw-mono tabular-nums text-text-primary">
                        {stats.gir_pct != null ? `${stats.gir_pct}%` : '—'}
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="font-fw-sans text-eyebrow italic text-text-tertiary">
                    No rounds recorded yet — targets won&apos;t auto-fill.
                  </span>
                )}
              </Inset>
            ) : null}
          </FormSection>

          {/* Details */}
          <FormSection title="Details">
            <FormField label="Title" required>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Tighten driving dispersion"
              />
            </FormField>

            <FormField label="Description" showOptional>
              <TextArea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What should the player focus on, and why?"
                rows={3}
              />
            </FormField>
          </FormSection>

          {/* Target */}
          <FormSection
            title="Measurable target"
            description="Pick a metric and target so progress is trackable (golf metrics like putts/score are lower-is-better)."
          >
            <FormField label="Target metric" showOptional>
              <Input
                value={form.target_metric}
                onChange={(e) => setForm((prev) => ({ ...prev, target_metric: e.target.value }))}
                placeholder={area.suggestedMetrics[0] ?? 'e.g. Fairways Hit %'}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Current value" showOptional>
                <NumberField
                  value={form.current_value === '' ? null : Number(form.current_value)}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, current_value: v == null ? '' : String(v) }))
                  }
                />
              </FormField>
              <FormField label="Target value" showOptional>
                <NumberField
                  value={form.target_value === '' ? null : Number(form.target_value)}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, target_value: v == null ? '' : String(v) }))
                  }
                />
              </FormField>
            </div>

            {previewPct != null ? (
              <p className="font-fw-sans text-eyebrow text-text-tertiary">
                Starting at{' '}
                <Badge tone={previewPct >= 100 ? 'success' : 'neutral'} size="sm" numeric>
                  {previewPct}%
                </Badge>{' '}
                of target.
              </p>
            ) : null}
          </FormSection>
        </div>
      </ModalShell.Body>

      {confirmingDiscard ? (
        <ModalShell.Footer>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              role="alert"
              className="font-fw-sans text-body-sm font-medium text-text-primary"
            >
              Discard your unsaved changes?
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmingDiscard(false)}
                disabled={saving}
              >
                Keep editing
              </Button>
              <Button variant="danger" onClick={discardAndClose} disabled={saving}>
                Discard changes
              </Button>
            </div>
          </div>
        </ModalShell.Footer>
      ) : (
        <ModalShell.Footer>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} disabled={!canSave} onClick={onSave}>
            {editing ? 'Save changes' : 'Create focus area'}
          </Button>
        </ModalShell.Footer>
      )}
    </ModalShell>
  );
}
