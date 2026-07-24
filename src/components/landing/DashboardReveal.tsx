'use client';

import { useCallback, useRef } from 'react';
import { GLASS_BEZEL } from './glass';
import { MobileMockScroller } from './MockViewport';
import { DashboardMock } from './mockups/DashboardMock';
import { Reveal, ScaledEmbed, clamp01, prefersReducedMotion, sectionProgress, useIsDesktop, useScrollFrame } from './motion';

/**
 * GolfHelm dashboard reveal — a 190vh pinned scene. The handcrafted
 * dashboard settles from a 3D perspective into front-on as you scrub
 * through the section (fully reversible; static under reduced motion).
 */

const DASHBOARD_ARIA =
  'Preview of the GolfHelm coach dashboard: today’s schedule, team scoring average 70.5, GIR 57%, putts per round 31.3, recent rounds, and top performers';

function SectionHeading() {
  return (
    <Reveal className="mx-auto mb-[clamp(20px,3vh,38px)] max-w-[640px] text-center">
      <div className="font-fw-mono text-[0.75rem] uppercase tracking-[0.2em] text-accent-700">GolfHelm</div>
      <h2
        className="mt-3.5 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.02] tracking-[-0.022em] text-text-primary [text-wrap:balance]"
        style={{ fontWeight: 600 }}
      >
        The whole program, in view.
      </h2>
      <p className="mx-auto mt-4 max-w-[34em] text-[clamp(1rem,1.35vw,1.15rem)] leading-relaxed text-text-secondary [text-wrap:pretty]">
        Rounds, players, and coaching intelligence resolve into one coherent operating view.
      </p>
    </Reveal>
  );
}

export function DashboardReveal() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  // null on the server/hydration pass (render both variants so markup
  // matches), then collapses to one so only a single mock stays in the DOM.
  const isDesktop = useIsDesktop();

  useScrollFrame(
    useCallback(() => {
      const sec = sectionRef.current;
      const frame = frameRef.current;
      if (!sec || !frame) return;
      if (prefersReducedMotion() || window.innerWidth < 768) {
        frame.style.transform = 'none';
        frame.style.opacity = '1';
        return;
      }
      const p = sectionProgress(sec);
      const e = clamp01(p / 0.7);
      const op = clamp01(p / 0.15);
      const rx = 6 - 6 * e;
      const ry = -9 + 9 * e;
      const rz = -1 + 1 * e;
      const sc = 0.94 + 0.06 * e;
      const ty = 60 - 60 * clamp01(p / 0.3);
      frame.style.transform = `perspective(1700px) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${sc})`;
      frame.style.opacity = String(op);
    }, []),
  );

  return (
    <section
      id="golfhelm"
      ref={sectionRef}
      className="relative scroll-mt-[90px] md:h-[190vh]"
      style={{ background: 'linear-gradient(180deg, var(--fw-color-canvas), var(--fw-color-surface-tint))' }}
    >
      {/* Desktop: pinned perspective-settle scene */}
      {isDesktop !== false && (
      <div className="hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col md:items-center md:justify-center md:overflow-clip md:px-[clamp(20px,4vw,64px)]">
        <SectionHeading />
        <div
          ref={frameRef}
          role="img"
          aria-label={DASHBOARD_ARIA}
          className="w-[min(1040px,95vw)] rounded-3xl p-1.5 will-change-transform [transform-origin:center_60%]"
          style={GLASS_BEZEL}
        >
          <div aria-hidden="true" className="overflow-hidden rounded-xl bg-surface">
            <ScaledEmbed designWidth={1280}>
              <DashboardMock />
            </ScaledEmbed>
          </div>
        </div>
      </div>
      )}

      {/* Mobile: composed static band with a swipeable dashboard */}
      {isDesktop !== true && (
      <div className="px-5 py-16 md:hidden">
        <SectionHeading />
        <MobileMockScroller designWidth={1280} ariaLabel={DASHBOARD_ARIA}>
          <DashboardMock />
        </MobileMockScroller>
      </div>
      )}
    </section>
  );
}
