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
// Imported from each module's own leaf path, not the top `@/components/fairway`
// barrel — this file is itself re-exported (via pages/coachhelm/index.ts) from
// that barrel, so importing the barrel back here created an import cycle,
// flagged by npm run check:cycles.
import { InstrumentPanel } from '@/components/fairway/instrument';
import { Eyebrow } from '@/components/fairway/controls/eyebrow';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import {
  GenomeFingerprint,
  type GenomeDimension as FingerprintDimension,
} from '@/components/fairway/charts';
import { StatusPill, Avatar } from '@/components/fairway/controls';
import { EmptyState } from '@/components/fairway/feedback';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { formatGenomeRefreshed } from '@/lib/coachhelm/v3/genome/format-refreshed';
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
  /**
   * When this vector was computed, and off how many rounds.
   *
   * `loadGenomes` selects both (genome/loader.ts:61) and `GenomeDetailView`
   * renders them; this surface used to drop them at the props boundary, so a
   * head-to-head showed six-week-old vectors with nothing saying so. Measured
   * 2026-08-17, the newest `computed_at` in production was 41 days old.
   *
   * Null is honest, not a default: a player with no genome has no computation
   * to date, and the "no genome computed" chip already covers that case.
   */
  computedAt: string | null;
  roundsBasis: number | null;
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
const PLAYER_B_DOT = 'var(--fw-viz-div-neg)'; // the chart's amber side

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

/** One dimension both players have live, with who leads it. */
export interface CompareLead {
  label: string;
  a: number;
  b: number;
  /** a − b on the shared 0–100 scale. */
  diff: number;
}

/** Dimensions both players have live, largest gap first. Never invents a
 *  reading: a dimension missing on either side is left out. */
export function compareLeads(
  a: ReadonlyArray<FingerprintDimension>,
  b: ReadonlyArray<FingerprintDimension>,
): CompareLead[] {
  const bByLabel = new Map(b.map((d) => [d.label, d.value]));
  const out: CompareLead[] = [];
  for (const d of a) {
    const bv = bByLabel.get(d.label);
    if (d.value == null || bv == null) continue;
    out.push({ label: d.label, a: d.value, b: bv, diff: d.value - bv });
  }
  return out.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

function joinLabels(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.length <= 1) return lower.join('');
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

/** One plain line for the head-to-head: who leads where, top two per side. */
export function compareTakeaway(nameA: string, nameB: string, leads: CompareLead[]): string {
  if (leads.length < 3) {
    return `Only ${leads.length} ${leads.length === 1 ? 'dimension is' : 'dimensions are'} live for both players; a fair comparison needs at least 3.`;
  }
  const aTop = leads.filter((l) => l.diff > 0).slice(0, 2).map((l) => l.label);
  const bTop = leads.filter((l) => l.diff < 0).slice(0, 2).map((l) => l.label);
  if (aTop.length && bTop.length) {
    return `${nameA} leads on ${joinLabels(aTop)}; ${nameB} leads on ${joinLabels(bTop)}.`;
  }
  if (aTop.length) return `${nameA} leads on every shared dimension, most on ${joinLabels(aTop)}.`;
  if (bTop.length) return `${nameB} leads on every shared dimension, most on ${joinLabels(bTop)}.`;
  return 'The two players read level on every shared dimension.';
}

/* ────────────────────────────────────────────────────────────────────────────
 * GenomeCompareView
 * ─────────────────────────────────────────────────────────────────────────── */

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

  const aLive = liveCount(seriesA?.vector ?? null);
  const bLive = liveCount(seriesB?.vector ?? null);
  const leads = React.useMemo(() => (isCompare ? compareLeads(aData, bData) : []), [isCompare, aData, bData]);
  const aLeads = leads.filter((l) => l.diff > 0).length;
  const bLeads = leads.filter((l) => l.diff < 0).length;

  const title =
    seriesA && seriesB
      ? `${seriesA.name} vs ${seriesB.name}`
      : seriesA
        ? `Add a second player to compare ${seriesA.name}`
        : seriesB
          ? `Add a second player to compare ${seriesB.name}`
          : 'Pick two players to compare';

  const anySelected = Boolean(seriesA || seriesB);
  const bothSelected = Boolean(seriesA && seriesB);
  // The one side that has a genome when the other does not.
  const solo = !isCompare ? (aHasGenome ? seriesA : bHasGenome ? seriesB : null) : null;
  const soloData = aHasGenome ? aData : bData;
  const missing = [seriesA && !aHasGenome ? seriesA.name : null, seriesB && !bHasGenome ? seriesB.name : null].filter(
    (n): n is string => Boolean(n),
  );

  return (
    <CoachHelmShell
      active="players"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title={title}
      description="Genome comparison"
      breadcrumbs={[{ label: 'Players', href: '/golf/dashboard/intelligence?view=players' }, { label: 'Compare' }]}
      className={className}
    >
      <div className="flex flex-col gap-6">
        {!anySelected ? (
          <section className="rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6">
            <EmptyState
              icon={LucideUsers}
              title="Pick two players to compare"
              description="Choose a player for each slot below to put their genomes side by side."
            />
          </section>
        ) : (
          /* ── Summary first (owner direction 2026-09-25): the key number,
              one takeaway, and the one visual — the diverging bars. ── */
          <section
            aria-label="Genome comparison summary"
            data-slot="genome-compare-summary"
            className="flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6"
          >
            <div className="flex flex-col gap-1">
              <Eyebrow as="p">
                {isCompare
                  ? `Head to head · ${leads.length} of ${totalDims} dimensions live for both`
                  : solo
                    ? `${solo.name} · ${solo === seriesA ? aLive : bLive} of ${totalDims} dimensions live`
                    : 'Head to head'}
              </Eyebrow>
              {isCompare ? (
                <p
                  className="flex items-center gap-3 font-fw-mono text-display tabular-nums text-text-primary"
                  data-slot="genome-compare-score"
                >
                  <span className="sr-only">{`${seriesA?.name} leads ${aLeads}, ${seriesB?.name} leads ${bLeads}`}</span>
                  <span aria-hidden className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PLAYER_A_DOT }} />
                    {aLeads}
                  </span>
                  <span aria-hidden className="text-title-2 text-text-tertiary">–</span>
                  <span aria-hidden className="flex items-center gap-2">
                    {bLeads}
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PLAYER_B_DOT }} />
                  </span>
                </p>
              ) : null}
              <p className="text-body text-text-secondary" data-slot="genome-compare-takeaway">
                {isCompare
                  ? compareTakeaway(seriesA?.name ?? 'Player 1', seriesB?.name ?? 'Player 2', leads)
                  : !bothSelected
                    ? 'Pick a second player below to compare.'
                    : solo
                      ? `${missing.join(' and ')} has no genome yet, so there is nothing to compare. Below: ${solo.name} against the 50 midline.`
                      : 'Neither player has a genome yet. One is built after enough recent rounds.'}
              </p>
            </div>

            <ul className="flex flex-col gap-2 border-t border-border-subtle pt-4" aria-label="Players compared">
              {seriesA ? <SeriesLine series={seriesA} dot={PLAYER_A_DOT} live={aLive} totalDims={totalDims} /> : null}
              {seriesB ? <SeriesLine series={seriesB} dot={PLAYER_B_DOT} live={bLive} totalDims={totalDims} /> : null}
            </ul>

            {isCompare ? (
              <GenomeFingerprint
                title="Who leads where"
                data={aData}
                seriesName={seriesA?.name ?? 'Player 1'}
                compareWith={bData}
                compareName={seriesB?.name ?? 'Player 2'}
                height={Math.max(260, leads.length * 36 + 48)}
                className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
              />
            ) : solo ? (
              <GenomeFingerprint
                title={`${solo.name} vs the 50 midline`}
                data={soloData}
                seriesName={solo.name}
                height={Math.max(260, (solo === seriesA ? aLive : bLive) * 36 + 48)}
                className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
              />
            ) : null}
          </section>
        )}

        {/* ── Pickers (preserve the ?p1=&p2= Link-based selection). Open until
            both slots are filled; one tap away after that. ── */}
        <Disclosure
          title="Change players"
          slot="genome-compare-pickers"
          defaultOpen={!bothSelected}
          meta={
            <span className="min-w-0 truncate text-caption font-normal text-text-secondary">
              {[seriesA?.name, seriesB?.name].filter(Boolean).join(' vs ') || 'None picked'}
            </span>
          }
        >
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
        </Disclosure>
      </div>
    </CoachHelmShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SeriesLine — one player: colour key, live dimensions, and provenance
 * (rounds basis + when the genome was computed). A player with no genome says
 * so and claims no freshness.
 * ─────────────────────────────────────────────────────────────────────────── */

function SeriesLine({
  series,
  dot,
  live,
  totalDims,
}: {
  series: CompareSeries;
  dot: string;
  live: number;
  totalDims: number;
}) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
        <span className="font-medium text-text-primary">{series.name}</span>
        {series.vector ? (
          <span className="text-caption text-text-secondary">
            <span className="font-fw-mono tabular-nums text-text-primary">{live}</span> of {totalDims} live
          </span>
        ) : (
          <StatusPill tone="neutral" size="sm">
            No genome computed
          </StatusPill>
        )}
      </span>
      <GenomeProvenance series={series} />
    </li>
  );
}

function GenomeProvenance({ series }: { series: CompareSeries }) {
  if (!series.vector) return null;
  const refreshed = formatGenomeRefreshed(series.computedAt);
  if (!refreshed && series.roundsBasis == null) return null;

  const rounds =
    series.roundsBasis == null
      ? null
      : `${series.roundsBasis} ${series.roundsBasis === 1 ? 'round' : 'rounds'}`;

  return (
    <p className="pl-[18px] font-fw-mono text-caption tabular-nums text-text-tertiary">
      {[rounds, refreshed ? `last refreshed ${refreshed}` : null].filter(Boolean).join(' · ')}
    </p>
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
                      'flex min-h-11 cursor-not-allowed items-center gap-3 rounded-fw-sm px-2.5 py-2 opacity-50',
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
                      'flex min-h-11 items-center gap-3 rounded-fw-sm px-2.5 py-2',
                      'transition-[background-color,color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
                      'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                      'motion-reduce:transition-none',
                      selected
                        ? 'bg-accent-50 text-fw-success-ink'
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
