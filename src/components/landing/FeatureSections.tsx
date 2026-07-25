'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { CoachHelmPanel } from './mockups/CoachHelmPanel';
import { PlayerDetailCard } from './mockups/PlayerDetailCard';
import { TrackingCockpit } from './mockups/TrackingCockpit';
import { Reveal, useParallax, useSequence } from './motion';

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  useParallax(sectionRef);
  useSequence(panelRef);

  return (
    <section id="coachhelm" ref={sectionRef} className="scroll-mt-[90px] bg-stone-950 text-text-on-accent">
      <div
        className="mx-auto grid max-w-[1320px] items-center gap-[clamp(36px,5vw,72px)] px-[clamp(20px,4vw,64px)] py-[clamp(80px,10vw,150px)]"
        style={AUTO_GRID}
      >
        <Reveal wipeOnly data-parallax="22" className="max-w-[440px]">
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
        </Reveal>
        <Reveal
          wipeOnly
          data-parallax="52"
          className="will-change-transform"
          role="img"
          aria-label="Preview of a CoachHelm insight: strokes gained by category over the last 10 rounds, putting flagged as the leak at −0.6 strokes per round, with a recommended practice block"
        >
          <div ref={panelRef} aria-hidden="true">
            <CoachHelmPanel />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function PerformanceSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const cockpitRef = useRef<HTMLDivElement | null>(null);
  useParallax(sectionRef);
  useSequence(cockpitRef);

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
        <Reveal
          delay={120}
          className="order-2 w-full max-w-[380px] justify-self-center md:order-1"
          role="img"
          aria-label="Preview of live shot tracking: hole 7, par 4, 412 yards — an approach shot resolving to the green, 18 feet from the hole, with strokes gained, GIR, and putts readouts"
        >
          <div ref={cockpitRef} aria-hidden="true">
            <TrackingCockpit />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
