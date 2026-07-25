'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { CoachHelmPanel } from './mockups/CoachHelmPanel';
import { PlayerDetailCard } from './mockups/PlayerDetailCard';
import { TrackingCockpit } from './mockups/TrackingCockpit';
import { Reveal } from './motion';
import { useScene } from '@/lib/motion/gsap/useScene';
import { captureScene } from './scenes/captureScene';
import { coachHelmScene } from './scenes/coachHelmScene';

/**
 * The two feature chapters with distinct spatial signatures:
 *   · CoachHelm — dark intelligence workspace (SG leak bars → insight →
 *     recommendation choreography, deep parallax tilt on the panel).
 *   · Shot Tracking & Stats — vertical tracking cockpit beside the copy +
 *     player-detail card (visuals alternate sides across chapters).
 */

const AUTO_GRID = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' } as const;

export function CoachHelmSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  // GSAP owns this chapter end to end — see coachHelmScene. The legacy
  // `useParallax` tilt and `useSequence` stagger wrote the same transforms and
  // opacities the scene drives, so they were removed rather than layered.
  useScene(sectionRef, coachHelmScene);

  return (
    <section id="coachhelm" ref={sectionRef} className="scroll-mt-[90px] bg-stone-950 text-text-on-accent">
      <div
        className="mx-auto grid max-w-[1320px] items-center gap-[clamp(36px,5vw,72px)] px-[clamp(20px,4vw,64px)] py-[clamp(80px,10vw,150px)]"
        style={AUTO_GRID}
      >
        <div data-ch="copy" className="max-w-[440px]">
          <div className="flex items-center gap-[9px]">
            <Image src="/helm-golf-logo-transparent.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-[oklch(0.75_0.13_150)]">CoachHelm</span>
          </div>
          <h2
            className="mt-4 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-on-accent [text-wrap:balance]"
            style={{ fontWeight: 600 }}
          >
            Ask the program. See the evidence.
          </h2>
          <p className="mt-5 text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-[oklch(0.8_0.008_85)] [text-wrap:pretty]">
            An intelligence layer that reads your program&apos;s own rounds and resolves them into an evidence-backed
            focus — with the sources it used, never a black box.
          </p>
        </div>
        <div
          className="will-change-transform"
          role="img"
          aria-label="Preview of a CoachHelm insight: strokes gained by category over the last 10 rounds, putting flagged as the leak at −0.6 strokes per round, with a recommended practice block"
        >
          <div aria-hidden="true">
            <CoachHelmPanel />
          </div>
        </div>
      </div>
    </section>
  );
}

export function PerformanceSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  // The capture chapter is GSAP-owned end to end: the legacy `useParallax`
  // tilt and `useSequence` on-enter stagger were removed rather than left
  // alongside it, because both write transforms/opacity onto the same nodes
  // `captureScene` drives — two owners for one property is a race.
  useScene(sectionRef, captureScene);

  return (
    <section
      id="performance"
      ref={sectionRef}
      className="scroll-mt-[90px]"
      style={{ background: 'linear-gradient(180deg, var(--fw-color-surface-tint), var(--fw-color-canvas))' }}
    >
      <div
        className="mx-auto grid max-w-[1320px] items-center gap-[clamp(36px,5vw,72px)] px-[clamp(20px,4vw,64px)] py-[clamp(80px,10vw,150px)]"
        style={AUTO_GRID}
      >
        <Reveal wipeOnly data-parallax="20" className="order-1 max-w-[460px] md:order-2">
          <div className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-accent-700">
            Shot Tracking &amp; Stats
          </div>
          <h2
            className="mt-4 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
            style={{ fontWeight: 600 }}
          >
            Every shot, in its place.
          </h2>
          <p className="mt-5 text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-text-secondary [text-wrap:pretty]">
            Shots are logged live on the hole — lie, distance, result — then resolve into strokes gained and the miss
            tendency a coach can actually work on.
          </p>
          <Reveal
            delay={150}
            className="mt-[30px]"
            role="img"
            aria-label="Preview of a player detail card: Test Player, scoring average 70.5, strokes gained +1.2, GIR 61%, improving over the last six rounds, focus on lag putting"
          >
            <div aria-hidden="true">
              <PlayerDetailCard />
            </div>
          </Reveal>
        </Reveal>
        <div
          data-capture="stage"
          className="order-2 w-full max-w-[380px] justify-self-center md:order-1"
          role="img"
          aria-label="Preview of live shot tracking: hole 7, par 4, 412 yards — an approach shot resolving to the green, 18 feet from the hole, with strokes gained, GIR, and putts readouts"
        >
          <div aria-hidden="true">
            <TrackingCockpit />
          </div>
        </div>
      </div>
    </section>
  );
}
