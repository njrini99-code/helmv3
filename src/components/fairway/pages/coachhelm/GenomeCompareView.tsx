'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · GenomeCompareView — two-up compare INSTRUMENT
 * ----------------------------------------------------------------------------
 * The head-to-head player genome comparison, re-skinned into the warm-glass
 * instrument cockpit: the GenomeFingerprint DIVERGING BARS are the signature
 * hero art, mounted bare into a RAISED accent glass InstrumentPanel.
 *
 * CRITICAL VIZ CORRECTION (DESIGN-SYSTEM §5.2 / blueprint cohesionResolutions):
 *   compare two players via GenomeFingerprint DIVERGING BARS (green vs amber on a
 *   shared 0–100 scale), NEVER two overlaid GenomeRadar series. The single radar
 *   stays the one-player hero glance (GenomeDetailView); this surface keeps the
 *   fingerprint as its hero. The numeric dimension table ships with the chart
 *   (ChartFrame "view as table") — color/length is never the only channel.
 *
 * ── THE COCKPIT ─────────────────────────────────────────────────────────────
 *   PRIMARY (focal, RAISED accent glass) — the GenomeFingerprint diverging bars
 *     (A−B) on the shared scale, with the legend + honest "no genome computed"
 *     chips and the maturity caption. Honest <3-comparable-dim awaiting state via
 *     the fingerprint's own insufficient-data path.
 *   TERTIARY foot row — micro Readouts: each player's live-dimension count + the
 *     comparable set.
 *   BELOW — the two Link-based pickers on base glass panels.
 *
 * PRESERVE + IMPORT UNCHANGED (blueprint consumesLoaders):
 *   src/lib/coachhelm/v3/genome/loader.ts#loadGenomes  (read above the fork)
 *   src/lib/coachhelm/v3/genome/registry.ts#GENOME_DIMENSIONS
 *   src/lib/coachhelm/v3/genome/normalize.ts#normalizeForRadar
 * The ?p1=&p2= Link-based picker state is PRESERVED verbatim (each pick is a
 * <Link> that locks the other slot + preserves the other param) — no client
 * router writes, no loader change.
 *
 * ADDITIVE ONLY — renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CoachHelmShell } from './CoachHelmShell';
import {
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  GenomeFingerprint,
  type GenomeDimension as FingerprintDimension,
  StatusPill,
  Avatar,
  EmptyState,
} from '@/components/fairway';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import { IconCheck } from '@/components/icons';
import { Users as LucideUsers } from 'lucide-react';

/* ---------------------------------------------------------------------------
 * Props — mirror the genome/compare route's reads (serializable)
 * ------------------------------------------------------------------------- */

export interface ComparePlayerOption {
  id: string;
  name: string;
  avatar_url?: string | null;
}

export interface CompareSeries {
  playerId: string;
  name: string;
  /** The loaded genome vector, or null when the player has no genome computed. */
  vector: GenomeVector | null;
}

export interface GenomeCompareViewProps {
  /** Active-roster picker options. */
  roster: ComparePlayerOption[];
  /** Selected player ids from ?p1= / ?p2= (null when unfilled). */
  p1: string | null;
  p2: string | null;
  /** The two resolved series (vector may be null → "no genome computed"). */
  seriesA: CompareSeries | null;
  seriesB: CompareSeries | null;
  /** SSR-known urgent/high open-signal count for the shell badge. */
  signalCount?: number | null;
  className?: string;
}

const PLAYER_A_DOT = 'var(--fw-color-accent-500, #16A34A)'; // helm green
const PLAYER_B_DOT = '#F59E0B'; // amber 500

/* ---------------------------------------------------------------------------
 * Vector → fingerprint dimensions (shared label set; null when not computed)
 * ------------------------------------------------------------------------- */

function toFingerprint(vector: GenomeVector | null): FingerprintDimension[] {
  return GENOME_DIMENSIONS.map((dim) => {
    if (!vector) return { label: dim.label, value: null };
    const r = vector[dim.id];
    const norm = r ? normalizeForRadar(dim.id, r) : null;
    return { label: dim.label, value: norm == null ? null : Math.round(norm * 100) };
  });
}

function liveCount(vector: GenomeVector | null): number {
  if (!vector) return 0;
  return GENOME_DIMENSIONS.reduce((acc, dim) => {
    const r = vector[dim.id];
    const norm = r ? normalizeForRadar(dim.id, r) : null;
    return acc + (norm == null ? 0 : 1);
  }, 0);
}

/* ---------------------------------------------------------------------------
 * GenomeCompareView
 * ------------------------------------------------------------------------- */

export function GenomeCompareView({
  roster,
  p1,
  p2,
  seriesA,
  seriesB,
  signalCount,
  className,
}: GenomeCompareViewProps) {
  const totalDims = GENOME_DIMENSIONS.length;

  const aData = React.useMemo(() => toFingerprint(seriesA?.vector ?? null), [seriesA]);
  const bData = React.useMemo(() => toFingerprint(seriesB?.vector ?? null), [seriesB]);

  const aHasGenome = Boolean(seriesA?.vector);
  const bHasGenome = Boolean(seriesB?.vector);
  const isCompare = aHasGenome && bHasGenome;

  // Honest "N of M live" — the lower of the two live counts (the comparable set).
  const aLive = liveCount(seriesA?.vector ?? null);
  const bLive = liveCount(seriesB?.vector ?? null);
  const comparableLive = isCompare ? Math.min(aLive, bLive) : aHasGenome ? aLive : bLive;
  const maturityCaption = `${comparableLive} of ${totalDims} dimensions live · more land as data matures`;

  const title =
    seriesA && seriesB
      ? `${seriesA.name} vs ${seriesB.name}`
      : seriesA
        ? `Add a second player to compare ${seriesA.name}`
        : 'Pick two players to compare';

  const anySelected = Boolean(seriesA || seriesB);

  return (
    <CoachHelmShell
      active="players"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title={title}
      description={anySelected ? maturityCaption : 'Overlay two players to see who is stronger where.'}
      // Canonical destination directly, not the /development redirect shim
      // (React #310 legacy-link audit, 2026-07-22).
      breadcrumbs={[{ label: 'Players', href: '/golf/dashboard/intelligence?view=players' }, { label: 'Compare' }]}
      className={className}
    >
      <div className="flex flex-col gap-6">
        {/* ── THE COCKPIT — the diverging-bar fingerprint as the focal hero ── */}
        {!anySelected ? (
          <InstrumentPanel depth="raised" tone="accent" padding="lg" as="section">
            <EmptyState
              icon={LucideUsers}
              title="Pick two players to compare"
              description="Select a player from each list below to overlay their game-profile fingerprints."
            />
          </InstrumentPanel>
        ) : (
          <InstrumentCluster
            ariaLabel="Genome comparison instrument cluster"
            balance="focal"
            tertiaryColumns={2}
            primary={
              <InstrumentPanel
                depth="raised"
                tone={isCompare ? 'accent' : 'neutral'}
                padding="lg"
                as="section"
                className="flex h-full flex-col gap-5"
              >
                <GenomeFingerprint
                  title="Genome fingerprint"
                  subtitle={maturityCaption}
                  data={aHasGenome ? aData : bData}
                  seriesName={aHasGenome ? (seriesA?.name ?? 'Player A') : (seriesB?.name ?? 'Player B')}
                  compareWith={isCompare ? bData : undefined}
                  compareName={seriesB?.name ?? 'Player B'}
                  height={Math.max(320, totalDims * 30 + 64)}
                  takeaway={
                    isCompare
                      ? `Green bars lead for ${seriesA?.name}; amber bars lead for ${seriesB?.name}.`
                      : undefined
                  }
                  actions={
                    <div className="flex flex-wrap items-center gap-4">
                      {seriesA ? (
                        <LegendItem name={seriesA.name} dot={PLAYER_A_DOT} hasGenome={aHasGenome} />
                      ) : null}
                      {seriesB ? (
                        <LegendItem name={seriesB.name} dot={PLAYER_B_DOT} hasGenome={bHasGenome} />
                      ) : null}
                    </div>
                  }
                  className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
                />
              </InstrumentPanel>
            }
            secondary={[
              <CompareReadoutRail
                key="rail"
                seriesA={seriesA}
                seriesB={seriesB}
                aLive={aLive}
                bLive={bLive}
                aHasGenome={aHasGenome}
                bHasGenome={bHasGenome}
                comparableLive={comparableLive}
                totalDims={totalDims}
              />,
            ]}
          />
        )}

        {/* ── Pickers (preserve the ?p1=&p2= Link-based selection) ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ComparePicker
            heading="Player 1"
            paramName="p1"
            selectedId={p1}
            otherId={p2}
            otherParamValue={p2}
            roster={roster}
            dotColor={PLAYER_A_DOT}
          />
          <ComparePicker
            heading="Player 2"
            paramName="p2"
            selectedId={p2}
            otherId={p1}
            otherParamValue={p1}
            roster={roster}
            dotColor={PLAYER_B_DOT}
          />
        </div>
      </div>
    </CoachHelmShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * COMPARE READOUT RAIL — the secondary rail. Honest per-player live-dimension
 * Readouts + the comparable-set count, on base inset panels.
 * ─────────────────────────────────────────────────────────────────────────── */
function CompareReadoutRail({
  seriesA,
  seriesB,
  aLive,
  bLive,
  aHasGenome,
  bHasGenome,
  comparableLive,
  totalDims,
}: {
  seriesA: CompareSeries | null;
  seriesB: CompareSeries | null;
  aLive: number;
  bLive: number;
  aHasGenome: boolean;
  bHasGenome: boolean;
  comparableLive: number;
  totalDims: number;
}) {
  return (
    <InstrumentPanel
      depth="base"
      padding="lg"
      header="Comparable set"
      as="section"
      className="flex h-full flex-col gap-4"
    >
      {seriesA ? (
        <InstrumentPanel depth="inset" padding="sm">
          <Readout
            value={aLive}
            format={{ maximumFractionDigits: 0 }}
            unit={`of ${totalDims}`}
            label={`${seriesA.name} · live dims`}
            size="md"
            state={aHasGenome && aLive > 0 ? 'live' : 'awaiting'}
            samples={!aHasGenome || aLive === 0 ? { have: aLive, need: 3 } : undefined}
            awaitingLabel={aHasGenome ? 'Awaiting data' : 'No genome'}
          />
        </InstrumentPanel>
      ) : null}

      {seriesB ? (
        <InstrumentPanel depth="inset" padding="sm">
          <Readout
            value={bLive}
            format={{ maximumFractionDigits: 0 }}
            unit={`of ${totalDims}`}
            label={`${seriesB.name} · live dims`}
            size="md"
            state={bHasGenome && bLive > 0 ? 'live' : 'awaiting'}
            samples={!bHasGenome || bLive === 0 ? { have: bLive, need: 3 } : undefined}
            awaitingLabel={bHasGenome ? 'Awaiting data' : 'No genome'}
          />
        </InstrumentPanel>
      ) : null}

      <InstrumentPanel depth="inset" padding="sm">
        <Readout
          value={comparableLive}
          format={{ maximumFractionDigits: 0 }}
          unit={`of ${totalDims}`}
          label="Comparable dims"
          size="md"
          state={comparableLive > 0 ? 'live' : 'awaiting'}
          samples={comparableLive === 0 ? { have: 0, need: 3 } : undefined}
          awaitingLabel="Need both genomes"
        />
      </InstrumentPanel>
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * LegendItem — colored dot + name + honest "no genome" chip
 * ─────────────────────────────────────────────────────────────────────────── */

function LegendItem({
  name,
  dot,
  hasGenome,
}: {
  name: string;
  dot: string;
  hasGenome: boolean;
}) {
  return (
    <span className="flex items-center gap-2 font-fw-sans text-body-sm text-text-secondary">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: dot }}
      />
      <span className="font-medium text-text-primary">{name}</span>
      {!hasGenome ? (
        <StatusPill tone="neutral" size="sm">
          No genome computed
        </StatusPill>
      ) : null}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * ComparePicker — real <Link> rows; locks the other slot, preserves other param.
 * Dense list stays MATTE + legible (glass is for the hero instruments, not this).
 * ─────────────────────────────────────────────────────────────────────────── */

function ComparePicker({
  heading,
  paramName,
  selectedId,
  otherId,
  otherParamValue,
  roster,
  dotColor,
}: {
  heading: string;
  paramName: 'p1' | 'p2';
  selectedId: string | null;
  otherId: string | null;
  otherParamValue: string | null;
  roster: ComparePlayerOption[];
  dotColor: string;
}) {
  const otherParam = paramName === 'p1' ? 'p2' : 'p1';

  // Build the href for selecting a roster player into this slot, preserving the
  // other slot's selection (verbatim behavior of the legacy GenomeComparePicker).
  function hrefFor(id: string): string {
    const params = new URLSearchParams();
    params.set(paramName, id);
    if (otherParamValue) params.set(otherParam, otherParamValue);
    return `/golf/dashboard/coachhelm/genome/compare?${params.toString()}`;
  }

  return (
    <InstrumentPanel depth="base" padding="sm" className="space-y-2" as="section">
      <div className="flex items-center gap-2 px-1">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
        <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
          {heading}
        </p>
      </div>

      {roster.length === 0 ? (
        <p className="px-2 py-3 font-fw-sans text-body-sm text-text-tertiary">
          No active players to compare.
        </p>
      ) : (
        <ul className="max-h-[360px] space-y-0.5 overflow-y-auto">
          {roster.map((p) => {
            const selected = selectedId === p.id;
            const lockedByOther = otherId === p.id;
            return (
              <li key={p.id}>
                {lockedByOther ? (
                  <div
                    aria-disabled
                    className={cn(
                      'flex cursor-not-allowed items-center gap-3 rounded-fw-sm px-2.5 py-2 opacity-50',
                    )}
                  >
                    <Avatar decorative src={p.avatar_url} name={p.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-tertiary">
                      {p.name}
                    </span>
                    <span className="font-fw-sans text-eyebrow text-text-tertiary">
                      in other slot
                    </span>
                  </div>
                ) : (
                  <Link
                    href={hrefFor(p.id)}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-fw-sm px-2.5 py-2',
                      'transition-[background-color,color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
                      'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      'motion-reduce:transition-none',
                      selected
                        ? 'bg-accent-50 text-accent-800'
                        : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                    )}
                  >
                    <Avatar decorative src={p.avatar_url} name={p.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium">
                      {p.name}
                    </span>
                    {selected ? (
                      <IconCheck size={15} className="flex-shrink-0 text-accent-600" />
                    ) : null}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </InstrumentPanel>
  );
}
