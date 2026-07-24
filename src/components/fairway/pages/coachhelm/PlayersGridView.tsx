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
import { type AreaAutoFillStats } from './areaTypes';
import { FocusAreaModal, type FocusAreaModalSubmit } from './FocusAreaModal';
import {
  // The instrument cockpit kit — the warm-glass hero header (matches
  // FairwayEffectiveness): ranked cluster, frosted bezels, honest big readouts.
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  SegmentBar,
  type SegmentBarPart,
  TrendGlyph,
  Sparkline,
  Surface,
  Eyebrow,
} from '@/components/fairway';
import {
  DataTable,
  type ColumnDef,
} from '@/components/fairway/data-table';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Segmented } from '@/components/fairway/controls/segmented';
import { Badge } from '@/components/fairway/controls/badge';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import {
  FormField,
  TextArea,
  NumberField,
} from '@/components/fairway/forms';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ChartNoAxesColumnIncreasing,
  Target as LucideTarget,
} from 'lucide-react';
import { IconPlus, IconChevronRight } from '@/components/icons';
import type { SignalGroup } from '@/lib/coachhelm/signal-grouping';
import {
  createFocusArea,
  updateFocusArea,
  completeFocusArea,
  deleteFocusArea,
  updateFocusAreaProgress,
  recordFocusAreaOutcome,
  reactivateFocusArea,
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
  // ── Extended autofill sources (route widens the cache select; optional so
  //    existing callers stay valid). Consumed by getMetricCurrentValue so the
  //    create-focus-area form can autofill the current value for any metric. ──
  driving_distance?: number | null;
  proximity_to_hole?: number | null;
  scrambling_pct?: number | null;
  up_and_down_pct?: number | null;
  sand_save_pct?: number | null;
  one_putt_pct?: number | null;
  three_putt_pct?: number | null;
  par3_avg?: number | null;
  par4_avg?: number | null;
  par5_avg?: number | null;
}

export interface PlayersGridViewProps {
  players: PlayersGridPlayer[];
  focusAreas: PlayersGridFocusArea[];
  coachId: string;
  playerStats: Record<string, PlayersGridStats>;
  /** Open CoachHelm evidence grouped by player. This is what makes the Players
   *  view an intelligence workflow instead of a generic roster browser. */
  signalGroups?: SignalGroup[];
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
  /**
   * #920 — player_ids whose coach-set alert_posture is 'silent'. That posture
   * makes the CoachHelm confidence gate infinite for the player (see
   * src/app/golf/actions/insights.ts), so the engine keeps running but never
   * surfaces an insight for them — previously invisible anywhere in the coach
   * UI. Drives a small "Insights muted" indicator on the roster row so a
   * coach scanning this table can tell "no signal" apart from "gated shut."
   */
  silentPostureByPlayer?: Record<string, boolean>;
  /** Load error from the route (honest error state, distinct from empty). */
  loadError?: string | null;
  /**
   * F133: deep-link target. Coach surfaces (FairwayPlayerInsight, GenomeDetailView)
   * link to `/golf/dashboard/development?player=<id>` to land scoped to one player.
   * The route validates the id against the team roster and passes it here so the
   * grid opens on that player instead of silently ignoring the param.
   */
  initialSelectedPlayerId?: string | null;
  /** URL-backed nested tab when embedded in the consolidated CoachHelm desk. */
  initialPlayersView?: 'grid' | 'areas';
  /** Keeps the embedded Roster/Focus areas + player scope deep-linkable. */
  onNavigationChange?: (state: { view: 'grid' | 'areas'; playerId: string | null }) => void;
  className?: string;
  /**
   * True when mounted by `PlayersDrill` inside the Brief home's stage
   * `DrillPanel`, which already renders its own back-chip + title chrome.
   * Forwarded to the internally-rendered `CoachHelmShell` to suppress its
   * masthead + sub-nav (see `CoachHelmShell`'s `embedded` prop). Default
   * false — the retired standalone /development redirect (and any other
   * direct mount) is unaffected.
   */
  embedded?: boolean;
}

/* ---------------------------------------------------------------------------
 * Form state (verbatim shape from development-client.tsx)
 * ------------------------------------------------------------------------- */

// The focus-area create/edit form lifecycle now lives in the shared
// FocusAreaModal (coach + player). This view only opens it and persists the
// normalized payload it returns.

function playerName(p?: PlayersGridPlayer | null): string {
  if (!p) return 'Player';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

/* ---------------------------------------------------------------------------
 * Per-player roster row (one player + their stat snapshot)
 * ------------------------------------------------------------------------- */

export interface RosterRow {
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

/** "Who needs your attention" shows only the top N by priority — the big
 *  number stays the HONEST total (`needs.length`), but the list itself was
 *  silently truncated with no indication it was a "top 5", making the
 *  header count and the visible list disagree (observed live: "7 players to
 *  look at" heading a list of 5). Named so the cap and its caption below
 *  can't drift apart. */
const NEEDS_ATTENTION_LIST_CAP = 5;

/* ---------------------------------------------------------------------------
 * PlayersGridView
 * ------------------------------------------------------------------------- */

export function PlayersGridView({
  players,
  focusAreas,
  coachId,
  playerStats,
  signalGroups = [],
  signalCount,
  goalsByPlayer = {},
  playerNameById = {},
  causalByPlayer = {},
  silentPostureByPlayer = {},
  loadError,
  initialSelectedPlayerId = null,
  initialPlayersView,
  onNavigationChange,
  className,
  embedded = false,
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
    initialPlayersView ?? (initialSelectedPlayerId ? 'areas' : 'grid'),
  );

  // Unlike a useState initializer, this also honors browser navigation and
  // same-page shallow URL changes after the embedded view has mounted.
  React.useEffect(() => {
    setSelectedPlayerId(initialSelectedPlayerId);
    setView(initialPlayersView ?? (initialSelectedPlayerId ? 'areas' : 'grid'));
  }, [initialSelectedPlayerId, initialPlayersView]);

  // Modal state — the shared FocusAreaModal owns the form lifecycle + saving.
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlayersGridFocusArea | null>(null);
  /** Player to preselect when opening the create modal (coach prescribe flow). */
  const [createPlayerId, setCreatePlayerId] = React.useState<string>('');
  const [completingId, setCompletingId] = React.useState<string | null>(null);
  // Which completed area is mid-reopen (busy flag for its card's "Reopen" button).
  const [reopeningId, setReopeningId] = React.useState<string | null>(null);

  // Log-progress dialog — a focused Fairway ModalShell that replaces the
  // off-brand native window.prompt. The write wiring (updateFocusAreaProgress)
  // is unchanged; only the value-capture UI is re-skinned.
  const [logTarget, setLogTarget] = React.useState<FocusAreaCardData | null>(null);
  const [logValue, setLogValue] = React.useState<number | null>(null);
  // Optional coach note on the bump — required for the progress_notes append that
  // feeds the per-area Sparkline (updateFocusAreaProgress only appends with a note).
  const [logNote, setLogNote] = React.useState('');
  const [logSaving, setLogSaving] = React.useState(false);
  // Inline range-guard error — ported from the player-side LogProgressDrawer
  // (FairwayMyDevelopment) for parity: a fat-fingered negative or absurd
  // magnitude should surface here, not land in current_value silently.
  const [logValueError, setLogValueError] = React.useState<string | null>(null);

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
  const signalGroupByPlayer = React.useMemo(
    () => new Map(signalGroups.filter((group) => group.playerId).map((group) => [group.playerId as string, group])),
    [signalGroups],
  );

  /* ---- create / edit handlers (the shared modal owns the form) ---- */

  // useCallback (not a plain function) so the roster columns' useMemo — which
  // now calls openCreate from the static row-actions cell (#191/#200) — isn't
  // forced to rebuild every render.
  const openCreate = React.useCallback(
    (playerId?: string) => {
      setEditing(null);
      setCreatePlayerId(playerId ?? selectedPlayerId ?? '');
      setCreateOpen(true);
    },
    [selectedPlayerId],
  );

  function openEdit(fa: FocusAreaCardData) {
    setEditing(fa as PlayersGridFocusArea);
    setCreateOpen(true);
  }

  // The shared modal hands back a normalized payload; the coach surface decides
  // the action: edit an existing area, or PRESCRIBE a new one (the server
  // defaults a coach-created area to 'proposed' for the player to accept).
  async function handleSubmitFocusArea(
    payload: FocusAreaModalSubmit,
  ): Promise<{ success: boolean; error?: string }> {
    const { player_id, ...fields } = payload;
    const res = editing
      ? await updateFocusArea(editing.id, fields)
      : await createFocusArea({ player_id, coach_id: coachId, ...fields });
    if (res.success) router.refresh();
    return res;
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

  // Reopen a completed focus area — the coach-side inverse of handleComplete.
  // Mirrors FairwayMyDevelopment's player-facing handleReopen (same
  // reactivateFocusArea write); the coach previously had NO way to undo a
  // completion from this surface.
  async function handleReopen(fa: FocusAreaCardData) {
    setReopeningId(fa.id);
    try {
      const res = await reactivateFocusArea(fa.id);
      if (res.success) {
        fairwayToast.success('Focus area reopened');
        router.refresh();
      } else {
        fairwayToast.error(res.error ?? 'Could not reopen focus area');
      }
    } catch {
      fairwayToast.error('Could not reopen focus area');
    } finally {
      setReopeningId(null);
    }
  }

  // Log progress: opens a focused Fairway dialog (the lightweight bump — the
  // full editor lives in the edit modal). Prefills the current value so the
  // coach edits from where they are; the write happens in submitLogProgress.
  function handleLogProgress(fa: FocusAreaCardData) {
    setLogTarget(fa);
    setLogValue(fa.current_value ?? null);
    setLogNote('');
    setLogValueError(null);
  }

  // Largest plausible measurement for any tracked golf metric (scores, yards,
  // putts, percentages). Anything beyond this is a fat-finger, not a real value.
  // Ported verbatim from the player-side LogProgressDrawer for parity.
  const LOG_VALUE_MAX = 100_000;

  // PRESERVED: identical updateFocusAreaProgress(id, value) call the native
  // prompt fired — now with the value from the dialog's NumberField PLUS an
  // optional note. A note is what makes updateFocusAreaProgress append a
  // progress_notes entry, which is the source the per-area Sparkline reads — so
  // passing it here lets coach-logged progress actually populate the trend chart.
  async function submitLogProgress() {
    if (!logTarget || logSaving) return;
    if (logValue == null || !Number.isFinite(logValue)) {
      setLogValueError('Enter a number to log progress.');
      return;
    }
    // Range guard — ported from the player-side dialog: reject negatives and
    // absurd magnitudes before the round-trip rather than after.
    if (logValue < 0) {
      setLogValueError('Value can’t be negative — enter 0 or higher.');
      return;
    }
    if (logValue > LOG_VALUE_MAX) {
      setLogValueError(`That looks too large — enter a value up to ${LOG_VALUE_MAX.toLocaleString()}.`);
      return;
    }
    setLogValueError(null);
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
          // Same identity treatment as every other surface; the year · HCP meta
          // is the column's page-specific detail.
          const metaText =
            `${p.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : ''}` +
            `${
              p.handicap != null
                ? `${p.graduation_year ? ' · ' : ''}${p.handicap < 0 ? '+' : ''}${Math.abs(p.handicap)} HCP`
                : ''
            }`;
          return (
            <PlayerIdentity
              name={playerName(p)}
              avatarUrl={p.avatar_url}
              size="sm"
              meta={metaText || undefined}
              nameAddon={
                silentPostureByPlayer[p.id] ? (
                  <Badge
                    tone="neutral"
                    variant="outline"
                    size="sm"
                    title="Alert posture is set to Silent for this player — CoachHelm keeps analyzing but never surfaces an insight. Change it from the Roster page."
                  >
                    Insights muted
                  </Badge>
                ) : undefined
              }
            />
          );
        },
        // minWidth is a real floor — PlayerIdentity's own min-w-0/truncate lets
        // this column ellipsize gracefully, but without a floor the auto-layout
        // table starves it toward that near-zero min-content on a phone while
        // the Rounds/Avg score/Trend/Focus areas columns keep their natural
        // width (audit W1 — mobile name-trunc).
        meta: { noWrap: true, minWidth: 160 },
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
          // Canonical arrow/color primitive (#945) — arrow is ALWAYS the
          // performance direction (up-ish for improving, down-ish for
          // declining), sourced from the SAME `@/lib/coachhelm/trend` map
          // Team Stats' trajectory tile + player cards route through, so a
          // player can never read "Improving" here and "Declining" there.
          return <TrendGlyph direction={t} className="font-fw-sans text-caption font-medium" />;
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
        // Row actions — STATIC, always-visible icon buttons (#191/#200). This
        // used to be DataTable's built-in `rowActions` slot, which is
        // `opacity-0` at rest and only reaches `opacity-100` via
        // `group-hover/row` or `group-focus-within/row` — a mouse-driven
        // reveal with no static affordance for a keyboard-only or
        // screen-reader user scanning the table (the desktop analog of the
        // mobile hover-only bug the W2 fix already solved for RosterPlayerCard
        // below). Rendering them as an ordinary column cell instead means
        // they're always in the accessibility tree AND always painted —
        // reachable by Tab, readable by a screen reader, with no hover or
        // focus-within gate. `stopPropagation` keeps them from also firing the
        // row's own onRowClick.
        id: 'actions',
        header: () => <span className="sr-only">Row actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original.player;
          const name = playerName(p);
          return (
            <div className="flex items-center justify-end gap-1">
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`Add focus area for ${name}`}
                title="Add focus area"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreate(p.id);
                }}
              >
                <IconPlus size={16} aria-hidden />
              </IconButton>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`View ${name}'s genome`}
                title="View genome"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/golf/dashboard/players/${p.id}/genome`);
                }}
              >
                <IconChevronRight size={16} aria-hidden />
              </IconButton>
            </div>
          );
        },
        meta: { align: 'right', cellClassName: 'w-24' },
      },
    ],
    [goalsByPlayer, silentPostureByPlayer, openCreate, router],
  );

  /* ---- roster empty state (shared by the mobile card list + the desktop
         DataTable's own emptyState slot — one definition, two render sites). ---- */
  const rosterEmptyState = loadError ? (
    // P099 — when the load failed, an empty roster is a SYMPTOM of the
    // failure, not a real "no players" state. Show an honest error empty
    // (the top-of-page InlineNotice carries the detail) instead of the
    // cheerful add-players prompt that would mask it.
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
  );

  /* ---- header actions ---- */

  const headerActions = (
    <div className="flex items-center gap-2">
      <Segmented
        size="sm"
        value={view}
        onValueChange={(v) => {
          const nextView = v as 'grid' | 'areas';
          const nextPlayerId = nextView === 'grid' ? null : selectedPlayerId;
          setView(nextView);
          if (nextView === 'grid') setSelectedPlayerId(null);
          onNavigationChange?.({ view: nextView, playerId: nextPlayerId });
        }}
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
      embedded={embedded}
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

        <DevelopmentCommandMap
          health={rosterHealth}
          needs={needsAttention}
          signalGroups={signalGroups}
          focusAreas={focusAreas}
          onAdd={openCreate}
          onOpenPlayer={(playerId) => {
            setSelectedPlayerId(playerId);
            setView('areas');
            onNavigationChange?.({ view: 'areas', playerId });
          }}
        />

        {/* Player filter chip strip (selecting a player scopes the areas view). */}
        {selectedPlayer ? (
          <div className="flex items-center gap-3">
            <span className="font-fw-sans text-body-sm text-text-secondary">
              Showing{' '}
              <span className="font-medium text-text-primary">{playerName(selectedPlayer)}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedPlayerId(null);
                onNavigationChange?.({ view: 'areas', playerId: null });
              }}
            >
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
                Player intelligence · {rosterRows.length} player{rosterRows.length === 1 ? '' : 's'}
              </p>
              <p className="font-fw-sans text-caption text-text-tertiary">
                Evidence → focus → progress → outcome
              </p>
            </div>
            <PlayerIntelligenceGrid
              rows={rosterRows}
              focusAreas={focusAreas}
              goalsByPlayer={goalsByPlayer}
              signalGroupByPlayer={signalGroupByPlayer}
              silentPostureByPlayer={silentPostureByPlayer}
              onOpenPlayer={(playerId) => {
                setSelectedPlayerId(playerId);
                setView('areas');
                onNavigationChange?.({ view: 'areas', playerId });
              }}
              onAddFocusArea={openCreate}
              onViewGame={(playerId) => router.push(`/golf/dashboard/players/${playerId}/game`)}
            />

            <div className="mt-3 hidden items-baseline justify-between gap-3 sm:flex">
              <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">Roster comparison</p>
              <p className="font-fw-sans text-caption text-text-tertiary">Sort the underlying scoring and development measures</p>
            </div>
            {/* MOBILE (< sm) — native player cards: identity + avg score + trend,
                with "Add focus area" / "View genome" as always-visible tap
                targets. A desktop DataTable squeezed to a 390px viewport
                clipped the Focus-status / Add-focus-area / View-genome columns
                off-screen entirely, and DataTable's row actions only reveal on
                hover/focus-within — unreachable without a pointer (audit W2).
                Desktop keeps the dense table (below) unchanged. */}
            <div className="hidden">
              {rosterRows.length === 0 ? (
                <div className="rounded-card border border-border-subtle bg-surface">
                  {rosterEmptyState}
                </div>
              ) : (
                rosterRows.map((row) => (
                  <RosterPlayerCard
                    key={row.player.id}
                    row={row}
                    muted={!!silentPostureByPlayer[row.player.id]}
                    onOpenAreas={() => {
                      setSelectedPlayerId(row.player.id);
                      setView('areas');
                      onNavigationChange?.({ view: 'areas', playerId: row.player.id });
                    }}
                    onAddFocusArea={() => openCreate(row.player.id)}
                    onViewGenome={() =>
                      router.push(`/golf/dashboard/players/${row.player.id}/genome`)
                    }
                  />
                ))
              )}
            </div>

            {/* DESKTOP (sm+) — the dense DataTable. It owns its OWN bordered
                matte surface (rounded-card + border-border-subtle + bg-surface).
                No outer Surface wrapper — wrapping it would nest two
                bordered/rounded panels (a faint double hairline). */}
            <div className="hidden sm:block">
              <DataTable<RosterRow>
                data={rosterRows}
                columns={columns}
                density="comfortable"
                getRowId={(r) => r.player.id}
                ariaLabel="Team roster with development snapshot"
                onRowClick={(r) => {
                  setSelectedPlayerId(r.player.id);
                  setView('areas');
                  onNavigationChange?.({ view: 'areas', playerId: r.player.id });
                }}
                emptyState={rosterEmptyState}
              />
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {selectedPlayer ? (
              <PlayerDevelopmentProfile
                player={selectedPlayer}
                stats={playerStats[selectedPlayer.id]}
                signalGroup={signalGroupByPlayer.get(selectedPlayer.id)}
                focusAreas={visibleAreas}
                goals={goalsByPlayer[selectedPlayer.id] ?? []}
                onAdd={() => openCreate(selectedPlayer.id)}
                onViewGame={() => router.push(`/golf/dashboard/players/${selectedPlayer.id}/game`)}
              />
            ) : null}
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
              reopeningId={reopeningId}
              onEdit={openEdit}
              onComplete={handleComplete}
              onLogProgress={handleLogProgress}
              onDelete={handleDelete}
              onRecordOutcome={handleRecordOutcome}
              onReopen={handleReopen}
              onCreate={() => openCreate()}
              showPlayerName={!selectedPlayerId}
            />
          </div>
        )}
      </div>

      {/* ---- CREATE / EDIT MODAL (shared coach + player component) ---- */}
      <FocusAreaModal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setEditing(null);
        }}
        mode="coach"
        editing={Boolean(editing)}
        players={players.map((p) => ({ id: p.id, name: playerName(p) }))}
        playerStats={playerStats as Record<string, AreaAutoFillStats>}
        playerId={editing ? editing.player_id : createPlayerId}
        initial={
          editing
            ? {
                player_id: editing.player_id,
                area_type: editing.area_type || 'driving',
                title: editing.title || '',
                description: editing.description || '',
                target_metric: editing.target_metric || '',
                current_value: editing.current_value ?? null,
                target_value: editing.target_value ?? null,
                target_kind:
                  editing.target_kind === 'date' || editing.target_kind === 'rounds'
                    ? editing.target_kind
                    : null,
                target_date: editing.target_date || null,
                target_rounds: editing.target_rounds ?? null,
              }
            : undefined
        }
        onSubmit={handleSubmitFocusArea}
      />

      {/* ---- LOG-PROGRESS DIALOG (replaces native window.prompt) ----
          Layout ported from the player-side LogProgressDrawer
          (FairwayMyDevelopment) for parity: current/target readout first,
          then the value field wired to the same range-guard validation. */}
      <ModalShell
        open={logTarget != null}
        onOpenChange={(o) => {
          if (!o && !logSaving) {
            setLogTarget(null);
            setLogNote('');
            setLogValueError(null);
          }
        }}
        size="sm"
        title="Log progress"
        description={logTarget?.title || 'Focus area'}
      >
        <ModalShell.Body>
          <div className="space-y-4">
            {logTarget?.current_value != null ? (
              <div>
                <p className="mb-1.5 block font-fw-sans text-body-sm font-medium text-text-secondary">
                  Current value
                </p>
                <div className="rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 font-fw-sans text-text-primary">
                  <span className="font-fw-mono tabular-nums">{logTarget.current_value}</span>
                  {logTarget.target_value != null ? (
                    <span className="font-normal text-text-tertiary">
                      {' '}
                      / <span className="font-fw-mono tabular-nums">{logTarget.target_value}</span>
                    </span>
                  ) : null}
                  {logTarget.target_metric && (
                    <span className="ml-2 font-fw-sans text-eyebrow text-text-tertiary">
                      {logTarget.target_metric}
                    </span>
                  )}
                </div>
              </div>
            ) : null}
            <FormField
              label={logTarget?.target_metric ? `New value (${logTarget.target_metric})` : 'New value'}
              required
              error={logValueError ?? undefined}
            >
              <NumberField
                value={logValue}
                onValueChange={(v) => {
                  setLogValue(v);
                  if (logValueError) setLogValueError(null);
                }}
              />
            </FormField>
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
              setLogValueError(null);
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
 * CoachHelm Players command surface — evidence → prescription → progress →
 * outcome. These compositions only use route-loaded signals, stats, goals,
 * focus areas, and outcomes; no decorative or invented values.
 * ------------------------------------------------------------------------- */

function DevelopmentCommandMap({
  health,
  needs,
  signalGroups,
  focusAreas,
  onAdd,
  onOpenPlayer,
}: {
  health: RosterHealth;
  needs: NeedRow[];
  signalGroups: SignalGroup[];
  focusAreas: PlayersGridFocusArea[];
  onAdd: (playerId?: string) => void;
  onOpenPlayer: (playerId: string) => void;
}) {
  const signalTotal = signalGroups.reduce((sum, group) => sum + group.signals.length, 0);
  const proposed = focusAreas.filter((area) => area.status === 'proposed').length;
  const active = focusAreas.filter((area) => area.status === 'active' || area.status === 'in_progress').length;
  const outcomes = health.totalOutcomes;
  const coveragePct = Math.round(health.coverage * 100);
  const improvedPct = outcomes > 0 ? Math.round((health.outcomeTally.improved / outcomes) * 100) : null;
  const stages = [
    { label: 'Evidence', value: signalTotal, detail: `${signalGroups.filter((group) => group.playerId).length} players flagged` },
    { label: 'Awaiting player', value: proposed, detail: 'prescriptions pending' },
    { label: 'In progress', value: active, detail: `${health.playersWithActive} players covered` },
    { label: 'Measured', value: outcomes, detail: improvedPct == null ? 'awaiting outcomes' : `${improvedPct}% improved` },
  ];

  return (
    <section aria-label="CoachHelm development command map" className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
      <div className="overflow-hidden rounded-fw-lg border border-accent-700 bg-accent-900 text-white [box-shadow:var(--fw-shadow-raise)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
          <div>
            <p className="font-fw-display text-eyebrow uppercase tracking-[0.16em] text-accent-200">Development system</p>
            <h2 className="mt-2 max-w-2xl font-fw-display text-h2 font-semibold text-white">
              {health.totalPlayers > 0 ? `${coveragePct}% of the roster is working a measured plan.` : 'Build the first measured player plan.'}
            </h2>
            <p className="mt-2 max-w-2xl text-body-sm text-white/70">
              CoachHelm connects evidence to a player-approved focus, tracks the metric, and closes the loop with an outcome.
            </p>
          </div>
          <Button variant="secondary" size="sm" leftIcon={<IconPlus size={15} />} onClick={() => onAdd()}>
            Prescribe focus
          </Button>
        </div>

        <div className="grid gap-px bg-accent-700 sm:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage, index) => (
            <div key={stage.label} className="relative min-h-32 bg-accent-900 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-fw-mono text-eyebrow tabular-nums text-accent-200">0{index + 1}</span>
                {index < stages.length - 1 ? <ArrowRight className="h-4 w-4 text-white/30" aria-hidden /> : <Activity className="h-4 w-4 text-accent-300" aria-hidden />}
              </div>
              <p className="mt-4 font-fw-mono text-stat-sm font-semibold tabular-nums text-white">{stage.value}</p>
              <p className="mt-1 text-body-sm font-semibold text-white">{stage.label}</p>
              <p className="mt-1 text-caption text-white/55">{stage.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <Surface elevation="shadow" padding="md" className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow as="h2">Coach attention</Eyebrow>
            <p className="mt-1 text-caption text-text-tertiary">Real scoring trend plus development coverage.</p>
          </div>
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--fw-color-accent-500) ${coveragePct}%, var(--fw-color-surface-sunken) 0)` }}
            aria-label={`${coveragePct}% roster coverage`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-surface font-fw-mono text-caption font-semibold tabular-nums text-text-primary">{coveragePct}%</span>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {needs.slice(0, 4).map(({ row, reason }, index) => (
            <Button
              key={row.player.id}
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => onOpenPlayer(row.player.id)}
              className="group min-h-14 !justify-start !rounded-fw-md border-border-subtle bg-surface-raised !px-3 !py-2.5 text-left hover:border-accent-200 hover:bg-surface-raised hover:[box-shadow:var(--fw-shadow-soft)]"
            >
              <span className="flex w-full min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fw-warning-bg font-fw-mono text-caption font-semibold text-fw-warning-ink">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-semibold text-text-primary">{playerName(row.player)}</span>
                  <span className="block truncate text-caption text-text-tertiary">{reason}</span>
                </span>
                <span className="font-fw-mono text-caption tabular-nums text-text-secondary">{row.stats?.avg_score?.toFixed(1) ?? '—'}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Button>
          ))}
          {needs.length === 0 ? (
            <div className="rounded-fw-md border border-accent-200 bg-accent-50 px-4 py-5">
              <p className="text-body-sm font-semibold text-accent-900">Roster is covered</p>
              <p className="mt-1 text-caption text-accent-800">No player is both declining and missing an active focus area.</p>
            </div>
          ) : null}
        </div>

        <div className="mt-auto grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle pt-4">
          <CommandMetric label="Players" value={health.totalPlayers} />
          <CommandMetric label="Active" value={health.activeAreas} />
          <CommandMetric label="Completed" value={health.completedAreas} />
        </div>
      </Surface>
    </section>
  );
}

function CommandMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-1 text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
    </div>
  );
}

function PlayerIntelligenceGrid({
  rows,
  focusAreas,
  goalsByPlayer,
  signalGroupByPlayer,
  silentPostureByPlayer,
  onOpenPlayer,
  onAddFocusArea,
  onViewGame,
}: {
  rows: RosterRow[];
  focusAreas: PlayersGridFocusArea[];
  goalsByPlayer: Record<string, FairwayGoalCardData[]>;
  signalGroupByPlayer: Map<string, SignalGroup>;
  silentPostureByPlayer: Record<string, boolean>;
  onOpenPlayer: (playerId: string) => void;
  onAddFocusArea: (playerId?: string) => void;
  onViewGame: (playerId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
      {rows.map((row, index) => {
        const playerId = row.player.id;
        const playerAreas = focusAreas.filter((area) => area.player_id === playerId);
        const active = playerAreas.filter((area) => area.status === 'active' || area.status === 'in_progress').length;
        const pending = playerAreas.filter((area) => area.status === 'proposed').length;
        const signalGroup = signalGroupByPlayer.get(playerId);
        const topSignal = signalGroup?.signals[0];
        const scoreSeries = row.stats?.score_series?.filter(Number.isFinite) ?? [];
        return (
          <article
            key={playerId}
            className={cn(
              'group flex min-h-[310px] flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent-200 hover:[box-shadow:var(--fw-shadow-raise)] motion-reduce:hover:translate-y-0 md:col-span-1',
              balancedRosterSpan(rows.length, index),
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-4">
              <PlayerIdentity
                name={playerName(row.player)}
                avatarUrl={row.player.avatar_url}
                size="sm"
                meta={row.player.graduation_year ? `Class of ${row.player.graduation_year}` : undefined}
              />
              {silentPostureByPlayer[playerId] ? <Badge tone="neutral" size="sm">Muted</Badge> : signalGroup ? (
                <Badge tone={signalGroup.worstSeverity === 'urgent' || signalGroup.worstSeverity === 'high' ? 'warning' : 'accent'} size="sm" numeric>
                  {signalGroup.signals.length} signals
                </Badge>
              ) : <Badge tone="neutral" size="sm">All clear</Badge>}
            </div>

            <div className="grid flex-1 content-start gap-4 px-4 py-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-eyebrow uppercase tracking-wide text-text-tertiary">Scoring average</p>
                  <p className="mt-1 font-fw-mono text-stat-sm font-semibold tabular-nums text-text-primary">{row.stats?.avg_score?.toFixed(1) ?? '—'}</p>
                </div>
                <Sparkline data={scoreSeries} goodDirection="down" width={104} height={36} strokeWidth={2} label={`${playerName(row.player)} scoring`} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <PlayerMicroMetric label="GIR" value={formatPercent(row.stats?.gir_pct)} />
                <PlayerMicroMetric label="Fairways" value={formatPercent(row.stats?.fairway_pct)} />
                <PlayerMicroMetric label="Putts" value={row.stats?.avg_putts?.toFixed(1) ?? '—'} />
              </div>

              <div className="rounded-fw-md border border-border-subtle bg-surface-sunken/55 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-eyebrow uppercase tracking-wide text-text-tertiary"><BrainCircuit className="h-3.5 w-3.5 text-accent-700" aria-hidden />CoachHelm read</span>
                  <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">{signalGroup?.attentionScore ?? 0} priority</span>
                </div>
                <p className="mt-2 line-clamp-2 min-h-10 text-caption font-medium text-text-primary">
                  {topSignal ? `${formatSignalCategory(topSignal.category)} · ${topSignal.title}` : 'No open evidence needs review right now.'}
                </p>
              </div>

              <div className="grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle pt-3">
                <PlayerCount label="Active" value={active} />
                <PlayerCount label="Pending" value={pending} />
                <PlayerCount label="Goals" value={goalsByPlayer[playerId]?.length ?? 0} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 border-t border-border-subtle bg-surface-sunken/35 p-3">
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Open ${playerName(row.player)} development profile`}
                onClick={() => onOpenPlayer(playerId)}
              >
                Open
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Prescribe a focus area for ${playerName(row.player)}`}
                leftIcon={<IconPlus size={14} />}
                onClick={() => onAddFocusArea(playerId)}
              >
                Focus
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Open ${playerName(row.player)} game fingerprint`}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                onClick={() => onViewGame(playerId)}
              >
                Game
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PlayerDevelopmentProfile({
  player,
  stats,
  signalGroup,
  focusAreas,
  goals,
  onAdd,
  onViewGame,
}: {
  player: PlayersGridPlayer;
  stats?: PlayersGridStats;
  signalGroup?: SignalGroup;
  focusAreas: PlayersGridFocusArea[];
  goals: FairwayGoalCardData[];
  onAdd: () => void;
  onViewGame: () => void;
}) {
  const active = focusAreas.filter((area) => area.status === 'active' || area.status === 'in_progress').length;
  const pending = focusAreas.filter((area) => area.status === 'proposed').length;
  const completed = focusAreas.filter((area) => area.status === 'completed').length;
  const scoreSeries = stats?.score_series?.filter(Number.isFinite) ?? [];
  const categories = Array.from(new Set(signalGroup?.signals.map((signal) => signal.category) ?? [])).slice(0, 5);

  return (
    <section aria-label={`${playerName(player)} development profile`} className="overflow-hidden rounded-fw-lg border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-raise)]">
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <div className="border-b border-border-subtle p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow tone="accent">Player intelligence profile</Eyebrow>
              <div className="mt-3">
                <PlayerIdentity
                  name={playerName(player)}
                  avatarUrl={player.avatar_url}
                  size="md"
                  meta={[player.graduation_year ? `Class of ${player.graduation_year}` : null, player.handicap != null ? `${player.handicap} HCP` : null].filter(Boolean).join(' · ') || undefined}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onViewGame}>Game fingerprint</Button>
              <Button variant="primary" size="sm" leftIcon={<IconPlus size={15} />} onClick={onAdd}>Prescribe focus</Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <p className="text-eyebrow uppercase tracking-wide text-text-tertiary">Recent scoring shape</p>
              <div className="mt-2 flex items-end gap-3">
                <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">{stats?.avg_score?.toFixed(1) ?? '—'}</span>
                <span className="mb-1 text-caption text-text-tertiary">average · {stats?.rounds_played ?? 0} rounds</span>
              </div>
            </div>
            <Sparkline data={scoreSeries} goodDirection="down" width={190} height={54} strokeWidth={2.5} label={`${playerName(player)} recent scoring`} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ProfileMetric label="GIR" value={formatPercent(stats?.gir_pct)} />
            <ProfileMetric label="Fairways" value={formatPercent(stats?.fairway_pct)} />
            <ProfileMetric label="Putts / round" value={stats?.avg_putts?.toFixed(1) ?? '—'} />
            <ProfileMetric label="Scrambling" value={formatPercent(stats?.scrambling_pct)} />
          </div>
        </div>

        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>CoachHelm evidence</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Current signal load and development state.</p>
            </div>
            <ChartNoAxesColumnIncreasing className="h-4 w-4 text-accent-700" aria-hidden />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.length > 0 ? categories.map((category) => (
              <Badge key={category} tone="neutral" size="sm">{formatSignalCategory(category)}</Badge>
            )) : <Badge tone="accent" size="sm">No open signals</Badge>}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-fw-md border border-border-subtle bg-border-subtle">
            <ProfileState label="Open signals" value={signalGroup?.signals.length ?? 0} />
            <ProfileState label="Priority" value={signalGroup?.attentionScore ?? 0} />
            <ProfileState label="Active focus" value={active} />
            <ProfileState label="Pending" value={pending} />
            <ProfileState label="Completed" value={completed} />
            <ProfileState label="Goals" value={goals.length} />
          </div>

          <p className="mt-auto pt-5 text-caption text-text-secondary">
            {signalGroup?.signals[0]?.title ?? 'CoachHelm has no open evidence requiring action for this player.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function PlayerMicroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-fw-sm bg-surface-sunken/55 px-2.5 py-2">
      <p className="text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function PlayerCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 text-center first:pl-0 last:pr-0">
      <p className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-1 text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-fw-md border border-border-subtle bg-surface-sunken/45 px-3 py-3">
      <p className="text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-2 font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function ProfileState({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-raised px-3 py-3">
      <p className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-1 text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
    </div>
  );
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}

function formatSignalCategory(category: string) {
  return category.split('_').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function balancedRosterSpan(total: number, index: number) {
  if (total === 2) return 'xl:col-span-6';
  if (total === 1) return 'xl:col-span-12';
  const remainder = total % 3;
  if (remainder === 1 && index >= total - 4) return 'xl:col-span-3';
  if (remainder === 2 && index >= total - 2) return 'xl:col-span-6';
  return 'xl:col-span-4';
}

/* ---------------------------------------------------------------------------
 * RosterPlayerCard — the phone-native roster row (< sm). Recomposed for the
 * phone rather than a squeezed desktop table: identity + avg score + trend
 * lead the card, and "Add focus area" / "View genome" render as their own
 * always-visible tap targets below a divider — not a hover-revealed action
 * column that a touch pointer can never trigger (audit W2).
 * ------------------------------------------------------------------------- */

export function RosterPlayerCard({
  row,
  muted,
  onOpenAreas,
  onAddFocusArea,
  onViewGenome,
}: {
  row: RosterRow;
  muted: boolean;
  onOpenAreas: () => void;
  onAddFocusArea: () => void;
  onViewGenome: () => void;
}) {
  const { player, stats } = row;
  const metaText =
    `${player.graduation_year ? `'${String(player.graduation_year).slice(-2)}` : ''}` +
    `${
      player.handicap != null
        ? `${player.graduation_year ? ' · ' : ''}${player.handicap < 0 ? '+' : ''}${Math.abs(player.handicap)} HCP`
        : ''
    }`;
  const trend = stats?.recent_trend ?? null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4">
      {/* eslint-disable-next-line helm/no-raw-button -- wraps the composed
          PlayerIdentity row (avatar + name + meta + trailing stat/trend);
          the Fairway <Button> CHILDREN CONTRACT requires a single child and
          can't host this multi-node row. */}
      <button
        type="button"
        onClick={onOpenAreas}
        className="flex w-full items-center justify-between gap-3 rounded-fw-sm text-left transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)] active:translate-y-[0.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <PlayerIdentity
          name={playerName(player)}
          avatarUrl={player.avatar_url}
          size="sm"
          meta={metaText || undefined}
          nameAddon={
            muted ? (
              <Badge
                tone="neutral"
                variant="outline"
                size="sm"
                title="Alert posture is set to Silent for this player — CoachHelm keeps analyzing but never surfaces an insight. Change it from the Roster page."
              >
                Insights muted
              </Badge>
            ) : undefined
          }
          trailing={
            <div className="flex items-center gap-2">
              {stats?.avg_score != null ? (
                <span className="font-fw-mono text-body-sm tabular-nums text-text-primary">
                  {stats.avg_score}
                </span>
              ) : (
                <span className="font-fw-sans text-eyebrow text-text-tertiary">—</span>
              )}
              {trend ? (
                <TrendGlyph direction={trend} className="font-fw-sans text-caption font-medium" />
              ) : null}
              <IconChevronRight size={16} className="text-text-tertiary" aria-hidden />
            </div>
          }
        />
      </button>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          leftIcon={<IconPlus size={15} />}
          onClick={onAddFocusArea}
        >
          Add focus area
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          rightIcon={<IconChevronRight size={15} />}
          onClick={onViewGenome}
        >
          View genome
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * FocusAreaBoard — the flat focus-area grid (active first, then pending
 * acceptance / declined / completed — see the bucket split below)
 * ------------------------------------------------------------------------- */

function FocusAreaBoard({
  areas,
  players,
  completingId,
  reopeningId,
  onEdit,
  onComplete,
  onLogProgress,
  onDelete,
  onRecordOutcome,
  onReopen,
  onCreate,
  showPlayerName,
}: {
  areas: PlayersGridFocusArea[];
  players: PlayersGridPlayer[];
  completingId: string | null;
  reopeningId: string | null;
  onEdit: (fa: FocusAreaCardData) => void;
  onComplete: (fa: FocusAreaCardData) => void;
  onLogProgress: (fa: FocusAreaCardData) => void;
  onDelete: (fa: FocusAreaCardData) => void;
  onRecordOutcome: (
    fa: FocusAreaCardData,
    outcome: FocusAreaOutcome,
  ) => Promise<{ success: boolean; error?: string; notice?: string }>;
  onReopen: (fa: FocusAreaCardData) => void;
  onCreate: () => void;
  showPlayerName: boolean;
}) {
  const byId = React.useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Three-way split (was a single "active" bucket that also silently absorbed
  // 'proposed' and 'declined' rows — both rendered with a misleading "Active"
  // badge and live Complete/Log-progress/Outcome buttons). 'proposed' is a
  // coach prescription the player hasn't accepted yet; 'declined' was
  // explicitly rejected. Both get their own labeled section below so a coach
  // can tell them apart from real, ongoing work at a glance.
  const proposed = areas.filter((a) => a.status === 'proposed');
  const declined = areas.filter((a) => a.status === 'declined');
  const completed = areas.filter((a) => a.status === 'completed');
  const active = areas.filter(
    (a) => a.status !== 'completed' && a.status !== 'proposed' && a.status !== 'declined',
  );

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

      {/* Pending acceptance — coach-prescribed, awaiting the player's accept/
          decline. No live Complete/Log-progress/Outcome (FocusAreaCard hides
          them for a non-actionable status); Edit/Delete stay so the coach can
          fix or retract the prescription before the player acts on it. */}
      {proposed.length > 0 ? (
        <div className="space-y-3">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            Pending acceptance ({proposed.length})
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {proposed.map((fa, i) => (
              <FocusAreaCard
                key={fa.id}
                focusArea={fa}
                // eslint-disable-next-line jsx-a11y/aria-role
                role="coach"
                index={i}
                playerName={showPlayerName ? playerName(byId.get(fa.player_id)) : undefined}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Declined — the player explicitly rejected the prescription. Kept
          visible (not deleted) so the coach isn't left guessing why a
          prescribed area never shows up as active; Edit/Delete only. */}
      {declined.length > 0 ? (
        <div className="space-y-3">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            Declined ({declined.length})
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {declined.map((fa, i) => (
              <FocusAreaCard
                key={fa.id}
                focusArea={fa}
                // eslint-disable-next-line jsx-a11y/aria-role
                role="coach"
                index={i}
                playerName={showPlayerName ? playerName(byId.get(fa.player_id)) : undefined}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
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
                onReopen={onReopen}
                reopening={reopeningId === fa.id}
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

export function RosterHealthHeader({
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
            {needs.slice(0, NEEDS_ATTENTION_LIST_CAP).map(({ row, reason }) => (
              <li
                key={row.player.id}
                className="border-t border-border-subtle py-2.5 first:border-t-0"
              >
                {/* Shared identity; the warning reason is this surface's meta and
                    the avg stat + "Add focus area" are its trailing affordances. */}
                <PlayerIdentity
                  name={playerName(row.player)}
                  avatarUrl={row.player.avatar_url}
                  size="sm"
                  meta={
                    <span className="font-fw-sans text-caption font-medium text-fw-warning">
                      {reason}
                    </span>
                  }
                  trailing={
                    <div className="flex items-center gap-1.5">
                      {row.stats?.avg_score != null ? (
                        <span className="hidden font-fw-mono text-caption tabular-nums text-text-tertiary sm:inline">
                          {row.stats.avg_score} avg
                        </span>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => onAdd(row.player.id)}>
                        Add focus area
                      </Button>
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
          {needs.length > NEEDS_ATTENTION_LIST_CAP ? (
            <span className="font-fw-sans text-caption text-text-tertiary">
              +{needs.length - NEEDS_ATTENTION_LIST_CAP} more player
              {needs.length - NEEDS_ATTENTION_LIST_CAP === 1 ? '' : 's'} need a look — showing the top{' '}
              {NEEDS_ATTENTION_LIST_CAP} by priority.
            </span>
          ) : null}
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
