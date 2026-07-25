'use client';

import { useRef } from 'react';
import { GLASS_BEZEL } from './glass';
import { FitEmbed } from './MockViewport';
import { StatsMock } from './mockups/StatsMock';
import { Reveal, ScaledEmbed, useIsDesktop, useParallax } from './motion';
import { useScene } from '@/lib/motion/gsap/useScene';
import { statsScene } from './scenes/statsScene';

/**
 * Player-detail stats showcase — the spine + bento stats page embedded as a
 * full-width band with the deep parallax tilt (data-parallax 66).
 */

const STATS_ARIA =
  'Preview of the player stats page: strokes gained spine at −4.44 per round with putting as the top priority, beside a bento of ball-striking, per-18, putting make rates, and last-10-rounds trend';

export function StatsShowcase() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isDesktop = useIsDesktop();
  useParallax(sectionRef);
  // L5 · verdict first, then the product's own ranking, then the cells in that
  // ranking's order — the leak arrives before the healthy numbers do.
  useScene(sectionRef, statsScene);

  return (
    <section
      id="statsdetail"
      ref={sectionRef}
      className="relative scroll-mt-[90px] overflow-clip"
      style={{ background: 'linear-gradient(180deg, var(--fw-color-canvas), var(--fw-color-surface-tint))' }}
    >
      <div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,64px)] py-[clamp(70px,9vw,130px)]">
        <Reveal wipeOnly data-parallax="18" className="mx-auto max-w-[620px] text-center">
          <div className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-accent-700">Player detail</div>
          <h2
            className="mt-4 text-[clamp(1.9rem,3.6vw,2.9rem)] leading-[1.05] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
            style={{ fontWeight: 600 }}
          >
            See exactly where the strokes leak.
          </h2>
          <p className="mx-auto mt-4 max-w-[36em] text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-text-secondary [text-wrap:pretty]">
            Open any player and GolfHelm benchmarks them against the field and the team, then ranks the leaks in
            order — so the practice plan writes itself.
          </p>
        </Reveal>

        {/* Desktop: parallax-tilt band */}
        {isDesktop !== false && (
        <div
          data-parallax="66"
          role="img"
          aria-label={STATS_ARIA}
          className="mx-auto mt-[clamp(34px,4vw,56px)] hidden w-[min(1120px,100%)] rounded-3xl p-1.5 will-change-transform md:block"
          style={GLASS_BEZEL}
        >
          <div aria-hidden="true" className="overflow-hidden rounded-xl bg-canvas">
            <ScaledEmbed designWidth={1160}>
              <StatsMock />
            </ScaledEmbed>
          </div>
        </div>
        )}

        {/* Mobile: whole surface fit to width (no horizontal scroll) */}
        {isDesktop !== true && (
        <FitEmbed designWidth={1160} ariaLabel={STATS_ARIA} className="mt-9 md:hidden">
          <StatsMock />
        </FitEmbed>
        )}
      </div>
    </section>
  );
}
