'use client';

/**
 * ============================================================================
 * ProfileDrill — `?view=profile` (spec §5.3, absorbs `/my-game-profile`)
 * ----------------------------------------------------------------------------
 * Genome radar + per-dimension readouts, ported from `FairwayMyGameProfile`
 * (minus its own `CoachHelmShell` — the stage IS the chrome now). Also hosts
 * the monolith's "Performance overview" pairing (`CompositeRatingCard` +
 * `FairwayTrendBrain`) below the genome — both the bento's "Game profile" AND
 * "Trend" cells open here, since they were always ONE section in the legacy
 * cockpit and neither is its own named drill in spec §5.3's view list.
 * ========================================================================== */

import Link from 'next/link';
import nextDynamic from 'next/dynamic';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { InstrumentPanel, Readout, Surface, Chip, Button, Skeleton, InsufficientData } from '@/components/fairway';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { FairwayTrendBrain } from '@/components/golf/coachhelm/player/FairwayTrendBrain';
import { expectedEmptyStateCopy } from '@/lib/view-state/expected-empty-states';

const GenomeRadar = nextDynamic(
  () => import('@/components/fairway').then((m) => ({ default: m.GenomeRadar })),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full rounded-card" /> },
);

export interface GameProfileAxis {
  label: string;
  value: number;
}
export interface GameProfileDimensionCell {
  id: string;
  label: string;
  score: number | null;
  qualitative: string | null;
}
export interface GameProfilePersonaEntry {
  id: string;
  label: string;
  qualitative: string | null;
}

export interface ProfileDrillProps {
  axes: GameProfileAxis[];
  dimensions: GameProfileDimensionCell[];
  strengths: GameProfilePersonaEntry[];
  watchouts: GameProfilePersonaEntry[];
  courseProfile: string | null;
  roundsBasis: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData?: Record<string, any> | null;
  playerState?: string;
  playerName?: string;
  v3EmptyCodes?: { profile?: string | null; trend?: string | null };
}

const GENOME_ROUND_FLOOR = 8;

export function ProfileDrill({
  axes,
  dimensions,
  strengths,
  watchouts,
  courseProfile,
  roundsBasis,
  profileData,
  trendData,
  playerState,
  playerName,
  v3EmptyCodes = {},
}: ProfileDrillProps) {
  const { home } = useStage();
  const hasGenome = axes.length > 0;

  return (
    <DrillPanel title="Game profile" backLabel="Home" onBack={home}>
      <div className="flex flex-col gap-8">
        {hasGenome ? (
          <>
            <InstrumentPanel depth="raised" tone="accent" padding="lg" eyebrow="Your shape" header="Genome" as="section">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-center">
                <div className="w-full min-w-0">
                  <GenomeRadar title="Score by dimension" seriesName="Score" data={axes} max={100} height={280} />
                </div>
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
                          <Readout label={dim.label} size="md" state="awaiting" awaitingLabel={dim.qualitative ?? 'Locked'} />
                        ) : (
                          <Readout value={dim.score ?? 0} format={{ maximumFractionDigits: 0 }} label={dim.label} size="md" state="live" />
                        )}
                      </InstrumentPanel>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <InstrumentPanel depth="raised" padding="lg" eyebrow="Your shape" header="Your genome is warming up" as="section">
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
                Your genome needs {GENOME_ROUND_FLOOR}+ completed rounds before the radar lights up. Keep logging
                rounds — we&rsquo;ll surface your shape automatically.
              </p>
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/rounds/new">Log a round</Link>
              </Button>
            </div>
          </InstrumentPanel>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
            Composite + trend
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {profileData != null ? (
              <CompositeRatingCard profileData={profileData} playerState={playerState} playerName={playerName} />
            ) : (
              <Surface padding="md">
                <InsufficientData
                  title={expectedEmptyStateCopy(v3EmptyCodes.profile)?.title ?? 'Game profile warming up'}
                  description={
                    expectedEmptyStateCopy(v3EmptyCodes.profile)?.description ??
                    'Your composite rating builds off the rounds you log, a few more and it fills in.'
                  }
                  unit="rounds"
                />
              </Surface>
            )}

            {trendData != null ? (
              <FairwayTrendBrain trendData={trendData} playerState={playerState} />
            ) : (
              <Surface padding="md">
                <InsufficientData
                  title={expectedEmptyStateCopy(v3EmptyCodes.trend)?.title ?? 'Trends warming up'}
                  description={
                    expectedEmptyStateCopy(v3EmptyCodes.trend)?.description ??
                    'Log a couple more rounds and your performance trend lines fill in.'
                  }
                  unit="rounds"
                  required={expectedEmptyStateCopy(v3EmptyCodes.trend)?.required}
                />
              </Surface>
            )}
          </div>
        </section>

        <Surface elevation="border" padding="md">
          <p className="font-fw-sans text-caption leading-5 text-text-tertiary">
            Your coach sees this exact profile. It updates automatically as you log rounds — no extra steps.
          </p>
        </Surface>
      </div>
    </DrillPanel>
  );
}
