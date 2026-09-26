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
 *
 * Layout (2026-09-25, root-map style: summary first, detail on tap): one
 * `DrillSummary` (overall rating or dimensions scored, strongest / watch
 * line, the genome radar, and a basis line naming EACH sample: the composite,
 * the fingerprint's category stats and the genome rest on different round
 * counts), then closed `Disclosure`s: the player's own Game Fingerprint (same
 * composition the coach sees at `/dashboard/players/[playerId]/game`, via the
 * `access.reason === 'self'` branch of `getPlayerFingerprint`), strengths and
 * watchouts, genome dimensions, composite and trend. A null fingerprint drops
 * its disclosure; nothing else changes.
 * ========================================================================== */

import Link from 'next/link';
import nextDynamic from 'next/dynamic';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { InstrumentPanel, Readout, Surface, Chip, Button, Skeleton, InsufficientData, Eyebrow } from '@/components/fairway';
import { FairwayPlayerGameFingerprint } from '@/components/fairway/pages/player-game';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { FairwayTrendBrain } from '@/components/golf/coachhelm/player/FairwayTrendBrain';
import { expectedEmptyStateCopy } from '@/lib/view-state/expected-empty-states';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { DrillSummary } from './DrillSummary';

const GenomeRadar = nextDynamic(
  () => import('@/components/fairway').then((m) => ({ default: m.GenomeRadar })),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-card" /> },
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
  /** The player's OWN Game Fingerprint — same shape/composition the coach's
   *  `/dashboard/players/[playerId]/game` page renders, fetched via
   *  `getPlayerFingerprint` with the player-self auth branch. Null/undefined
   *  (fetch failed, or `access.reason` couldn't resolve `self`) degrades to
   *  the prior Genome-only drill — no tab pair, no layout change. */
  fingerprint?: PlayerFingerprint | null;
}

const GENOME_ROUND_FLOOR = 8;

const TREND_WORD: Record<'up' | 'flat' | 'down', string> = {
  up: 'trending up',
  flat: 'holding steady',
  down: 'trending down',
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One quiet line naming every sample on the screen. The composite, the
 * fingerprint's section stats and the genome rest on DIFFERENT round counts
 * (player-fingerprint.ts `metrics_rounds`), so each is stated on its own
 * rather than one "based on N rounds" standing in for all of them.
 */
export function profileBasisLine(fingerprint: PlayerFingerprint | null, roundsBasis: number | null): string | null {
  const parts: string[] = [];
  if (fingerprint) {
    if (fingerprint.composite.rating != null && fingerprint.composite.rounds_in_calculation > 0) {
      parts.push(`Rating from your last ${plural(fingerprint.composite.rounds_in_calculation, 'round', 'rounds')}`);
    }
    if (fingerprint.metrics_rounds > 0) parts.push(`category stats from ${plural(fingerprint.metrics_rounds, 'round', 'rounds')}`);
  }
  if (roundsBasis != null && roundsBasis > 0) parts.push(`genome from ${plural(roundsBasis, 'round', 'rounds')}`);
  if (parts.length === 0) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

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
  fingerprint = null,
}: ProfileDrillProps) {
  const { home } = useStage();
  const hasGenome = axes.length > 0;
  const rating = fingerprint?.composite.rating ?? null;
  const unlocked = dimensions.filter((d) => d.score != null).length;

  // ── Summary: key number, one line, one visual, the samples. ─────────────
  const strengthText = strengths.slice(0, 2).map((s) => s.label).join(' and ');
  const watchText = watchouts[0]?.label ?? null;
  const takeaway =
    strengthText || watchText
      ? [strengthText ? `Strongest: ${strengthText}.` : null, watchText ? `Watch: ${watchText}.` : null]
          .filter(Boolean)
          .join(' ')
      : courseProfile ??
        (hasGenome ? null : `Your genome needs ${GENOME_ROUND_FLOOR}+ completed rounds before the radar lights up.`);
  const summaryValue =
    rating != null ? String(Math.round(rating)) : hasGenome ? `${unlocked}/${dimensions.length}` : `${roundsBasis ?? 0}/${GENOME_ROUND_FLOOR}`;
  const summaryUnit =
    rating != null
      ? `overall game, ${TREND_WORD[fingerprint!.composite.trend]}`
      : hasGenome
        ? 'dimensions scored'
        : 'rounds toward your genome';

  const visual = hasGenome ? (
    <GenomeRadar
      title="Score by dimension"
      subtitle={`0-100 on each dimension's own scale, not a percentile · ${unlocked} of ${dimensions.length} scored`}
      seriesName="Score"
      data={axes}
      max={100}
      height={220}
    />
  ) : rating != null ? (
    <div
      role="img"
      aria-label={`Overall game ${Math.round(rating)} out of 100`}
      className="h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
      data-slot="profile-rating-bar"
    >
      <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(0, Math.min(100, rating))}%` }} />
    </div>
  ) : null;

  return (
    <DrillPanel title="Game profile" backLabel="Home" onBack={home}>
      <div className="flex flex-col gap-6">
        <DrillSummary
          slot="profile-summary"
          eyebrow={rating != null ? 'Your game' : 'Your shape'}
          value={summaryValue}
          unit={summaryUnit}
          takeaway={takeaway}
          visual={visual}
          basis={profileBasisLine(fingerprint, roundsBasis)}
          action={
            hasGenome ? undefined : (
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/rounds/new">Log a round</Link>
              </Button>
            )
          }
        />

        <div className="flex flex-col" data-slot="profile-detail">
          {fingerprint ? (
            <Disclosure slot="profile-fingerprint" headingLevel={2} title="Game Fingerprint by category">
              <FairwayPlayerGameFingerprint fingerprint={fingerprint} mode="player" />
            </Disclosure>
          ) : null}

          {hasGenome && (strengths.length > 0 || watchouts.length > 0 || courseProfile) ? (
            <Disclosure slot="profile-persona" headingLevel={2} title="Strengths and watchouts">
              <div className="flex flex-col gap-4">
                {courseProfile ? (
                  <p className="max-w-[60ch] text-body text-text-secondary">{courseProfile}</p>
                ) : null}
                {strengths.length > 0 ? (
                  <PersonaChips label="Strengths" tone="success" entries={strengths} />
                ) : null}
                {watchouts.length > 0 ? (
                  <PersonaChips label="Watchouts" tone="warning" entries={watchouts} />
                ) : null}
              </div>
            </Disclosure>
          ) : null}

          {hasGenome && dimensions.length > 0 ? (
            <Disclosure
              slot="profile-dimensions"
              headingLevel={2}
              title="Genome dimensions"
              meta={
                <span className="shrink-0 text-caption text-text-tertiary">
                  <span className="font-fw-mono tabular-nums text-text-secondary">
                    {unlocked}/{dimensions.length}
                  </span>{' '}
                  scored
                </span>
              }
            >
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
            </Disclosure>
          ) : null}

          <Disclosure slot="profile-composite" headingLevel={2} title="Composite and trend">
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
          </Disclosure>
        </div>

        <p className="px-1 text-caption text-text-tertiary">
          Your coach sees this exact profile. It updates as you log rounds.
        </p>
      </div>
    </DrillPanel>
  );
}

function PersonaChips({
  label,
  tone,
  entries,
}: {
  label: string;
  tone: 'success' | 'warning';
  entries: GameProfilePersonaEntry[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow as="p">{label}</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <Chip key={e.id} tone={tone} size="md">
            {e.qualitative ? `${e.label} · ${e.qualitative}` : e.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
