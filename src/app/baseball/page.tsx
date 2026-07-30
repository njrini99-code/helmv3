import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionProfile } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { HelmMark } from '@/components/brand/HelmMark';
import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/icons';
import { Footer } from '@/components/landing/Footer';
import {
  Eyebrow,
  HairlineRule,
  PaperCard,
  PositionChip,
  RuledStatLine,
  Masthead,
  GradeStamp,
} from '@/components/baseball/living-annual';
import { BaseballMarketingMotionScope } from '@/components/baseball/marketing/BaseballMarketingMotionScope';
import { resolveBaseballLandingCopy } from '@/lib/baseball/marketing/landing-copy';

// Resolved through the product-module registry — while recruiting is sunset,
// the front door must not lead with it. See landing-copy.ts for the full
// reasoning and for the original wording, which is preserved there rather than
// deleted and returns unchanged when the module does.
const COPY = resolveBaseballLandingCopy();
const HERO_DESCRIPTION = COPY.heroDescription;

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: HERO_DESCRIPTION,
  openGraph: {
    title: COPY.metaTitle,
    description: HERO_DESCRIPTION,
    type: 'website',
    url: '/baseball',
    images: [
      {
        url: '/baseball-aerial.webp',
        width: 1920,
        height: 1080,
        alt: 'A college baseball field seen from above',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: COPY.metaTitle,
    description: HERO_DESCRIPTION,
    images: ['/baseball-aerial.webp'],
  },
};

/**
 * BaseballHelm public landing route — the front door for coaches, players,
 * and parents arriving from a shared link.
 *
 * Signed-in visitors keep the original redirect-straight-to-dashboard
 * behavior (mirrors GolfHelm's `/golf/page.tsx`): coaches land on the
 * command center, players on their daily hub — nobody who's already signed
 * in sees marketing copy. Signed-OUT visitors — the ones this route is
 * actually for — used to be bounced straight to `/baseball/login` with zero
 * context about what BaseballHelm even is; they now see the real page.
 */
export default async function BaseballLandingPage() {
  const session = await getSessionProfile();

  if (session) {
    redirect(session.coach ? '/baseball/dashboard/command-center' : '/baseball/player/today');
  }

  return (
    <div className="min-h-dvh bg-[var(--paper-canvas)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <MarketingHeader />

      {/* The Living Annual atoms below (RuledStatLine, Masthead, HairlineRule,
          GradeStamp) are framer-motion `m` components — they only ever
          transition from their `hidden` variant to `visible` when a
          `<LazyMotion>` ancestor has loaded a feature bundle. This scope is
          the one client boundary on an otherwise server-rendered page. */}
      <BaseballMarketingMotionScope>
        <main id="main-content">
          <Hero />

          <FeatureSection
            ink="team"
            eyebrowItems={['THE PRESSBOX', 'TEAM OPS']}
            heading="One roster. One record book."
            body={COPY.rosterBody}
            visual={<RosterVisual />}
          />

          <FeatureSection
            ink="team"
            reverse
            eyebrowItems={['STATS CENTER', 'THE RECORD BOOK']}
            heading="Numbers set in ink, not spreadsheets."
            body="Log a game and the record book updates itself — batting lines, pitching lines, and season trends, all in one place. No re-typing a box score into three different documents after every game."
            visual={<StatsVisual />}
          />

          {/* Third section: the pipeline pitch while recruiting ships, and the
              practice/readiness pitch while it does not. Exactly one renders —
              see landing-copy.ts. The alternative, simply dropping the
              recruiting section, leaves three where there were four and reads
              like a page with something cut out of it. */}
          {COPY.showPipelineSection && (
            <FeatureSection
              ink="pursuit"
              eyebrowItems={['THE WAR ROOM', 'PIPELINE']}
              heading="From first contact to commitment — tracked."
              body="Move a prospect from Watchlist to Committed on one board, with 20-80 grades, aging bars, and the full contact history riding along. Nothing falls through a group chat again."
              visual={<PipelineVisual />}
            />
          )}

          {COPY.showPracticeSection && (
            <FeatureSection
              ink="pursuit"
              eyebrowItems={['THE DAILY CONTRACT', 'PRACTICE & READINESS']}
              heading="Every day has a plan — and a record of what happened."
              body="Publish a practice and every player sees their part of it before they arrive, with their lift for the day attached. Readiness check-ins and attendance land against the same day, so what was planned and what actually happened live in one place."
              visual={<PracticeVisual />}
            />
          )}

          <FeatureSection
            ink="team"
            reverse
            eyebrowItems={['THE PASSPORT', 'PLAYER DEVELOPMENT']}
            heading="Every player writes their own record."
            body={COPY.passportBody}
            visual={<PassportVisual />}
          />

          <ClosingCta />
        </main>
      </BaseballMarketingMotionScope>

      <Footer />
    </div>
  );
}

function MarketingHeader() {
  return (
    <header className="border-b border-[color:var(--hairline)] bg-[var(--paper)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <HelmMark sport="baseball" size={32} className="h-8 w-8" unoptimized />
          <span className="font-annual text-h3 font-semibold text-text-primary">Helm</span>
        </Link>
        <Link
          href="/baseball/login"
          className="inline-flex min-h-[44px] items-center rounded-full border border-[color:var(--hairline)] px-4 text-body-sm font-medium text-text-primary transition-colors hover:bg-[var(--paper-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/40 focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-14 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-20 md:pb-24 md:pt-24">
      <div className="mx-auto max-w-3xl">
        <Eyebrow items={['COLLEGE', 'JUCO', 'HIGH SCHOOL', 'SHOWCASE']} ink="team" />
        <h1 className="mt-5 font-annual text-4xl font-semibold leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
          Recruiting and team operations for college baseball.
        </h1>
        <div className="mt-6 flex justify-center">
          <HairlineRule ink="team" weight={3} className="w-16 rounded-full" />
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-body-lg text-text-secondary">{HERO_DESCRIPTION}</p>
        <CtaRow className="mt-9 justify-center" />
      </div>
    </section>
  );
}

interface FeatureSectionProps {
  ink: 'team' | 'pursuit';
  eyebrowItems: string[];
  heading: string;
  body: string;
  visual: ReactNode;
  reverse?: boolean;
}

function FeatureSection({ ink, eyebrowItems, heading, body, visual, reverse = false }: FeatureSectionProps) {
  return (
    <section className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14 md:py-16">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
        <div className={reverse ? 'md:order-2' : undefined}>
          <Eyebrow items={eyebrowItems} ink={ink} />
          <h2 className="mt-3 font-annual text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            {heading}
          </h2>
          <HairlineRule ink={ink} weight={3} className="mt-4 w-14 rounded-full" />
          <p className="mt-5 text-body-lg leading-relaxed text-text-secondary">{body}</p>
        </div>
        <div className={reverse ? 'md:order-1' : undefined}>{visual}</div>
      </div>
    </section>
  );
}

const ROSTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'RHP', 'LHP'];

function RosterVisual() {
  return (
    <PaperCard registrationTick className="p-6 sm:p-8">
      <div className="flex flex-wrap gap-2">
        {ROSTER_POSITIONS.map((pos) => (
          <PositionChip key={pos} label={pos} ink="team" />
        ))}
      </div>
      <HairlineRule ink="team" weight={2} className="my-6 w-14 rounded-full" />
      <p className="text-body-sm text-text-tertiary">
        Every position, every class year — one active roster the whole staff can see, not a shared spreadsheet.
      </p>
    </PaperCard>
  );
}

function StatsVisual() {
  return (
    <PaperCard registrationTick className="p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <RuledStatLine label="BATTING AVG" value="" ghost />
        <RuledStatLine label="ERA" value="" ghost />
        <RuledStatLine label="OPS" value="" ghost />
      </div>
      <p className="mt-6 text-body-sm text-text-tertiary">
        Every logged game rolls into the record book automatically.
      </p>
    </PaperCard>
  );
}

const PIPELINE_STAGES = ['Watchlist', 'High Priority', 'Offer Extended', 'Committed'];

function PipelineVisual() {
  return (
    <PaperCard registrationTick className="p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="flex flex-col gap-2">
            <Eyebrow ink="pursuit">{stage}</Eyebrow>
            <HairlineRule ink="pursuit" weight={2} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <GradeStamp value={60} tool="POWER" present={false} size="sm" />
          <GradeStamp value={55} tool="ARM" present={false} size="sm" />
        </div>
        <p className="text-body-sm text-text-tertiary">
          Standard 20-80 scouting grades travel with every prospect file.
        </p>
      </div>
    </PaperCard>
  );
}

/** Attendance statuses as `baseball_practice_attendance.status` actually stores them. */
const ATTENDANCE_STATES = ['Present', 'Limited', 'Absent', 'Excused'];

function PracticeVisual() {
  return (
    <PaperCard registrationTick className="p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {ATTENDANCE_STATES.map((state) => (
          <div key={state} className="flex flex-col gap-2">
            <Eyebrow ink="pursuit">{state}</Eyebrow>
            <HairlineRule ink="pursuit" weight={2} />
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <RuledStatLine label="READINESS" value="" ghost />
        <RuledStatLine label="LIFT" value="" ghost />
        <RuledStatLine label="PRACTICE" value="" ghost />
      </div>
      <p className="mt-6 text-body-sm text-text-tertiary">
        One day, one record — planned, checked in, and accounted for.
      </p>
    </PaperCard>
  );
}

function PassportVisual() {
  return (
    <PaperCard registrationTick className="p-6 sm:p-8">
      <Masthead
        given="Your"
        surname="Name"
        ink="team"
        accentRule
        dateline={<Eyebrow items={['POS · CLASS', 'YOUR CITY, STATE']} ink="team" />}
      />
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <RuledStatLine label="EXIT VELO" value="" unit="MPH" ghost />
        <RuledStatLine label="POP TIME" value="" unit="SEC" ghost />
        <RuledStatLine label="60-YARD" value="" unit="SEC" ghost />
      </div>
    </PaperCard>
  );
}

function ClosingCta() {
  return (
    <section className="border-t border-[color:var(--hairline)] bg-[var(--paper)] px-5 py-14 text-center sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-annual text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Built for coaches who are done juggling spreadsheets.
        </h2>
        <p className="mt-4 text-body-lg text-text-secondary">
          Sign in to an existing program, start a new one, or join with the code your coach sent you.
        </p>
        <CtaRow className="mt-8 justify-center" />
      </div>
    </section>
  );
}

function CtaRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 sm:flex-row', className)}>
      <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
        <Link href="/baseball/login">
          Sign in
          <IconArrowRight size={16} />
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
        <Link href="/baseball/signup">Create a program</Link>
      </Button>
      <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
        <Link href="/baseball/join">Join with a code</Link>
      </Button>
    </div>
  );
}
