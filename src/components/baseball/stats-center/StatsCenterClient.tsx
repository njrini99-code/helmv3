'use client';

// =============================================================================
// src/components/baseball/stats-center/StatsCenterClient.tsx
//
// Wave 7 / packet P7.1 — Stats Center hub, client surface.
//
// The staff-facing, team-wide stats browser rendered from the Wave-7 read model
// (StatsCenterReadModel). Responsibilities:
//
//   - BROWSE: a player grid (grid-cols-1 sm:2 xl:3) of per-player batting +
//     pitching cards, each showing the read-model-derived OFFICIAL vs ALL-games
//     splits with a single honest toggle between them.
//   - FILTER: by position (multi), by side of the ball (batting / pitching /
//     both), and by a game-date window, plus a season selector. Filters are
//     URL-PERSISTED (router.replace with searchParams) so a shared link
//     reproduces the view, and re-applied server-side via the loadStatsCenter
//     action (auth + can_manage_stats enforced there) — never client-trusted.
//   - OFFICIAL vs SCRIMMAGE: the read model derives both splits from per-game
//     box scores joined on game_type; this surface only chooses which split to
//     show. The season-stat reconcile flag is surfaced honestly per player.
//   - EXPORT: client-side CSV of the currently-filtered rows for the chosen
//     split — no server round-trip, no fabricated columns.
//
// HONEST STATES: unauthorized (not staff) / error / empty / loading are all
// real, labeled, recoverable, and never use a black page background. Players
// with zero captured lines render a "no data yet" card rather than a fake .000.
//
// UI: reuses GolfHelm primitives (Card / EmptyState / Button) + cream/green
// tokens + glass/matte patterns. Motion via LazyMotion/domAnimation honoring
// prefers-reduced-motion. tabular-nums on every stat.
// =============================================================================

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  IconChartBar,
  IconFilter,
  IconDownload,
  IconUsers,
  IconBaseball,
  IconDatabase,
  IconAlertCircle,
  IconCheckCircle2,
  IconChevronRight,
  IconX,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { loadStatsCenter } from '@/app/baseball/actions/games';
// V10 stat-visual chart gallery (stat-visuals packet). Mounted at team scope; it
// renders honest empty/insufficient frames until a per-chart read model feeds it
// granular event inputs, so it is safe to ship before that wiring lands.
import { StatVisualsSection, useStatVisualViews } from '@/components/baseball/stat-visuals';
import type { StatVisualsData } from '@/components/baseball/stat-visuals/StatVisualsSection';
import type {
  StatsCenterReadModel,
  StatsCenterRow,
  BattingSplit,
  PitchingSplit,
  CatchingSplit,
  FieldingSplit,
  BaserunningSplit,
  StatSide,
} from '@/lib/baseball/read-models/stats-center';

// -----------------------------------------------------------------------------
// Props + local filter state
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

/** Which game-set the grid currently shows. */
type GameSet = 'official' | 'all';

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

/** Baseball rate display: .305 / 3.21. null -> em dash. */
function rate(n: number | null, decimals = 3, dropLeadingZero = true): string {
  if (n === null || Number.isNaN(n)) return '—';
  const fixed = n.toFixed(decimals);
  if (dropLeadingZero && fixed.startsWith('0.')) return fixed.slice(1);
  if (dropLeadingZero && fixed.startsWith('-0.')) return `-${fixed.slice(2)}`;
  return fixed;
}

function int(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return String(n);
}

/** Percent display from a 0..1 ratio: .182 -> "18.2%". null -> em dash. */
function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function ip(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '0.0';
  return n.toFixed(1);
}

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
// Stat tiles
// -----------------------------------------------------------------------------

/** A compact label/value stat cell. `accent` highlights a headline rate. */
function StatPair({
  label,
  value,
  accent,
  title,
}: {
  label: string;
  value: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <div className="flex flex-col" title={title}>
      <span className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
        {label}
      </span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          accent ? 'text-primary-700' : 'text-warm-900',
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** The headline four-stat "hero" row for a family (e.g. the slash line). */
function HeroLine({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="mb-2.5 grid grid-cols-4 gap-2 rounded-xl bg-warm-50/70 px-3 py-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center text-center">
          <span className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
            {it.label}
          </span>
          <span className="text-base font-bold tabular-nums text-warm-900">
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Section header for a stat family inside a player card. */
function FamilyHeading({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-500">
        {title}
      </p>
      {meta && (
        <p className="text-eyebrow font-medium tabular-nums text-warm-400">{meta}</p>
      )}
    </div>
  );
}

function BattingBlock({ b }: { b: BattingSplit }) {
  return (
    <div>
      <HeroLine
        items={[
          { label: 'AVG', value: rate(b.avg) },
          { label: 'OBP', value: rate(b.obp) },
          { label: 'SLG', value: rate(b.slg) },
          { label: 'OPS', value: rate(b.ops) },
        ]}
      />
      <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
        <StatPair label="G" value={int(b.g)} />
        <StatPair label="PA" value={int(b.pa)} />
        <StatPair label="AB" value={int(b.ab)} />
        <StatPair label="H" value={int(b.h)} />
        <StatPair label="2B" value={int(b.doubles)} />
        <StatPair label="3B" value={int(b.triples)} />
        <StatPair label="HR" value={int(b.hr)} />
        <StatPair label="TB" value={int(b.tb)} />
        <StatPair label="RBI" value={int(b.rbi)} />
        <StatPair label="R" value={int(b.r)} />
        <StatPair label="BB" value={int(b.bb)} />
        <StatPair label="K" value={int(b.k)} />
        <StatPair label="HBP" value={int(b.hbp)} />
        <StatPair label="SF" value={int(b.sf)} />
        <StatPair label="SH" value={int(b.sac)} />
        <StatPair label="GIDP" value={int(b.gidp)} />
        <StatPair label="ISO" value={rate(b.iso)} title="Isolated power (SLG − AVG)" />
        <StatPair label="BB%" value={pct(b.bbPct)} title="Walk rate (BB / PA)" />
        <StatPair label="K%" value={pct(b.kPct)} title="Strikeout rate (K / PA)" />
        <StatPair label="BB/K" value={rate(b.bbK, 2, false)} />
        <StatPair label="XBH%" value={pct(b.xbhPct)} title="Extra-base-hit rate (XBH / H)" />
        <StatPair label="SB" value={`${int(b.sb)}/${int(b.sb + b.cs)}`} title="Stolen bases / attempts" />
        <StatPair label="SB%" value={pct(b.sbPct)} title="Stolen-base success" />
        <StatPair label="2-out RBI" value={int(b.twoOutRbi)} />
        <StatPair label="LOB" value={int(b.lob)} title="Left on base" />
        <StatPair label="ROE" value={int(b.roe)} title="Reached on error" />
        <StatPair label="RC" value={rate(b.rc, 1, false)} title="Runs created estimate" />
        <StatPair label="wOBA*" value={rate(b.wobaEst)} title="wOBA estimate from box-score grain" />
      </div>
    </div>
  );
}

function PitchingBlock({ p }: { p: PitchingSplit }) {
  return (
    <div>
      <HeroLine
        items={[
          { label: 'ERA', value: rate(p.era, 2, false) },
          { label: 'WHIP', value: rate(p.whip, 2, false) },
          { label: 'K/9', value: rate(p.k9, 1, false) },
          { label: 'oppBA', value: rate(p.oppBa) },
        ]}
      />
      <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
        <StatPair label="APP" value={int(p.g)} title="Appearances" />
        <StatPair label="GS" value={int(p.gs)} />
        <StatPair label="GF" value={int(p.gf)} />
        <StatPair label="W-L" value={`${int(p.w)}-${int(p.l)}`} />
        <StatPair label="SV" value={int(p.sv)} />
        <StatPair label="HLD" value={int(p.holds)} title="Holds" />
        <StatPair label="BS" value={int(p.blownSaves)} title="Blown saves" />
        <StatPair label="CG" value={int(p.cg)} title="Complete games" />
        <StatPair label="SHO" value={int(p.sho)} title="Shutouts" />
        <StatPair label="IP" value={ip(p.ip)} />
        <StatPair label="BF" value={int(p.bf)} title="Batters faced" />
        <StatPair label="H" value={int(p.h)} />
        <StatPair label="R" value={int(p.r)} />
        <StatPair label="ER" value={int(p.er)} />
        <StatPair label="BB" value={int(p.bb)} />
        <StatPair label="K" value={int(p.k)} />
        <StatPair label="HBP" value={int(p.hbp)} />
        <StatPair label="WP" value={int(p.wp)} title="Wild pitches" />
        <StatPair label="BK" value={int(p.balk)} title="Balks" />
        <StatPair label="HR" value={int(p.hr)} />
        <StatPair label="BB/9" value={rate(p.bb9, 1, false)} />
        <StatPair label="HR/9" value={rate(p.hr9, 1, false)} />
        <StatPair label="H/9" value={rate(p.h9, 1, false)} />
        <StatPair label="K%" value={pct(p.kPct)} title="K / BF" />
        <StatPair label="BB%" value={pct(p.bbPct)} title="BB / BF" />
        <StatPair label="oppBA" value={rate(p.oppBa)} title="Opponent batting average" />
        <StatPair label="Str%" value={pct(p.strikePct)} title="Strike percentage" />
        <StatPair label="FPS%" value={pct(p.fpsPct)} title="First-pitch-strike %" />
        <StatPair label="LOB%" value={pct(p.lobPct)} title="Left-on-base %" />
        <StatPair label="IR-S" value={`${int(p.inheritedRunnersScored)}/${int(p.inheritedRunners)}`} title="Inherited runners scored / total" />
      </div>
    </div>
  );
}

function CatchingBlock({ c }: { c: CatchingSplit }) {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
      <StatPair label="G" value={int(c.g)} />
      <StatPair label="CS" value={int(c.caughtStealing)} title="Caught stealing" />
      <StatPair label="SBA" value={int(c.stolenBasesAllowed)} title="Stolen bases allowed" />
      <StatPair label="CS%" value={pct(c.csPct)} />
      <StatPair label="PO" value={int(c.pickoffs)} title="Pickoffs" />
      <StatPair label="BLK" value={`${int(c.blocksMade)}/${int(c.blockOpportunities)}`} title="Blocks made / opportunities" />
      <StatPair label="BLK%" value={pct(c.blockPct)} />
      <StatPair label="PB" value={int(c.passedBalls)} title="Passed balls" />
      <StatPair label="Pop" value={c.popTimeAvg != null ? `${c.popTimeAvg.toFixed(2)}s` : '—'} title="Average pop time" />
    </div>
  );
}

function FieldingBlock({ f }: { f: FieldingSplit }) {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
      <StatPair label="G" value={int(f.g)} />
      <StatPair label="PO" value={int(f.putouts)} title="Putouts" />
      <StatPair label="A" value={int(f.assists)} title="Assists" />
      <StatPair label="E" value={int(f.errors)} title="Errors" />
      <StatPair label="TC" value={int(f.chances)} title="Total chances" />
      <StatPair label="DP" value={int(f.doublePlays)} title="Double plays" />
      <StatPair label="FLD%" value={rate(f.fldPct)} title="Fielding percentage" />
      <StatPair label="Rtn%" value={pct(f.routinePct)} title="Routine-play conversion" />
    </div>
  );
}

function BaserunningBlock({ b }: { b: BaserunningSplit }) {
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
      <StatPair label="G" value={int(b.g)} />
      <StatPair label="SB" value={int(b.stolenBases)} />
      <StatPair label="CS" value={int(b.caughtStealing)} />
      <StatPair label="SB%" value={pct(b.sbPct)} />
      <StatPair label="PO" value={int(b.pickoffs)} title="Picked off" />
      <StatPair label="XBT" value={int(b.extraBasesTaken)} title="Extra bases taken" />
      <StatPair label="OOB" value={int(b.outsOnBases)} title="Outs on bases" />
      <StatPair label="H-1B" value={b.homeToFirstAvg != null ? `${b.homeToFirstAvg.toFixed(2)}s` : '—'} title="Average home-to-first" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Player card — re-composed as a scannable per-player stat sheet. Hierarchy:
// identity + reconcile badge → each stat FAMILY that has data, batting/pitching
// first (box-score truth), then catching/fielding/baserunning (official events).
// Families with no data are omitted, never shown as fake zeros.
// -----------------------------------------------------------------------------

function PlayerStatCard({
  row,
  gameSet,
  side,
}: {
  row: StatsCenterRow;
  gameSet: GameSet;
  side: StatSide | null;
}) {
  const batting = gameSet === 'official' ? row.battingOfficial : row.battingAll;
  const pitching = gameSet === 'official' ? row.pitchingOfficial : row.pitchingAll;
  const showBatting = side !== 'pitching';
  const showPitching = side !== 'batting';

  const hasPitching = pitching.g > 0;
  const hasBatting = batting.g > 0;
  // Defensive/baserunning splits are OFFICIAL-only (event-derived); show them
  // regardless of the official/all toggle and only when events were captured.
  const hasCatching = row.catchingOfficial.events > 0;
  const hasFielding = row.fieldingOfficial.events > 0;
  const hasBaserunning = row.baserunningOfficial.events > 0;

  return (
    <Card variant="raised" padding="md" className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/baseball/dashboard/players/${row.playerId}`}
            className="group/name -m-1 flex min-w-0 items-center gap-2 rounded-lg p-1 transition-colors hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            title={`Open ${playerName(row)}'s profile`}
          >
            {row.jerseyNumber !== null && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-primary-50 px-1.5 text-sm font-semibold tabular-nums text-primary-700">
                {row.jerseyNumber}
              </span>
            )}
            <h3 className="truncate text-base font-semibold text-warm-900 transition-colors group-hover/name:text-primary-700">
              {playerName(row)}
            </h3>
            <IconChevronRight
              size={16}
              className="shrink-0 text-warm-300 opacity-0 transition-all group-hover/name:translate-x-0.5 group-hover/name:text-primary-600 group-hover/name:opacity-100 group-focus-visible/name:opacity-100"
            />
          </Link>
          <p className="mt-0.5 pl-1 text-sm text-warm-500">
            {prettyPosition(row.primaryPosition)}
          </p>
        </div>
        {row.reconcile.hasSeasonRow && (
          row.reconcile.reconciled ? (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-eyebrow font-semibold text-primary-700"
              title="Official totals match the stored season line."
            >
              <IconCheckCircle2 size={12} />
              Reconciled
            </span>
          ) : (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-eyebrow font-semibold text-amber-700"
              title="Box-score-derived official totals differ from the stored season line — recalculate season stats."
            >
              <IconAlertCircle size={12} />
              Needs recalc
            </span>
          )
        )}
      </div>

      {row.noData ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-warm-200 bg-warm-50/60 px-4 py-6 text-center">
          <p className="text-sm text-warm-500">
            No box-score lines or events captured yet this season.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          {showBatting && (
            <div>
              <FamilyHeading
                title="Batting"
                meta={hasBatting ? `${int(batting.g)} G · ${int(batting.pa)} PA` : 'no appearances'}
              />
              {hasBatting ? (
                <BattingBlock b={batting} />
              ) : (
                <p className="text-sm text-warm-400">No batting lines in this game set.</p>
              )}
            </div>
          )}
          {showPitching && (
            <div>
              <FamilyHeading
                title="Pitching"
                meta={hasPitching ? `${int(pitching.g)} APP · ${ip(pitching.ip)} IP` : 'no appearances'}
              />
              {hasPitching ? (
                <PitchingBlock p={pitching} />
              ) : (
                <p className="text-sm text-warm-400">No pitching appearances in this game set.</p>
              )}
            </div>
          )}
          {hasCatching && (
            <div>
              <FamilyHeading
                title="Catching"
                meta={`${int(row.catchingOfficial.g)} G · official events`}
              />
              <CatchingBlock c={row.catchingOfficial} />
            </div>
          )}
          {hasFielding && (
            <div>
              <FamilyHeading
                title="Fielding"
                meta={`${int(row.fieldingOfficial.g)} G · official events`}
              />
              <FieldingBlock f={row.fieldingOfficial} />
            </div>
          )}
          {hasBaserunning && (
            <div>
              <FamilyHeading
                title="Baserunning"
                meta={`${int(row.baserunningOfficial.g)} G · official events`}
              />
              <BaserunningBlock b={row.baserunningOfficial} />
            </div>
          )}
        </div>
      )}

      {/* Drill-in footer — pinned to the bottom so every card aligns. Profile
          drill lives on the name above; this is the explicit deep-stats route,
          matching the roster card's "View stats" affordance. */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-warm-100 pt-3">
        <Link
          href={`/baseball/dashboard/players/${row.playerId}`}
          className="rounded-lg px-2 py-1 text-sm font-medium text-warm-500 transition-colors hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          View profile
        </Link>
        <Link
          href={`/baseball/dashboard/players/${row.playerId}/stats`}
          className="group/stats flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          Full stats
          <IconChevronRight
            size={16}
            className="transition-transform group-hover/stats:translate-x-0.5"
          />
        </Link>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// CSV export (client-side, current filtered rows + chosen split)
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
// Summary strip
// -----------------------------------------------------------------------------

function SummaryStrip({ model }: { model: StatsCenterReadModel }) {
  const tiles = [
    {
      label: 'Players',
      value: model.summary.rosterSize,
      icon: <IconUsers size={18} />,
      tone: 'text-warm-600',
      bg: 'bg-warm-100',
    },
    {
      label: 'With Data',
      value: model.summary.playersWithData,
      icon: <IconChartBar size={18} />,
      tone: 'text-primary-600',
      bg: 'bg-primary-50',
    },
    {
      label: 'Official Games',
      value: model.summary.officialGames,
      icon: <IconBaseball size={18} />,
      tone: 'text-warm-600',
      bg: 'bg-warm-100',
    },
    {
      label: 'Scrimmages',
      value: model.summary.scrimmages,
      icon: <IconDatabase size={18} />,
      tone: 'text-warm-600',
      bg: 'bg-warm-100',
    },
    {
      label: 'Need Recalc',
      value: model.summary.unreconciled,
      icon: <IconAlertCircle size={18} />,
      tone: model.summary.unreconciled > 0 ? 'text-amber-600' : 'text-warm-600',
      bg: model.summary.unreconciled > 0 ? 'bg-amber-50' : 'bg-warm-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label} variant="raised" padding="md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                {t.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-warm-900">
                {t.value}
              </p>
            </div>
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                t.bg,
                t.tone,
              )}
            >
              {t.icon}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Filter controls
// -----------------------------------------------------------------------------

const SIDE_OPTIONS: { value: StatSide | 'both'; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'batting', label: 'Batting' },
  { value: 'pitching', label: 'Pitching' },
];

const GAME_SET_OPTIONS: { value: GameSet; label: string; hint: string }[] = [
  { value: 'official', label: 'Official', hint: 'Games only' },
  { value: 'all', label: 'All games', hint: 'Incl. scrimmages' },
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
      className="inline-flex rounded-xl border border-warm-200 bg-cream-50 p-1"
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
              'min-h-0 rounded-lg px-3 py-1.5 text-sm font-medium',
              active
                ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-600'
                : 'text-warm-600 hover:bg-warm-100',
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
  const prefersReducedMotion = useReducedMotion();
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

  // Position options come from the (always full-roster) server model.
  const positionOptions = model.positions;

  // ---- URL persistence + server re-fetch -----------------------------------
  const applyFilters = useCallback(
    (next: { seasonYear: number; positions: string[]; side: StatSide | 'both' }) => {
      // 1. Persist to the URL so the view is shareable / bookmarkable.
      const params = new URLSearchParams(searchParams.toString());
      params.set('season', String(next.seasonYear));
      if (next.positions.length > 0) params.set('positions', next.positions.join(','));
      else params.delete('positions');
      if (next.side === 'both') params.delete('side');
      else params.set('side', next.side);
      router.replace(`?${params.toString()}`, { scroll: false });

      // 2. Re-query the read model server-side (auth + capability enforced there).
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
          // withBaseballAction sanitizes the error; show a recoverable message.
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

  const sideForCards: StatSide | null = side === 'both' ? null : side;
  const hasActiveFilters = positions.length > 0 || side !== 'both';

  const rows = model.rows;

  const handleExport = useCallback(() => {
    const csv = buildCsv(rows, gameSet);
    downloadCsv(
      `stats-center-${model.seasonYear}-${gameSet}.csv`,
      csv,
    );
  }, [rows, gameSet, model.seasonYear]);

  // ---- Unauthorized envelope (not staff) -----------------------------------
  if (!model.authorized) {
    return (
      <div className="min-h-dvh bg-cream-100">
        <div className="mx-auto max-w-[1536px] px-4 py-12 sm:px-6">
          <EmptyState
            variant="card"
            icon={<IconChartBar size={48} className="text-warm-300" />}
            title="Stats Center is for coaching staff"
            description="Your account isn't a staff member on this team, so team-wide stats aren't available here."
            action={{ label: 'Back to dashboard', href: '/baseball/dashboard' }}
          />
        </div>
      </div>
    );
  }

  // ---- Authorized view ------------------------------------------------------
  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-dvh bg-cream-100">
        <div className="mx-auto max-w-[1536px] px-4 py-8 sm:px-6">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
                {model.seasonYear} Season
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
                Stats Center
              </h1>
              <p className="mt-1 text-sm text-warm-500">
                Team-wide production. Official games vs. all games, reconciled
                against stored season totals.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl
                options={GAME_SET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={gameSet}
                onChange={setGameSet}
                ariaLabel="Game set"
              />
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
          </div>

          {/* Summary */}
          <div className="mb-6">
            <SummaryStrip model={model} />
          </div>

          {/* Honest read-model error (degraded data) */}
          {model.error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <IconAlertCircle size={16} />
              <span>{model.error}</span>
            </div>
          )}
          {refetchError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <IconAlertCircle size={16} />
              <span>{refetchError}</span>
            </div>
          )}

          {/* Filters */}
          <Card variant="overlay" padding="md" className="mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-warm-600">
                <IconFilter size={16} />
                <span className="text-sm font-medium">Filters</span>
              </div>

              {/* Season stepper */}
              <div className="flex items-center gap-1.5">
                <span className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                  Season
                </span>
                <div className="inline-flex items-center rounded-xl border border-warm-200 bg-cream-50">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Previous season"
                    onClick={() => changeSeason(-1)}
                    haptic="none"
                    className="min-h-0 rounded-l-xl rounded-r-none px-2.5 py-1.5 text-warm-600"
                  >
                    −
                  </Button>
                  <span className="min-w-[3.5rem] px-2 text-center text-sm font-semibold tabular-nums text-warm-900">
                    {seasonYear}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Next season"
                    onClick={() => changeSeason(1)}
                    haptic="none"
                    className="min-h-0 rounded-r-xl rounded-l-none px-2.5 py-1.5 text-warm-600"
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Side */}
              <div className="flex items-center gap-1.5">
                <span className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                  Side
                </span>
                <SegmentedControl
                  options={SIDE_OPTIONS}
                  value={side}
                  onChange={changeSide}
                  ariaLabel="Stat side"
                />
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearFilters}
                  haptic="none"
                  className="ml-auto min-h-0 gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-warm-500 hover:text-warm-700"
                >
                  <IconX size={14} />
                  Clear
                </Button>
              )}
            </div>

            {/* Position chips */}
            {positionOptions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                  Position
                </span>
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
                          ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-600'
                          : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-warm-300 hover:bg-warm-50',
                      )}
                    >
                      {prettyPosition(pos)}
                    </Button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Grid */}
          {rows.length === 0 ? (
            <EmptyState
              variant="card"
              icon={<IconUsers size={48} className="text-warm-300" />}
              title={
                hasActiveFilters
                  ? 'No players match these filters'
                  : 'No players on this roster yet'
              }
              description={
                hasActiveFilters
                  ? 'Try clearing the position or side filter, or pick another season.'
                  : 'Once players are rostered and box scores are captured, their stats will appear here.'
              }
              action={
                hasActiveFilters
                  ? { label: 'Clear filters', onClick: clearFilters }
                  : { label: 'Go to roster', href: '/baseball/dashboard/roster' }
              }
            />
          ) : (
            <div
              className={cn(
                'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3',
                isPending && 'opacity-60 transition-opacity',
              )}
              aria-busy={isPending}
            >
              {rows.map((row, i) => (
                <m.div
                  key={row.playerId}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: prefersReducedMotion ? 0 : Math.min(i * 0.02, 0.2),
                  }}
                >
                  <PlayerStatCard row={row} gameSet={gameSet} side={sideForCards} />
                </m.div>
              ))}
            </div>
          )}

          {/* V10 stat-visual chart gallery — team scope, fed by the elite
              stat-event read model (chase/whiff/EV-LA/spray/pitch-shape/...).
              Honest: empty/insufficient frames when no events are captured. */}
          <div className="mt-10">
            <StatVisualsSection
              scope="team"
              data={statVisualsData}
              savedViews={statVisualViews.savedViews}
              onSaveView={statVisualViews.onSaveView}
              onSetPinned={statVisualViews.onSetPinned}
            />
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}
