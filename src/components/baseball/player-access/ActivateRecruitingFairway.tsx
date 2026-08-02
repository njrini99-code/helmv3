'use client';

/**
 * ============================================================================
 * ActivateRecruitingFairway — Living-Annual presentation of the recruiting
 * "GO LIVE" gate (Passport lane, GREEN — spec §5 Lane 3, §6 P2 #9's exposure
 * ribbon, §9 north-star #2 "The Commit seal"). Migration wave: P4.27.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Receives the state + the single write handler that
 * `ActivateRecruitingClient` owns (`activating`, `error`, `showSeal`,
 * `onActivate`) and composes the pitch, benefit grid, privacy panel, and the
 * activation ceremony from `@/components/baseball/living-annual`. No data
 * path, auth check, or write is touched here — `onActivate` is the ONLY way
 * this component can trigger a mutation, and it is wired straight to the
 * gated `activateRecruitingExposure` server action one level up.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { IconTarget, IconUsers, IconChart, IconCheck, IconEye } from '@/components/icons';
import { Button } from '@/components/fairway';
import {
  SectionMasthead,
  Eyebrow,
  HairlineRule,
  InkBadge,
  EditorsLetter,
  CommitSeal,
  PaperCard,
  Reveal,
} from '@/components/baseball/living-annual';

export interface ActivateRecruitingFairwayProps {
  playerId: string;
  activating: boolean;
  error: string | null;
  /** The CommitSeal ceremony is showing — a successful activation is settling
   *  before the redirect to the Passport fires. */
  showSeal: boolean;
  onActivate: () => void;
}

interface FeatureCard {
  icon: ReactNode;
  title: string;
  blurb: string;
  points: string[];
}

const FEATURES: FeatureCard[] = [
  {
    icon: <IconEye size={20} className="text-grade-plus" />,
    title: 'Get discovered',
    blurb: 'Make your profile visible in coach searches and recommendations.',
    points: [
      'Appear in coach discovery searches',
      'Get matched with relevant programs',
      "See who's viewing your profile",
    ],
  },
  {
    icon: <IconUsers size={20} className="text-grade-plus" />,
    title: 'Connect with coaches',
    blurb: 'See which coaches are interested and message them directly.',
    points: [
      'Know which coaches viewed you',
      'Track watchlist additions',
      'Direct messaging with coaches',
    ],
  },
  {
    icon: <IconTarget size={20} className="text-grade-plus" />,
    title: 'Manage your journey',
    blurb: 'Track your recruiting progress and manage your college list.',
    points: [
      'Timeline of recruiting activity',
      'Track offers and commitments',
      'Organize your target schools',
    ],
  },
  {
    icon: <IconChart size={20} className="text-grade-plus" />,
    title: 'Track analytics',
    blurb: 'Understand your recruiting reach and optimize your profile.',
    points: [
      'Profile view statistics',
      'Video engagement metrics',
      'Interest by program type',
    ],
  },
];

export function ActivateRecruitingFairway({
  playerId,
  activating,
  error,
  showSeal,
  onActivate,
}: ActivateRecruitingFairwayProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionMasthead eyebrow="THE PASSPORT · GO LIVE" title="Activate recruiting" ink="team" />

      {/* Hero pitch */}
      <Reveal staggerIndex={0} className="mt-6">
        <PaperCard registrationTick className="px-7 py-10 text-center sm:px-10">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-grade-plus/10">
            <IconTarget size={26} className="text-grade-plus" />
          </div>
          <h2 className="font-annual text-h1 font-semibold leading-tight text-text-primary">
            Ready to be recruited?
          </h2>
          <p className="mx-auto mt-3 max-w-lg font-annual text-body-lg leading-relaxed text-text-secondary">
            Activate recruiting to make your profile visible to college coaches and unlock the
            tools that help you get recruited to the next level.
          </p>
          <div className="mt-5 flex justify-center">
            <InkBadge label="Free to activate · No credit card required" tone="team" variant="solid" />
          </div>
        </PaperCard>
      </Reveal>

      {/* Benefit grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} staggerIndex={i + 1}>
            <PaperCard className="h-full px-6 py-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-grade-plus/10">
                {f.icon}
              </div>
              <h3 className="font-annual text-h3 font-semibold text-text-primary">{f.title}</h3>
              <p className="mt-1 font-annual text-body leading-relaxed text-text-secondary">{f.blurb}</p>
              <ul className="mt-4 space-y-2">
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 font-annual text-body-sm text-text-secondary">
                    <IconCheck size={15} className="mt-0.5 shrink-0 text-grade-plus" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </PaperCard>
          </Reveal>
        ))}
      </div>

      {/* Privacy & control */}
      <Reveal staggerIndex={5} className="mt-6">
        <PaperCard className="px-7 py-7">
          <Eyebrow ink="team">You&apos;re in control</Eyebrow>
          <HairlineRule ink="team" className="my-4" />
          <p className="font-annual text-body leading-relaxed text-text-secondary">
            Activation is opt-in and reversible. You decide what coaches can see.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-annual text-body-sm font-semibold uppercase tracking-[0.08em] text-text-primary">
                Privacy settings
              </h4>
              <ul className="mt-3 space-y-2">
                {[
                  'Control what information is visible',
                  'Choose who can contact you',
                  'Deactivate recruiting anytime',
                ].map((p) => (
                  <li key={p} className="flex items-start gap-2 font-annual text-body-sm text-text-secondary">
                    <IconCheck size={15} className="mt-0.5 shrink-0 text-grade-plus" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-annual text-body-sm font-semibold uppercase tracking-[0.08em] text-text-primary">
                Your data
              </h4>
              <ul className="mt-3 space-y-2">
                {[
                  'Your profile belongs to you',
                  'Export your data anytime',
                  'Delete your account anytime',
                ].map((p) => (
                  <li key={p} className="flex items-start gap-2 font-annual text-body-sm text-text-secondary">
                    <IconCheck size={15} className="mt-0.5 shrink-0 text-grade-plus" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PaperCard>
      </Reveal>

      {/* CTA / ceremony */}
      <Reveal staggerIndex={6} className="mt-6">
        <PaperCard className="px-7 py-10 text-center">
          {showSeal ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
              <CommitSeal label="ACTIVATED" size="md" />
              <p className="font-annual text-body-lg text-text-secondary">
                You&apos;re live — taking you to your Passport…
              </p>
            </div>
          ) : (
            <>
              {error ? (
                <EditorsLetter ink="team" title="Something went wrong." body={error} className="mb-6 text-left" />
              ) : null}
              <Button
                variant="primary"
                size="lg"
                busy={activating}
                onClick={onActivate}
                data-player-id={playerId}
                className="px-8"
              >
                Activate recruiting
              </Button>
              <p className="mx-auto mt-4 max-w-sm font-annual text-body-sm leading-relaxed text-text-tertiary">
                By activating, you agree to make your profile visible to college coaches.
              </p>
            </>
          )}
        </PaperCard>
      </Reveal>
    </div>
  );
}
