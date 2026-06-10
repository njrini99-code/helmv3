'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · GenomeDetailView — single-player genome INSTRUMENT
 * ----------------------------------------------------------------------------
 * The per-player game-profile detail, re-skinned into the warm-glass instrument
 * cockpit (matching FairwayEffectiveness): the player's genome FINGERPRINT is
 * the hero art, not a grid of equal cards. Shared by BOTH /genome/[playerId]
 * AND the Nick Rini sample UUID (same component, same fork).
 *
 * ── THE COCKPIT (ranked focal → secondary → tertiary) ───────────────────────
 *   PRIMARY (focal, RAISED accent glass) — the GenomeRadar as a LARGE hero
 *     centerpiece: this player's fingerprint shape, mounted bare into the bezel
 *     of the raised panel (the radar IS the hero). Honest <3-dim awaiting state.
 *   SECONDARY rail — the PERSONA instrument (strengths Readout-style rows +
 *     watchouts that each → a Focus Area, preserving the close-the-loop link).
 *   TERTIARY foot row — micro Readouts: live dimensions, rounds basis, last
 *     refreshed.
 *   BELOW — the dimension grid as inset instrument readouts (locked spokes are
 *     DIM "needs more rounds" calibration cells, never a fake 0), then this
 *     player's FocusAreaCards (role="coach" outcome capture preserved).
 *
 * PRESERVE + IMPORT UNCHANGED (blueprint consumesLoaders):
 *   src/lib/coachhelm/v3/genome/loader.ts#loadGenome   (read above the fork)
 *   src/lib/coachhelm/v3/genome/persona.ts#derivePersona (read above the fork)
 *   src/lib/coachhelm/v3/genome/registry.ts#GENOME_DIMENSIONS,getDimension
 *   src/lib/coachhelm/v3/genome/normalize.ts#normalizeForRadar (good-axis 0–1)
 *   src/app/api/coachhelm/v3/genome/compute/route.ts#POST (the Compute-now target)
 *   src/app/golf/actions/development.ts (recordFocusAreaOutcome, threaded as
 *     onRecordOutcome below — the closed outcome loop is UNCHANGED).
 *
 * The route does the loadGenome/derivePersona reads server-side and passes the
 * serialized RESULTS to this client surface — this is a PRESENTATION rebuild,
 * never a re-run of a DB read. Outcome capture (Improved / No change / Worsened)
 * stays wired through handleRecordOutcome → recordFocusAreaOutcome.
 *
 * ADDITIVE ONLY — renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CoachHelmShell } from './CoachHelmShell';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';
import {
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  GenomeRadar,
  type GenomeAxis,
  Button,
  Badge,
  StatusPill,
  EmptyState,
  InlineNotice,
  InsufficientData,
  fairwayToast,
} from '@/components/fairway';
import {
  recordFocusAreaOutcome,
  type FocusAreaOutcome,
} from '@/app/golf/actions/development';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import type { GenomeVector, DimensionResult } from '@/lib/coachhelm/v3/genome/types';
import type { Persona, PersonaEntry } from '@/lib/coachhelm/v3/genome/persona';
import {
  IconWarning,
  IconCheckCircle2,
  IconLock,
  IconArrowRight,
} from '@/components/icons';
import { GitCompare as LucideGitCompare, Dna as LucideDna } from 'lucide-react';

/* ---------------------------------------------------------------------------
 * Props — mirror the genome/[playerId] route's reads (serializable)
 * ------------------------------------------------------------------------- */

export interface GenomeDetailViewProps {
  playerId: string;
  playerName: string;
  /** The loaded genome (null when none computed yet → Compute-now empty state). */
  genome: {
    vector: GenomeVector;
    computed_at: string | null;
    rounds_basis: number;
  } | null;
  /** Derived persona (null when no genome). */
  persona: Persona | null;
  /** This player's focus areas (for the spine). */
  focusAreas?: FocusAreaCardData[];
  /** SSR-known urgent/high open-signal count for the shell badge. */
  signalCount?: number | null;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Dimension helpers — radar axes + grid rows from the vector (no fake zeros)
 * ------------------------------------------------------------------------- */

interface DimRow {
  id: string;
  label: string;
  /** Normalized 0–100 on the radar good-axis, or null when locked. */
  score: number | null;
  /** Qualitative label from compute() (e.g. "Left bias", "Steady"). */
  qualitative: string | null;
  /** Raw value (number or string). */
  raw: number | string | null;
  confidence: number | null;
  /** True when the dimension has no computed value (needs more rounds). */
  locked: boolean;
}

function buildDimRows(vector: GenomeVector): DimRow[] {
  return GENOME_DIMENSIONS.map((dim) => {
    const r: DimensionResult | undefined = vector[dim.id];
    const norm = r ? normalizeForRadar(dim.id, r) : null;
    const score = norm == null ? null : Math.round(norm * 100);
    const locked = !r || r.value === null;
    return {
      id: dim.id,
      label: dim.label,
      score,
      qualitative: r?.label ?? null,
      raw: r?.value ?? null,
      confidence: r?.confidence ?? null,
      locked,
    };
  });
}

function formatAgo(iso: string | null): string {
  if (!iso) return 'just now';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------------------------------------------------------------------------
 * GenomeDetailView
 * ------------------------------------------------------------------------- */

export function GenomeDetailView({
  playerId,
  playerName,
  genome,
  persona,
  focusAreas = [],
  signalCount,
  className,
}: GenomeDetailViewProps) {
  const router = useRouter();
  const [computing, setComputing] = React.useState(false);
  const [computeError, setComputeError] = React.useState<string | null>(null);

  const dimRows = React.useMemo(
    () => (genome ? buildDimRows(genome.vector) : []),
    [genome],
  );
  const liveRows = dimRows.filter((d) => !d.locked && d.score != null);
  const totalDims = GENOME_DIMENSIONS.length;

  // Radar axes — ONLY live dimensions (locked spokes are never plotted as 0).
  const radarData: GenomeAxis[] = liveRows.map((d) => ({ label: d.label, value: d.score! }));

  // The honest maturity caption — "8 of 80 dimensions live" style.
  const maturityCaption = `${liveRows.length} of ${totalDims} dimensions live · more land as data matures`;

  async function handleCompute() {
    setComputing(true);
    setComputeError(null);
    try {
      const res = await fetch('/api/coachhelm/v3/genome/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setComputeError(body?.error ?? 'Compute failed — please try again.');
        fairwayToast.error('Could not compute genome');
        return;
      }
      fairwayToast.success('Genome computed — refreshing');
      router.refresh();
    } catch {
      setComputeError('Compute failed — please try again.');
      fairwayToast.error('Could not compute genome');
    } finally {
      setComputing(false);
    }
  }

  // Record outcome: credits the source insight + completes the focus area
  // (closes the effectiveness loop). The card owns the toast; refresh on success
  // so the radar/focus-areas reflect the now-completed, credited area.
  async function handleRecordOutcome(fa: FocusAreaCardData, outcome: FocusAreaOutcome) {
    const res = await recordFocusAreaOutcome(fa.id, outcome);
    if (res.success) router.refresh();
    return res;
  }

  const headerActions = genome ? (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<LucideGitCompare size={15} />}
      asChild
    >
      <Link href={`/golf/dashboard/coachhelm/genome/compare?p1=${playerId}`}>Compare</Link>
    </Button>
  ) : null;

  const activeAreas = focusAreas.filter((fa) => fa.status !== 'completed');

  return (
    <CoachHelmShell
      active="players"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title={playerName}
      description={
        genome
          ? `${genome.rounds_basis} rounds · last refreshed ${formatAgo(genome.computed_at)}`
          : 'Genome not computed yet'
      }
      breadcrumbs={[
        { label: 'Players', href: '/golf/dashboard/development' },
        { label: playerName },
      ]}
      actions={headerActions}
      className={className}
    >
      <div className="flex flex-col gap-6">
        {genome ? (
          <>
            {/* ── THE COCKPIT — radar hero focal, persona rail, micro foot row ── */}
            <InstrumentCluster
              ariaLabel={`${playerName} genome instrument cluster`}
              balance="focal"
              tertiaryColumns={3}
              primary={
                <GenomeHeroInstrument
                  data={radarData}
                  liveCount={liveRows.length}
                  maturityCaption={maturityCaption}
                  courseProfile={persona?.course_profile}
                />
              }
              secondary={[
                <PersonaInstrument
                  key="persona"
                  persona={persona}
                  playerId={playerId}
                  playerName={playerName}
                />,
              ]}
              tertiary={[
                <LiveDimensionsReadout key="live" live={liveRows.length} total={totalDims} />,
                <RoundsBasisReadout key="rounds" rounds={genome.rounds_basis} />,
                <RefreshedReadout key="refreshed" computedAt={genome.computed_at} />,
              ]}
            />

            {/* ── Dimension grid — inset readout cells; locked = dim "needs rounds" ── */}
            <InstrumentPanel
              depth="base"
              padding="lg"
              header="Dimensions"
              as="section"
              readout={
                <span className="font-fw-sans text-eyebrow text-text-tertiary">
                  {maturityCaption}
                </span>
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {dimRows.map((d) => (
                  <DimensionCell key={d.id} dim={d} />
                ))}
              </div>
            </InstrumentPanel>

            {/* ── This player's focus areas — outcome capture loop PRESERVED ── */}
            <InstrumentPanel
              depth="base"
              padding="lg"
              header="Focus areas"
              as="section"
              readout={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/golf/dashboard/development?player=${playerId}`}>Manage</Link>
                </Button>
              }
            >
              {activeAreas.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {activeAreas.map((fa, i) => (
                    <FocusAreaCard
                      key={fa.id}
                      focusArea={fa}
                      // eslint-disable-next-line jsx-a11y/aria-role
                      role="coach"
                      index={i}
                      onRecordOutcome={handleRecordOutcome}
                    />
                  ))}
                </div>
              ) : (
                <InsufficientData
                  compact
                  title="No active focus areas"
                  description="Assign a development focus area from the Players tab to close the loop from genome to action."
                />
              )}
            </InstrumentPanel>
          </>
        ) : (
          /* ── NO-GENOME: real "Compute now" (replaces the dev API instruction) ── */
          <InstrumentPanel depth="raised" tone="accent" padding="lg" as="section">
            {computeError ? (
              <InlineNotice tone="danger" title="Compute failed" className="mb-4">
                {computeError}
              </InlineNotice>
            ) : null}
            <EmptyState
              icon={LucideDna}
              title={`${playerName}'s genome hasn't been computed yet`}
              description="Compute it now to see this player's game-profile radar, persona, and dimension grid. New players are also seeded automatically by the nightly run."
              action={
                <Button variant="primary" busy={computing} onClick={handleCompute}>
                  {computing ? 'Computing…' : 'Compute now'}
                </Button>
              }
            />
          </InstrumentPanel>
        )}
      </div>
    </CoachHelmShell>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * GENOME HERO INSTRUMENT — the focal centerpiece. The GenomeRadar mounted BARE
 * (no second frame) into a RAISED accent glass panel: this player's fingerprint
 * shape IS the hero art. Honest <3-dim awaiting state via GenomeRadar's own
 * insufficient-data path (locked spokes are never plotted).
 * ══════════════════════════════════════════════════════════════════════════ */
function GenomeHeroInstrument({
  data,
  liveCount,
  maturityCaption,
  courseProfile,
}: {
  data: GenomeAxis[];
  liveCount: number;
  maturityCaption: string;
  courseProfile?: string;
}) {
  const enough = data.length >= 3;
  return (
    <InstrumentPanel
      depth="raised"
      tone={enough ? 'accent' : 'neutral'}
      padding="lg"
      as="section"
      className="flex h-full flex-col gap-5"
    >
      {enough ? (
        <GenomeRadar
          title="Game profile"
          subtitle={maturityCaption}
          takeaway={
            courseProfile && courseProfile.length > 0 ? courseProfile : undefined
          }
          data={data}
          seriesName="Percentile"
          height={360}
          className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
        />
      ) : (
        <InsufficientData
          title="Fingerprint still forming"
          description="A genome needs at least 3 live dimensions to plot a trustworthy radar shape. Locked spokes are excluded — never drawn as a fake 0."
          unit="live dimensions"
          current={liveCount}
          required={3}
        />
      )}
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * TERTIARY MICRO-READOUTS — the cockpit foot row. Each a base inset panel with a
 * single honest Readout (live/awaiting).
 * ─────────────────────────────────────────────────────────────────────────── */
function LiveDimensionsReadout({ live, total }: { live: number; total: number }) {
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={live}
        format={{ maximumFractionDigits: 0 }}
        unit={`of ${total}`}
        label="Live dimensions"
        size="md"
        state={live > 0 ? 'live' : 'awaiting'}
        samples={live === 0 ? { have: 0, need: 3 } : undefined}
        awaitingLabel="Awaiting data"
      />
    </InstrumentPanel>
  );
}

function RoundsBasisReadout({ rounds }: { rounds: number }) {
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={rounds}
        format={{ maximumFractionDigits: 0 }}
        unit="rounds"
        label="Computed on"
        size="md"
        state={rounds > 0 ? 'live' : 'awaiting'}
        samples={rounds === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="No rounds yet"
      />
    </InstrumentPanel>
  );
}

function RefreshedReadout({ computedAt }: { computedAt: string | null }) {
  return (
    <InstrumentPanel depth="base" padding="md" className="flex h-full flex-col justify-center">
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
        Last refreshed
      </span>
      <span className="mt-1 font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">
        {formatAgo(computedAt)}
      </span>
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * PERSONA INSTRUMENT — the secondary rail. Strengths as Readout-style rows +
 * watchouts that each link to a Focus Area (close the loop). On a base glass
 * panel with a recessed inset course-profile sub-readout.
 * ─────────────────────────────────────────────────────────────────────────── */
function PersonaInstrument({
  persona,
  playerId,
  playerName,
}: {
  persona: Persona | null;
  playerId: string;
  playerName: string;
}) {
  if (!persona) {
    return (
      <InstrumentPanel depth="base" padding="lg" header="Persona" className="h-full">
        <InsufficientData
          compact
          title="Persona not ready"
          description="A few more rounds and this player's strengths and watchouts will fill in."
        />
      </InstrumentPanel>
    );
  }

  const { strengths, watchouts } = persona;
  const noStrengths = strengths.length === 0;
  const noWatchouts = watchouts.length === 0;

  // Collapse the empty "no strengths / no watchouts" double-wall into ONE calm,
  // honest line rather than two separate "none yet" paragraphs.
  if (noStrengths && noWatchouts) {
    return (
      <InstrumentPanel
        depth="base"
        padding="lg"
        header="Persona"
        as="section"
        className="flex h-full flex-col gap-5"
      >
        <p className="font-fw-sans text-body-sm text-text-secondary">
          No standout strengths or watchouts yet — a few more rounds and this player&rsquo;s
          persona will fill in.
        </p>
        {persona.course_profile ? (
          <InstrumentPanel depth="inset" padding="sm">
            <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
              Course profile
            </p>
            <p className="mt-1 font-fw-sans text-body-sm leading-relaxed text-text-secondary">
              {persona.course_profile}
            </p>
          </InstrumentPanel>
        ) : null}
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel
      depth="base"
      padding="lg"
      header="Persona"
      as="section"
      className="flex h-full flex-col gap-5"
    >
      {/* Strengths */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <IconCheckCircle2 size={15} className="text-accent-600" />
          <h3 className="font-fw-sans text-body-sm font-semibold uppercase tracking-wide text-text-secondary">
            Strengths
          </h3>
        </div>
        {strengths.length > 0 ? (
          <ul className="space-y-1.5">
            {strengths.map((s) => (
              <PersonaRow key={s.dim_id} entry={s} tone="accent" />
            ))}
          </ul>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-tertiary">
            No standout strengths yet.
          </p>
        )}
      </div>

      {/* Watchouts → each links to assign a focus area (close the loop). */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <IconWarning size={15} className="text-fw-warning" />
          <h3 className="font-fw-sans text-body-sm font-semibold uppercase tracking-wide text-text-secondary">
            Watchouts
          </h3>
        </div>
        {watchouts.length > 0 ? (
          <ul className="space-y-2">
            {watchouts.map((w) => (
              <li
                key={w.dim_id}
                className="flex items-center justify-between gap-2 rounded-fw-sm bg-surface-sunken px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {w.label}
                  </p>
                  {w.qualitative ? (
                    <p className="truncate font-fw-sans text-eyebrow text-text-tertiary">
                      {w.qualitative}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0"
                  rightIcon={<IconArrowRight size={13} />}
                  asChild
                >
                  <Link
                    href={`/golf/dashboard/development?player=${playerId}&focus=${encodeURIComponent(
                      w.label,
                    )}`}
                    aria-label={`Turn "${w.label}" into a focus area for ${playerName}`}
                  >
                    Focus area
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-tertiary">
            No watchouts flagged yet.
          </p>
        )}
      </div>

      {/* Course profile — a recessed inset sub-readout on the same instrument. */}
      {persona.course_profile ? (
        <InstrumentPanel depth="inset" padding="sm">
          <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            Course profile
          </p>
          <p className="mt-1 font-fw-sans text-body-sm leading-relaxed text-text-secondary">
            {persona.course_profile}
          </p>
        </InstrumentPanel>
      ) : null}
    </InstrumentPanel>
  );
}

function PersonaRow({ entry, tone }: { entry: PersonaEntry; tone: 'accent' }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate font-fw-sans text-body-sm text-text-primary">
        {entry.label}
        {entry.qualitative ? (
          <span className="ml-1.5 text-text-tertiary">· {entry.qualitative}</span>
        ) : null}
      </span>
      {entry.confidence != null ? (
        <Badge tone={tone === 'accent' ? 'accent' : 'neutral'} size="sm" numeric>
          {Math.round(entry.confidence * 100)}%
        </Badge>
      ) : null}
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * DimensionCell — one dimension as an inset instrument readout; locked cells are
 * a DIM "needs more rounds" calibration tile (never a fake 0).
 * ─────────────────────────────────────────────────────────────────────────── */

function DimensionCell({ dim }: { dim: DimRow }) {
  if (dim.locked) {
    return (
      <InstrumentPanel
        depth="inset"
        padding="sm"
        className={cn('flex flex-col gap-1 opacity-70')}
        aria-label={`${dim.label}: needs more rounds`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
            {dim.label}
          </span>
          <IconLock size={12} className="text-text-tertiary" />
        </div>
        <Readout
          size="md"
          state="awaiting"
          awaitingLabel="Needs more rounds"
        />
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel depth="inset" padding="sm" className="flex flex-col gap-2">
      <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
        {dim.label}
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <Readout value={dim.score ?? 0} format={{ maximumFractionDigits: 0 }} size="md" />
        {dim.qualitative ? (
          <StatusPill tone="neutral" size="sm">
            {dim.qualitative}
          </StatusPill>
        ) : null}
      </div>
    </InstrumentPanel>
  );
}
