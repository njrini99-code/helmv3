'use client';

import { useRef } from 'react';
import { MarketingScrollProvider } from '@/lib/motion/gsap/MarketingScrollProvider';
import { useScene } from '@/lib/motion/gsap/useScene';
import { DashboardReveal } from './DashboardReveal';
import { CoachHelmSection, PerformanceSection } from './FeatureSections';
import { LandingHero } from './LandingHero';
import { MarketingShell } from './MarketingShell';
import { thesisScene } from './scenes/thesisScene';
import { StatsShowcase } from './StatsShowcase';
import { TeamSection } from './TeamSection';
import { useRequestDemo } from './request-demo-context';

/**
 * Helm Sports Labs landing page — implementation of the Claude Design
 * prototype (Helm Landing.dc.html) on the real Fairway tokens.
 *
 * Order: header → hero → thesis → GolfHelm dashboard reveal → CoachHelm
 * (dark) → Shot Tracking & Stats → player-detail stats showcase → Team
 * Management assembly → final CTA + footer. Green stays semantic-only; no
 * serif; reduced motion renders settled compositions.
 */

function ThesisSection() {
  const rootRef = useRef<HTMLElement | null>(null);
  // L2 · the eyebrow performs the section's own claim: three separate concerns
  // resolving into one line. See `thesisScene` for why this is a real Flip.
  useScene(rootRef, thesisScene);

  return (
    <section
      ref={rootRef}
      className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] py-[clamp(70px,12vw,180px)]"
    >
      <div className="max-w-[960px] md:ml-[clamp(0px,8vw,140px)]">
        <div
          data-thesis="pillars"
          className="flex flex-wrap gap-[18px] font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-text-tertiary"
        >
          <span data-thesis="pillar">Coaching</span>
          <span data-thesis="sep" aria-hidden="true" className="text-[oklch(0.862_0.013_82)]">/</span>
          <span data-thesis="pillar">Performance</span>
          <span data-thesis="sep" aria-hidden="true" className="text-[oklch(0.862_0.013_82)]">/</span>
          <span data-thesis="pillar">Program</span>
        </div>
        <p
          data-thesis="statement"
          className="mt-[26px] text-[clamp(1.7rem,3.6vw,3rem)] leading-[1.12] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
          style={{ fontWeight: 560 }}
        >
          A clear view of every round, every player, and what to do next.
        </p>
        <p
          data-thesis="body"
          className="mt-[26px] max-w-[38em] text-[clamp(1.02rem,1.4vw,1.2rem)] leading-relaxed text-text-secondary [text-wrap:pretty]"
        >
          GolfHelm turns a program&apos;s rounds, shots, and statistics into one coherent operating view — so the next
          decision is always the clear one.
        </p>
      </div>
    </section>
  );
}

function LandingSections() {
  const openModal = useRequestDemo();
  return (
    <>
      {/* ORDER = the order the product actually processes a shot.
          capture → math → cause → operating view → program.

          It used to run hero → thesis → DASHBOARD → CoachHelm → capture →
          stats → team, i.e. the aggregate view arrived before the raw shot
          capture that produces it and before the stats that explain it. The
          sections were individually fine and the page still read as a list,
          because the argument ran backwards. Nothing here is a new section —
          the chain was already spelled out in the mocks, in this order:

            Hole 7 · Shot 3 · Approach · Green · 18 ft   (capture)
              → SG by category, Putting −0.6 flagged      (math)
              → "Putting is the leak…" + its receipts      (cause)
              → the coach's operating view                (dashboard)
              → a practice block on next week's board     (program) */}
      <LandingHero onRequestDemo={openModal} />
      <ThesisSection />
      <PerformanceSection />
      <CoachHelmSection />
      <StatsShowcase />
      <DashboardReveal />
      <TeamSection />
    </>
  );
}

export function LandingView() {
  return (
    <>
      {/* ONE scroll loop for the page: Lenis driven by GSAP's ticker, feeding
          ScrollTrigger. Mounted here (not in MarketingShell) so /about and
          /pricing — which still run the legacy motion.tsx system — keep native
          scrolling and never get two competing scroll owners. */}
      <MarketingScrollProvider anchors />
      <MarketingShell showCta>
        <LandingSections />
      </MarketingShell>
    </>
  );
}
