'use client';

import { DashboardReveal } from './DashboardReveal';
import { CoachHelmSection, PerformanceSection } from './FeatureSections';
import { LandingHero } from './LandingHero';
import { MarketingShell } from './MarketingShell';
import { Reveal } from './motion';
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
  return (
    <section className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] py-[clamp(70px,12vw,180px)]">
      <div className="max-w-[960px] md:ml-[clamp(0px,8vw,140px)]">
        <Reveal className="flex flex-wrap gap-[18px] font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-text-tertiary">
          <span>Coaching</span>
          <span aria-hidden="true" className="text-[oklch(0.862_0.013_82)]">/</span>
          <span>Performance</span>
          <span aria-hidden="true" className="text-[oklch(0.862_0.013_82)]">/</span>
          <span>Program</span>
        </Reveal>
        <Reveal
          as="p"
          delay={60}
          className="mt-[26px] text-[clamp(1.7rem,3.6vw,3rem)] leading-[1.12] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
          style={{ fontWeight: 560 }}
        >
          A clear view of every round, every player, and what to do next.
        </Reveal>
        <Reveal
          as="p"
          delay={120}
          className="mt-[26px] max-w-[38em] text-[clamp(1.02rem,1.4vw,1.2rem)] leading-relaxed text-text-secondary [text-wrap:pretty]"
        >
          GolfHelm turns a program&apos;s rounds, shots, and statistics into one coherent operating view — so the next
          decision is always the clear one.
        </Reveal>
      </div>
    </section>
  );
}

function LandingSections() {
  const openModal = useRequestDemo();
  return (
    <>
      <LandingHero onRequestDemo={openModal} />
      <ThesisSection />
      <DashboardReveal />
      <CoachHelmSection />
      <PerformanceSection />
      <StatsShowcase />
      <TeamSection />
    </>
  );
}

export function LandingView() {
  return (
    <MarketingShell showCta>
      <LandingSections />
    </MarketingShell>
  );
}
