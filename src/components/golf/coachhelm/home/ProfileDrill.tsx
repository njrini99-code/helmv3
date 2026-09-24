'use client';

/**
 * ============================================================================
 * ProfileDrill — `?view=profile` (spec §5.3, absorbs `/my-game-profile`)
 * ----------------------------------------------------------------------------
 * The player's Genome (PlayerGenomeProfile: the shape in words, strengths and
 * watch-outs, every dimension ranked; the radar and score tiles are retired),
 * originally ported from `FairwayMyGameProfile`
 * (minus its own `CoachHelmShell` — the stage IS the chrome now). Also hosts
 * the monolith's "Performance overview" pairing (`CompositeRatingCard` +
 * `FairwayTrendBrain`) below the genome — both the bento's "Game profile" AND
 * "Trend" cells open here, since they were always ONE section in the legacy
 * cockpit and neither is its own named drill in spec §5.3's view list.
 *
 * Wave: player Game Fingerprint port. When `fingerprint` is present (the
 * coachhelm page's `?view=profile` load fetches the player's OWN
 * `getPlayerFingerprint` — see player-fingerprint.ts's `access.reason ===
 * 'self'` branch), this drill leads with the SAME rich composition the coach
 * sees at `/dashboard/players/[playerId]/game` — composite hero, six-card
 * category row, per-category sections + evidence insights — behind a
 * "Game Fingerprint" / "Genome" tab pair (mirrors the coach route's own
 * "Game Fingerprint" / "Scouting Report" Segmented pair; the player has no
 * Scouting Report equivalent, so Genome — the prior sole content of this
 * drill — takes that slot instead of being dropped). `fingerprint` absent/null
 * (fetch failed, or not yet backed by enough data) degrades to the prior
 * Genome-only behavior with zero layout change.
 * ========================================================================== */

import { useState } from 'react';

import { DrillPanel, useStage } from '@/components/fairway/modules';
import { Surface, InsufficientData } from '@/components/fairway';
import { PlayerGenomeProfile } from '@/components/fairway/pages/genome/PlayerGenomeProfile';
import { Segmented, type SegmentedOption } from '@/components/fairway/controls/segmented';
import { FairwayPlayerGameFingerprint } from '@/components/fairway/pages/player-game';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { FairwayTrendBrain } from '@/components/golf/coachhelm/player/FairwayTrendBrain';
import { expectedEmptyStateCopy } from '@/lib/view-state/expected-empty-states';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint-types';

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
  /** Kept for callers; the radar that drew it is retired. */
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

type ProfileTab = 'fingerprint' | 'genome';

const PROFILE_TAB_OPTIONS: SegmentedOption<ProfileTab>[] = [
  { value: 'fingerprint', label: 'Game Fingerprint' },
  { value: 'genome', label: 'Genome' },
];

export function ProfileDrill({
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
  const hasFingerprint = fingerprint != null;
  const [tab, setTab] = useState<ProfileTab>(hasFingerprint ? 'fingerprint' : 'genome');

  const genomeSection = (
      <div className="flex flex-col gap-8">
        <PlayerGenomeProfile
          dimensions={dimensions}
          strengths={strengths}
          watchouts={watchouts}
          courseProfile={courseProfile}
          roundsBasis={roundsBasis}
          roundFloor={GENOME_ROUND_FLOOR}
        />

        <section className="flex flex-col gap-3">
          <h2 className="font-fw-sans text-h3 text-text-primary">
            Composite and trend
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
            Your coach sees this exact profile. It updates automatically as you log rounds. No extra steps.
          </p>
        </Surface>
      </div>
  );

  return (
    <DrillPanel title="Game profile" backLabel="Home" onBack={home}>
      {hasFingerprint ? (
        <div className="flex flex-col gap-6">
          <Segmented<ProfileTab>
            options={PROFILE_TAB_OPTIONS}
            value={tab}
            onValueChange={setTab}
            aria-label="Game profile view"
          />
          {tab === 'fingerprint' ? (
            <FairwayPlayerGameFingerprint fingerprint={fingerprint} mode="player" />
          ) : (
            genomeSection
          )}
        </div>
      ) : (
        genomeSection
      )}
    </DrillPanel>
  );
}
