'use client';

// =============================================================================
// src/components/baseball/stats-center/StatsCenterClient.tsx
//
// Wave 7 / packet P7.1 — Stats Center hub, client surface.
// MIGRATED to "The Living Annual" kit (design-system-living-annual.md §6 P1 #5,
// the "Radar-Gun Stat Wall"): the old wall of identical per-player cards is now
// an editorial record-book ROSTER SPREAD — a `SectionMasthead`, a team
// `KPIContentsStrip`, and `PlayerRowPlate` rows under a `PlayerRowPlateHeader`.
// Each row is a serif name plate + `PositionChip` + a run of `StatReadout`
// figures for the active side; the team-leader in each column reads GREEN.
//
// This is a PRESENTATION migration only. The data source (getStatsCenter read
// model), the server action re-fetch (loadStatsCenter — auth + RLS enforced
// there), the batting/pitching side switch, the official/all (scrimmage)
// toggle, URL persistence, CSV export, and the honest authorized/error/empty
// envelopes are all preserved exactly.
//
// HONEST STATES (spec §7, "no yellow warning boxes"): unauthorized (not staff),
// whole-team-no-data, and per-spread empties render composed editorial letters
// (`EditorsLetter` / `EmptyIssue`), never a fabricated .000 and never a yellow
// alert box. Players with `noData` sort last and render as quiet ghost rows.
// =============================================================================

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { IconDownload, IconFilter, IconX } from '@/components/icons';
import { cn } from '@/lib/utils';
import { loadStatsCenter } from '@/app/baseball/actions/games';
// V10 stat-visual chart gallery (stat-visuals packet). Mounted at team scope; it
// renders honest empty/insufficient frames until a per-chart read model feeds it
// granular event inputs, so it is safe to ship before that wiring lands.
import { StatVisualsSection, useStatVisualViews } from '@/components/baseball/stat-visuals';
import type { StatVisualsData } from '@/components/baseball/stat-visuals/StatVisualsSection';
import {
  SectionMasthead,
  KPIContentsStrip,
  PlayerRowPlate,
  PlayerRowPlateHeader,
  EmptyIssue,
  EditorsLetter,
  Eyebrow,
  HairlineRule,
  formatRate,
  formatRatio,
} from '@/components/baseball/living-annual';
import type { PlayerRowStat } from '@/components/baseball/living-annual';
import type {
  StatsCenterReadModel,
  StatsCenterRow,
  BattingSplit,
  PitchingSplit,
  StatSide,
} from '@/lib/baseball/read-models/stats-center';

// -----------------------------------------------------------------------------
// Props + local view state
// -----------------------------------------------------------------------------

interface InitialFilters {
  seasonYear: number;
  positions: string[];
  side: StatSide | null;
  fromDate: string | null;
  toDate: string | null;
}

interface StatsCenterClientProps {
  model: StatsCenterReadModel;
  initialFilters: InitialFilters;
  /**
   * Team-wide elite-event chart inputs (from the elite-stat-events read model
   * via toStatVisualsData). Optional + honest: when omitted/empty the gallery
   * renders its truthful "no captured events" frames.
   */
  statVisualsData?: StatVisualsData;
}

/** Which game-set the wall currently shows. */
type GameSet = 'official' | 'all';

const EM_DASH = '—';

// -----------------------------------------------------------------------------
// Formatting (CSV + labels)
// -----------------------------------------------------------------------------

function playerName(row: StatsCenterRow): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unnamed player';
}

function prettyPosition(value: string | null): string {
  if (!value) return '—';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// -----------------------------------------------------------------------------
// Record-book column specs — the headline "run" of figures per side. Rate stats
// (AVG/OBP/SLG, ERA/WHIP) render pre-formatted the baseball way via
// formatRate/formatRatio (static string); counting stats roll on the odometer
// (numeric). Deep stats live on the per-player drill-in.
// -----------------------------------------------------------------------------

type LeaderDir = 'high' | 'low' | null;

interface StatColSpec<S> {
  label: string;
  /** Leader metric — `null` value or `null` reader excludes the column from leaders. */
  read: (s: S) => number | null;
  /** Which direction wins the column (`null` = no leader treatment). */
  dir: LeaderDir;
  /** The display figure (string → static, number → odometer). */
  cell: (s: S) => number | string;
}

const BATTING_COLS: ReadonlyArray<StatColSpec<BattingSplit>> = [
  { label: 'AVG', read: (b) => b.avg, dir: 'high', cell: (b) => (b.avg === null ? EM_DASH : formatRate(b.avg, 3)) },
  { label: 'OBP', read: (b) => b.obp, dir: 'high', cell: (b) => (b.obp === null ? EM_DASH : formatRate(b.obp, 3)) },
  { label: 'SLG', read: (b) => b.slg, dir: 'high', cell: (b) => (b.slg === null ? EM_DASH : formatRate(b.slg, 3)) },
  { label: 'HR', read: (b) => b.hr, dir: 'high', cell: (b) => b.hr },
  { label: 'RBI', read: (b) => b.rbi, dir: 'high', cell: (b) => b.rbi },
  { label: 'SB', read: (b) => b.sb, dir: 'high', cell: (b) => b.sb },
];

const PITCHING_COLS: ReadonlyArray<StatColSpec<PitchingSplit>> = [
  { label: 'ERA', read: (p) => p.era, dir: 'low', cell: (p) => (p.era === null ? EM_DASH : formatRatio(p.era, 2)) },
  { label: 'WHIP', read: (p) => p.whip, dir: 'low', cell: (p) => (p.whip === null ? EM_DASH : formatRatio(p.whip, 2)) },
  // IP is stored in the .1/.2 (outs) convention already — display verbatim, no odometer.
  { label: 'IP', read: () => null, dir: null, cell: (p) => p.ip.toFixed(1) },
  { label: 'K', read: (p) => p.k, dir: 'high', cell: (p) => p.k },
  { label: 'W-L', read: () => null, dir: null, cell: (p) => `${p.w}-${p.l}` },
  { label: 'SV', read: (p) => p.sv, dir: 'high', cell: (p) => p.sv },
];

/**
 * For each column, the set of player ids that lead it (green). A column needs at
 * least two non-null values to have a meaningful "leader" — so a lone qualifier
 * is never crowned. Ties are all marked.
 */
function computeLeaders<S>(
  rows: StatsCenterRow[],
  split: (r: StatsCenterRow) => S,
  cols: ReadonlyArray<StatColSpec<S>>,
): Array<Set<string>> {
  return cols.map((col) => {
    const ids = new Set<string>();
    if (!col.dir) return ids;
    const vals: Array<{ id: string; v: number }> = [];
    for (const r of rows) {
      const v = col.read(split(r));
      if (v !== null && Number.isFinite(v)) vals.push({ id: r.playerId, v });
    }
    if (vals.length < 2) return ids;
    let best: number | null = null;
    for (const { v } of vals) best = best === null ? v : col.dir === 'high' ? Math.max(best, v) : Math.min(best, v);
    if (best === null) return ids;
    for (const { id, v } of vals) if (v === best) ids.add(id);
    return ids;
  });
}

const playerHref = (row: StatsCenterRow) => `/baseball/dashboard/players/${row.playerId}/stats`;

// -----------------------------------------------------------------------------
// One record-book spread (a header + the roster rows for one side of the ball).
// -----------------------------------------------------------------------------

function StatSpread({
  heading,
  columns,
  realRows,
  ghostRows,
  buildStats,
  emptyTitle,
  emptyBody,
}: {
  heading: string;
  columns: string[];
  realRows: StatsCenterRow[];
  ghostRows: StatsCenterRow[];
  buildStats: (row: StatsCenterRow) => PlayerRowStat[];
  emptyTitle: string;
  emptyBody: string;
}) {
  const hasRows = realRows.length > 0 || ghostRows.length > 0;
  const ghostStats: PlayerRowStat[] = columns.map(() => ({ value: EM_DASH }));

  return (
    <section className="flex flex-col gap-3">
      <Eyebrow ink="team">{heading}</Eyebrow>
      {hasRows ? (
        // Mobile: the fixed stat-column grid scrolls horizontally as one plate.
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <PlayerRowPlateHeader columns={columns} />
            {realRows.map((row) => (
              <PlayerRowPlate
                key={row.playerId}
                firstName={row.firstName ?? ''}
                lastName={row.lastName ?? ''}
                jerseyNumber={row.jerseyNumber ?? undefined}
                position={row.primaryPosition ?? undefined}
                stats={buildStats(row)}
                href={playerHref(row)}
              />
            ))}
            {/* noData players — quiet ghost rows, honest em-dashes, sorted last. */}
            {ghostRows.map((row) => (
              <div key={row.playerId} className="opacity-45">
                <PlayerRowPlate
                  firstName={row.firstName ?? ''}
                  lastName={row.lastName ?? ''}
                  jerseyNumber={row.jerseyNumber ?? undefined}
                  position={row.primaryPosition ?? undefined}
                  stats={ghostStats}
                  href={playerHref(row)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EditorsLetter ink="team" title={emptyTitle} body={emptyBody} />
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// CSV export (client-side, current filtered rows + chosen split) — UNCHANGED.
// -----------------------------------------------------------------------------

function csvCell(value: string | number | null): string {
  const s = value === null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: StatsCenterRow[], gameSet: GameSet): string {
  const header = [
    'Player',
    'Jersey',
    'Position',
    'GameSet',
    // Batting — full V6 official set (counting + derived rates).
    'B_G', 'PA', 'AB', 'R', 'H', '1B', '2B', '3B', 'HR', 'TB', 'RBI', 'BB', 'IBB',
    'K', 'SB', 'CS', 'HBP', 'SH', 'SF', 'GIDP', 'ROE', 'CI', 'LOB', 'PickedOff',
    '2OutRBI', 'ProdOuts', 'RunnersAdv', 'PH_AB', 'PH_H', 'PR_App',
    'AVG', 'OBP', 'SLG', 'OPS', 'ISO', 'BB%', 'K%', 'BBperK', 'XBH%', 'SB%', 'RC', 'wOBAest',
    // Pitching — full V6 official set.
    'P_App', 'GS', 'GF', 'W', 'L', 'SV', 'HLD', 'BS', 'CG', 'SHO', 'IP', 'BF',
    'P_H', '2B_A', '3B_A', 'P_R', 'ER', 'P_BB', 'P_IBB', 'P_K', 'P_HBP', 'WP',
    'BK', 'P_HR', 'Pitches', 'Strikes', 'FPS', 'IR', 'IR_Scored',
    'ERA', 'WHIP', 'K9', 'BB9', 'HR9', 'H9', 'P_K%', 'P_BB%', 'oppBA', 'Strike%', 'FPS%', 'LOB%',
    // Catching (official events).
    'C_G', 'C_CS', 'C_SBA', 'C_CS%', 'C_PO', 'BlocksMade', 'BlockOpp', 'Block%', 'PB', 'PopTime',
    // Fielding (official events).
    'F_G', 'F_PO', 'F_A', 'F_E', 'F_TC', 'F_DP', 'FLD%', 'Routine%',
    // Baserunning (official events).
    'BR_G', 'BR_SB', 'BR_CS', 'BR_SB%', 'BR_PO', 'XBT', 'OOB', 'HomeTo1st',
    'Reconciled',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    const b = gameSet === 'official' ? row.battingOfficial : row.battingAll;
    const p = gameSet === 'official' ? row.pitchingOfficial : row.pitchingAll;
    const c = row.catchingOfficial;
    const f = row.fieldingOfficial;
    const br = row.baserunningOfficial;
    const reconciled = !row.reconcile.hasSeasonRow
      ? 'no_season_row'
      : row.reconcile.reconciled
        ? 'yes'
        : 'no';
    lines.push(
      [
        playerName(row),
        row.jerseyNumber ?? '',
        prettyPosition(row.primaryPosition),
        gameSet === 'official' ? 'official' : 'all',
        b.g, b.pa, b.ab, b.r, b.h, b.singles, b.doubles, b.triples, b.hr, b.tb,
        b.rbi, b.bb, b.ibb, b.k, b.sb, b.cs, b.hbp, b.sac, b.sf, b.gidp, b.roe,
        b.ci, b.lob, b.pickoffs, b.twoOutRbi, b.productiveOuts, b.runnersAdvanced,
        b.phAb, b.phH, b.prApp,
        b.avg ?? '', b.obp ?? '', b.slg ?? '', b.ops ?? '', b.iso ?? '',
        b.bbPct ?? '', b.kPct ?? '', b.bbK ?? '', b.xbhPct ?? '', b.sbPct ?? '',
        b.rc ?? '', b.wobaEst ?? '',
        p.g, p.gs, p.gf, p.w, p.l, p.sv, p.holds, p.blownSaves, p.cg, p.sho,
        p.ip, p.bf, p.h, p.doublesAllowed, p.triplesAllowed, p.r, p.er, p.bb,
        p.ibb, p.k, p.hbp, p.wp, p.balk, p.hr, p.pitches, p.strikes,
        p.firstPitchStrikes, p.inheritedRunners, p.inheritedRunnersScored,
        p.era ?? '', p.whip ?? '', p.k9 ?? '', p.bb9 ?? '', p.hr9 ?? '', p.h9 ?? '',
        p.kPct ?? '', p.bbPct ?? '', p.oppBa ?? '', p.strikePct ?? '', p.fpsPct ?? '', p.lobPct ?? '',
        c.g, c.caughtStealing, c.stolenBasesAllowed, c.csPct ?? '', c.pickoffs,
        c.blocksMade, c.blockOpportunities, c.blockPct ?? '', c.passedBalls, c.popTimeAvg ?? '',
        f.g, f.putouts, f.assists, f.errors, f.chances, f.doublePlays, f.fldPct ?? '', f.routinePct ?? '',
        br.g, br.stolenBases, br.caughtStealing, br.sbPct ?? '', br.pickoffs,
        br.extraBasesTaken, br.outsOnBases, br.homeToFirstAvg ?? '',
        reconciled,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// Filter controls (chrome) — behavior preserved from the pre-migration surface.
// -----------------------------------------------------------------------------

const SIDE_OPTIONS: { value: StatSide | 'both'; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'batting', label: 'Batting' },
  { value: 'pitching', label: 'Pitching' },
];

const GAME_SET_OPTIONS: { value: GameSet; label: string }[] = [
  { value: 'official', label: 'Official' },
  { value: 'all', label: 'All games' },
];

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            haptic="none"
            className={cn(
              'min-h-0 rounded-md px-3 py-1.5 text-sm font-medium',
              active
                ? 'bg-grade-plus text-white shadow-sm hover:bg-grade-plus'
                : 'text-text-secondary hover:bg-[color:var(--paper-canvas)]',
            )}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main client
// -----------------------------------------------------------------------------

export function StatsCenterClient({ model: initialModel, initialFilters, statVisualsData }: StatsCenterClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion() ?? false;
  const [isPending, startTransition] = useTransition();

  // The model is refreshed in place when server-side filters change.
  const [model, setModel] = useState<StatsCenterReadModel>(initialModel);
  const [refetchError, setRefetchError] = useState<string | null>(null);

  // Stat-visual saved views (team scope) — wires baseball_stat_visual_views so a
  // coach's family-tab/pin state on the chart gallery persists per user.
  const statVisualViews = useStatVisualViews();

  // Server-side filters (re-query the read model on change).
  const [seasonYear, setSeasonYear] = useState<number>(initialFilters.seasonYear);
  const [positions, setPositions] = useState<string[]>(initialFilters.positions);
  const [side, setSide] = useState<StatSide | 'both'>(initialFilters.side ?? 'both');

  // Client-only view state (no re-query needed).
  const [gameSet, setGameSet] = useState<GameSet>('official');

  const positionOptions = model.positions;

  // ---- URL persistence + server re-fetch (auth + RLS enforced server-side) ----
  const applyFilters = useCallback(
    (next: { seasonYear: number; positions: string[]; side: StatSide | 'both' }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('season', String(next.seasonYear));
      if (next.positions.length > 0) params.set('positions', next.positions.join(','));
      else params.delete('positions');
      if (next.side === 'both') params.delete('side');
      else params.set('side', next.side);
      router.replace(`?${params.toString()}`, { scroll: false });

      startTransition(async () => {
        setRefetchError(null);
        try {
          const fresh = await loadStatsCenter({
            seasonYear: next.seasonYear,
            positions: next.positions.length > 0 ? next.positions : undefined,
            side: next.side === 'both' ? undefined : next.side,
            fromDate: initialFilters.fromDate ?? undefined,
            toDate: initialFilters.toDate ?? undefined,
          });
          setModel(fresh);
        } catch {
          setRefetchError('We could not refresh the stats. Please try again.');
        }
      });
    },
    [router, searchParams, initialFilters.fromDate, initialFilters.toDate],
  );

  const togglePosition = useCallback(
    (pos: string) => {
      const next = positions.includes(pos)
        ? positions.filter((p) => p !== pos)
        : [...positions, pos];
      setPositions(next);
      applyFilters({ seasonYear, positions: next, side });
    },
    [positions, seasonYear, side, applyFilters],
  );

  const changeSide = useCallback(
    (v: StatSide | 'both') => {
      setSide(v);
      applyFilters({ seasonYear, positions, side: v });
    },
    [seasonYear, positions, applyFilters],
  );

  const changeSeason = useCallback(
    (delta: number) => {
      const next = seasonYear + delta;
      setSeasonYear(next);
      applyFilters({ seasonYear: next, positions, side });
    },
    [seasonYear, positions, side, applyFilters],
  );

  const clearFilters = useCallback(() => {
    setPositions([]);
    setSide('both');
    applyFilters({ seasonYear, positions: [], side: 'both' });
  }, [seasonYear, applyFilters]);

  const hasActiveFilters = positions.length > 0 || side !== 'both';

  const rows = model.rows;
  const allNoData = rows.length > 0 && rows.every((r) => r.noData);

  const handleExport = useCallback(() => {
    const csv = buildCsv(rows, gameSet);
    downloadCsv(`stats-center-${model.seasonYear}-${gameSet}.csv`, csv);
  }, [rows, gameSet, model.seasonYear]);

  // ---- Derived record-book lists + column leaders --------------------------
  const battingRows = useMemo(
    () => rows.filter((r) => !r.noData && (gameSet === 'official' ? r.battingOfficial : r.battingAll).g > 0),
    [rows, gameSet],
  );
  const pitchingRows = useMemo(
    () => rows.filter((r) => !r.noData && (gameSet === 'official' ? r.pitchingOfficial : r.pitchingAll).g > 0),
    [rows, gameSet],
  );
  const ghostRows = useMemo(() => rows.filter((r) => r.noData), [rows]);

  const battingLeaders = useMemo(
    () => computeLeaders(battingRows, (r) => (gameSet === 'official' ? r.battingOfficial : r.battingAll), BATTING_COLS),
    [battingRows, gameSet],
  );
  const pitchingLeaders = useMemo(
    () => computeLeaders(pitchingRows, (r) => (gameSet === 'official' ? r.pitchingOfficial : r.pitchingAll), PITCHING_COLS),
    [pitchingRows, gameSet],
  );

  const buildBattingStats = useCallback(
    (row: StatsCenterRow): PlayerRowStat[] => {
      const b = gameSet === 'official' ? row.battingOfficial : row.battingAll;
      return BATTING_COLS.map((col, i) => ({ value: col.cell(b), leader: battingLeaders[i]?.has(row.playerId) ?? false }));
    },
    [gameSet, battingLeaders],
  );
  const buildPitchingStats = useCallback(
    (row: StatsCenterRow): PlayerRowStat[] => {
      const p = gameSet === 'official' ? row.pitchingOfficial : row.pitchingAll;
      return PITCHING_COLS.map((col, i) => ({ value: col.cell(p), leader: pitchingLeaders[i]?.has(row.playerId) ?? false }));
    },
    [gameSet, pitchingLeaders],
  );

  const showBatting = side !== 'pitching';
  const showPitching = side !== 'batting';
  // Ghost (noData) tail hangs on the primary spread only (batting when shown).
  const battingGhosts = showBatting ? ghostRows : [];
  const pitchingGhosts = showBatting ? [] : ghostRows;

  const seasonContext = gameSet === 'official' ? 'OFFICIAL GAMES' : 'ALL GAMES · INCL. SCRIMMAGES';
  const eyebrow = [`${model.seasonYear} SEASON`, seasonContext, side !== 'both' ? side.toUpperCase() : null]
    .filter(Boolean)
    .join(' · ');

  const mastheadActions = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl options={GAME_SET_OPTIONS} value={gameSet} onChange={setGameSet} ariaLabel="Game set" />
      <Button
        variant="secondary"
        size="md"
        leftIcon={<IconDownload size={16} />}
        onClick={handleExport}
        disabled={rows.length === 0}
      >
        Export CSV
      </Button>
    </div>
  );

  // ---- Unauthorized envelope (not staff) — honest editorial letter ----------
  if (!model.authorized) {
    return (
      <LazyMotion features={domAnimation}>
        <div className="mx-auto w-full max-w-[1536px] px-4 py-12 sm:px-6">
          <EditorsLetter
            ink="team"
            title="Stats Center is for coaching staff."
            body="Your account isn’t a staff member on this team, so team-wide stats aren’t available here."
            action={
              <Button variant="secondary" size="md" onClick={() => router.push('/baseball/dashboard')}>
                Back to dashboard
              </Button>
            }
          />
        </div>
      </LazyMotion>
    );
  }

  // ---- Authorized record-book spread ---------------------------------------
  return (
    <LazyMotion features={domAnimation}>
      <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6">
        <SectionMasthead eyebrow={eyebrow} title="Stats Center" actions={mastheadActions} />

        {/* Team contents strip — the magazine table of contents. */}
        <div className="mt-6">
          <KPIContentsStrip
            columns={5}
            items={[
              { label: 'Roster', value: model.summary.rosterSize },
              { label: 'On the Record', value: model.summary.playersWithData, emphasis: model.summary.playersWithData > 0 },
              { label: 'Official Games', value: model.summary.officialGames },
              { label: 'Scrimmages', value: model.summary.scrimmages },
              { label: 'Needs Recalc', value: model.summary.unreconciled, emphasis: model.summary.unreconciled > 0 },
            ]}
          />
        </div>

        {/* Filters — season / side / position (server-re-queried, URL-persisted). */}
        <div className="mt-6 flex flex-col gap-3 border-t border-[color:var(--hairline)] pt-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <IconFilter size={16} />
              <span className="text-eyebrow font-semibold uppercase tracking-[0.14em]">Filters</span>
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Season</span>
              <div className="inline-flex items-center rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)]">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Previous season"
                  onClick={() => changeSeason(-1)}
                  haptic="none"
                  className="min-h-0 rounded-l-md rounded-r-none px-2.5 py-1.5 text-text-secondary"
                >
                  −
                </Button>
                <span className="min-w-[3.5rem] px-2 text-center font-annual text-sm font-semibold tabular-nums text-text-primary">
                  {seasonYear}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Next season"
                  onClick={() => changeSeason(1)}
                  haptic="none"
                  className="min-h-0 rounded-r-md rounded-l-none px-2.5 py-1.5 text-text-secondary"
                >
                  +
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Side</span>
              <SegmentedControl options={SIDE_OPTIONS} value={side} onChange={changeSide} ariaLabel="Stat side" />
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                haptic="none"
                className="ml-auto min-h-0 gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary"
              >
                <IconX size={14} />
                Clear
              </Button>
            )}
          </div>

          {positionOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Position</span>
              {positionOptions.map((pos) => {
                const active = positions.includes(pos);
                return (
                  <Button
                    key={pos}
                    type="button"
                    variant="ghost"
                    aria-pressed={active}
                    onClick={() => togglePosition(pos)}
                    haptic="none"
                    className={cn(
                      'min-h-0 rounded-full border px-3 py-1 text-sm font-medium',
                      active
                        ? 'border-grade-plus bg-grade-plus text-white hover:bg-grade-plus'
                        : 'border-[color:var(--hairline)] bg-[var(--paper)] text-text-secondary hover:border-grade-plus/50',
                    )}
                  >
                    {prettyPosition(pos)}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* Degraded-data / refresh notes — quiet editorial lines, never yellow boxes. */}
        {(model.error || refetchError) && (
          <div className="mt-5 flex flex-col gap-2">
            <HairlineRule ink="hairline" className="w-10" />
            {model.error && <p className="font-annual text-body-sm text-text-secondary">{model.error}</p>}
            {refetchError && <p className="font-annual text-body-sm text-text-secondary">{refetchError}</p>}
          </div>
        )}

        {/* The record-book wall. */}
        <m.div
          key={`${side}-${gameSet}`}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={cn('mt-8', isPending && 'opacity-60 transition-opacity')}
          aria-busy={isPending}
        >
          {rows.length === 0 ? (
            <EditorsLetter
              ink="team"
              title={hasActiveFilters ? 'No players match these filters.' : 'No players on this roster yet.'}
              body={
                hasActiveFilters
                  ? 'Clear the position or side filter, or pick another season, and the spread returns.'
                  : 'Your roster spread prints here the moment players join the program.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" size="md" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="secondary" size="md" onClick={() => router.push('/baseball/dashboard/roster')}>
                    Go to roster
                  </Button>
                )
              }
            />
          ) : allNoData ? (
            <EmptyIssue
              variant="stats"
              action={
                <Button variant="secondary" size="md" onClick={() => router.push('/baseball/dashboard/import')}>
                  Import a box score
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-10">
              {showBatting && (
                <StatSpread
                  heading="Batting"
                  columns={BATTING_COLS.map((c) => c.label)}
                  realRows={battingRows}
                  ghostRows={battingGhosts}
                  buildStats={buildBattingStats}
                  emptyTitle="No batting lines yet."
                  emptyBody="Batting production prints here after your first captured box score in this game set."
                />
              )}
              {showPitching && (
                <StatSpread
                  heading="Pitching"
                  columns={PITCHING_COLS.map((c) => c.label)}
                  realRows={pitchingRows}
                  ghostRows={pitchingGhosts}
                  buildStats={buildPitchingStats}
                  emptyTitle="No pitching lines yet."
                  emptyBody="Pitching lines print here after your first captured appearance in this game set."
                />
              )}
            </div>
          )}
        </m.div>

        {/* V10 stat-visual chart gallery — team scope, fed by the elite
            stat-event read model. Honest empty/insufficient frames when no
            events are captured. */}
        <div className="mt-12">
          <StatVisualsSection
            scope="team"
            data={statVisualsData}
            savedViews={statVisualViews.savedViews}
            onSaveView={statVisualViews.onSaveView}
            onSetPinned={statVisualViews.onSetPinned}
          />
        </div>
      </div>
    </LazyMotion>
  );
}
