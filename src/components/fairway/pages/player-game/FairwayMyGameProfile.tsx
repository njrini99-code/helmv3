'use client';

/**
 * ============================================================================
 * Fairway · player-game · FairwayMyGameProfile — the player's OWN game profile
 * ----------------------------------------------------------------------------
 * The flag-on redesign of /golf/dashboard/my-game-profile (player-only). It
 * re-skins the SAME genome the legacy page already resolves on the server:
 *
 *   • golf_player_genome (via loadGenome)  → the genome radar polygon + the
 *                                            per-dimension readout grid
 *   • derivePersona(genome.vector)         → the strengths / watchouts /
 *                                            course-profile panel
 *   • genome.rounds_basis                  → the honest "rounds in window" line
 *
 * The route owns auth + loadGenome + derivePersona + the pure normalization
 * (normalizeForRadar over GENOME_DIMENSIONS) ABOVE the fork, then passes the
 * already-resolved, SERIALIZABLE primitives (radar axes + persona text +
 * dimension cells) into this component. This component performs NO fetching,
 * NO normalization re-derivation, and NO writes.
 *
 * ── HONESTY (the load-bearing rule) ────────────────────────────────────────
 *   • loadGenome returns null below the genome round floor. When `axes` is
 *     empty the surface renders an honest "warming up" InstrumentPanel (an
 *     awaiting Readout with the real "N of FLOOR" calibration) — NEVER a
 *     fabricated radar or zeroed dimensions.
 *   • A locked dimension (not enough rounds for that axis) renders its honest
 *     qualitative label / "Locked" — never a fabricated numeric score.
 *   • The radar axes are the genome's REAL 0–100 normalized scores; there are
 *     no invented percentiles.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * my-game-profile/page.tsx. Renders inside the `.fairway-ds` scope on a
 * bg-canvas page. Built with Fairway tokens + primitives only (no bg-white /
 * serif / skeuomorphic gauges — the genome radar is a flat data-viz polygon).
 * ========================================================================== */

import Link from 'next/link';

import {
  ViewHeader,
  InstrumentPanel,
  Readout,
  Surface,
  GenomeRadar,
  Chip,
  Button,
} from '@/components/fairway';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — fully-resolved, serializable data from the server page.
 * ────────────────────────────────────────────────────────────────────────── */

/** One radar axis — a genome dimension's REAL 0–100 normalized score. */
export interface GameProfileAxis {
  label: string;
  value: number;
}

/** One dimension cell — the readout grid row (honest qualitative when locked). */
export interface GameProfileDimensionCell {
  id: string;
  label: string;
  /** The normalized 0–100 score, or null when the axis is locked. */
  score: number | null;
  /** Honest qualitative label (e.g. "Wizard", "Locked") when present. */
  qualitative: string | null;
}

/** A persona bullet — a strength or watchout the route extracted. */
export interface GameProfilePersonaEntry {
  id: string;
  label: string;
  qualitative: string | null;
}

export interface FairwayMyGameProfileProps {
  /** The player's first name (drives the masthead title). */
  firstName: string;
  /** The radar axes — empty when there's no genome yet (warming-up state). */
  axes: GameProfileAxis[];
  /** The per-dimension grid cells (honest locked cells preserved). */
  dimensions: GameProfileDimensionCell[];
  /** Persona strengths (real, may be empty). */
  strengths: GameProfilePersonaEntry[];
  /** Persona watchouts (real, may be empty). */
  watchouts: GameProfilePersonaEntry[];
  /** One-sentence course profile (real, from derivePersona). */
  courseProfile: string | null;
  /** Number of rounds the genome was built from (honest basis line). */
  roundsBasis: number | null;
}

/** The round floor the genome loader enforces (honest "N of FLOOR" calibration). */
const GENOME_ROUND_FLOOR = 8;

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayMyGameProfile({
  firstName,
  axes,
  dimensions,
  strengths,
  watchouts,
  courseProfile,
  roundsBasis,
}: FairwayMyGameProfileProps) {
  const hasGenome = axes.length > 0;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6">
      <div className="flex flex-col gap-8">
        {/* ════════════════ 1 · MASTHEAD (the ONE masthead) ═════════════════ */}
        <ViewHeader
          eyebrow="My Game Profile"
          title={`${firstName}'s genome`}
          description={
            hasGenome && roundsBasis != null
              ? `Your game shape, built from ${roundsBasis} ${roundsBasis === 1 ? 'round' : 'rounds'} in your window.`
              : 'An 8-dimension fingerprint of your game, built as you log rounds.'
          }
          secondaryActions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/golf/dashboard">Back to dashboard</Link>
            </Button>
          }
        />

        {hasGenome ? (
          <>
            {/* ════════ 2 · HERO — the genome radar (flat data-viz polygon) ═══ */}
            <InstrumentPanel
              depth="raised"
              tone="accent"
              padding="lg"
              eyebrow="Your shape"
              header="Genome"
              as="section"
            >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-center">
                <div className="w-full min-w-0">
                  <GenomeRadar
                    title={`${firstName}'s shape`}
                    seriesName="Score"
                    data={axes}
                    max={100}
                    height={300}
                  />
                </div>

                {/* Persona — strengths + watchouts + course profile (all real). */}
                <div className="flex flex-col gap-5">
                  {courseProfile ? (
                    <p className="max-w-[44ch] font-fw-display text-body-lg leading-[1.6] text-text-secondary">
                      {courseProfile}
                    </p>
                  ) : null}

                  {strengths.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <span className="font-fw-sans text-caption font-medium uppercase tracking-[0.12em] text-text-tertiary">
                        Strengths
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {strengths.map((s) => (
                          <Chip key={s.id} tone="success" size="md">
                            {s.qualitative ? `${s.label} · ${s.qualitative}` : s.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {watchouts.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <span className="font-fw-sans text-caption font-medium uppercase tracking-[0.12em] text-text-tertiary">
                        Watchouts
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {watchouts.map((w) => (
                          <Chip key={w.id} tone="warning" size="md">
                            {w.qualitative ? `${w.label} · ${w.qualitative}` : w.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </InstrumentPanel>

            {/* ════════ 3 · DIMENSIONS — the real per-axis readouts ══════════ */}
            {dimensions.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  Dimensions
                </h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {dimensions.map((dim) => {
                    const locked = dim.score == null;
                    return (
                      <InstrumentPanel key={dim.id} depth="base" padding="md" className="h-full">
                        {locked ? (
                          <Readout
                            label={dim.label}
                            size="md"
                            state="awaiting"
                            awaitingLabel={dim.qualitative ?? 'Locked'}
                          />
                        ) : (
                          <Readout
                            value={dim.score ?? 0}
                            format={{ maximumFractionDigits: 0 }}
                            label={dim.label}
                            size="md"
                            state="live"
                          />
                        )}
                      </InstrumentPanel>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          /* ════════ WARMING-UP — honest awaiting state (no fabricated radar) ═ */
          <InstrumentPanel
            depth="raised"
            padding="lg"
            eyebrow="Your shape"
            header="Your genome is warming up"
            as="section"
          >
            <div className="flex flex-col items-center gap-6 py-4 text-center">
              <Readout
                value={roundsBasis ?? undefined}
                format={{ maximumFractionDigits: 0 }}
                label="Rounds logged"
                size="hero"
                state="awaiting"
                samples={{ have: roundsBasis ?? 0, need: GENOME_ROUND_FLOOR }}
                awaitingLabel="Awaiting"
              />
              <p className="max-w-[44ch] font-fw-sans text-body-sm leading-relaxed text-text-secondary">
                Your genome needs {GENOME_ROUND_FLOOR}+ completed rounds before the
                radar lights up. Keep logging rounds — we&rsquo;ll surface your
                shape automatically.
              </p>
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/rounds/new">Log a round</Link>
              </Button>
            </div>
          </InstrumentPanel>
        )}

        {/* A quiet note tying the genome back to the coach loop. */}
        <Surface elevation="border" padding="md">
          <p className="font-fw-sans text-caption leading-5 text-text-tertiary">
            Your coach sees this exact profile. It updates automatically as you
            log rounds — no extra steps.
          </p>
        </Surface>
      </div>
    </div>
  );
}

export default FairwayMyGameProfile;
