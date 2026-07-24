'use client';

import { useCallback, useRef } from 'react';
import { GLASS_BEZEL } from './glass';
import { FitEmbed } from './MockViewport';
import { DashboardMock } from './mockups/DashboardMock';
import { ScaledEmbed, clamp01, prefersReducedMotion, sectionProgress, useIsDesktop, useScrollFrame } from './motion';

/**
 * GolfHelm dashboard reveal — a pinned scene. The handcrafted dashboard
 * settles from a 3D perspective into front-on as you scrub through the
 * section (fully reversible; static under reduced motion).
 *
 * No section heading of its own: the thesis section immediately above already
 * frames this ("a clear view of every round … one coherent operating view"),
 * so a second "The whole program, in view / operating view" heading was
 * redundant, pushed the dashboard down the page, and — being taller than the
 * pinned viewport with the mock — got its top clipped. Dropping it lets the
 * dashboard pop out right after the thesis (Nick, 07-24).
 */

const DASHBOARD_ARIA =
  'Preview of the GolfHelm coach dashboard: today’s schedule, team scoring average 70.5, GIR 57%, putts per round 31.3, recent rounds, and top performers';

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
      // Settle faster so the dashboard reads as "popped out" early in the
      // pin, not something you have to scroll a long way to resolve.
      const e = clamp01(p / 0.5);
      const op = clamp01(p / 0.1);
      const rx = 6 - 6 * e;
      const ry = -9 + 9 * e;
      const rz = -1 + 1 * e;
      const sc = 0.94 + 0.06 * e;
      const ty = 56 - 56 * clamp01(p / 0.24);
      frame.style.transform = `perspective(1700px) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${sc})`;
      frame.style.opacity = String(op);
    }, []),
  );

  return (
    <section
      id="golfhelm"
      ref={sectionRef}
      className="relative scroll-mt-[90px] md:h-[150vh]"
      style={{ background: 'linear-gradient(180deg, var(--fw-color-canvas), var(--fw-color-surface-tint))' }}
    >
      {/* Desktop: pinned perspective-settle scene (dashboard only — the thesis
          above is its heading). */}
      {isDesktop !== false && (
      <div className="hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col md:items-center md:justify-center md:overflow-clip md:px-[clamp(20px,4vw,64px)]">
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

      {/* Mobile: the whole dashboard, fit to width (no horizontal scroll). */}
      {isDesktop !== true && (
      <div className="px-5 py-14 md:hidden">
        <FitEmbed designWidth={1280} ariaLabel={DASHBOARD_ARIA}>
          <DashboardMock />
        </FitEmbed>
      </div>
      )}
    </section>
  );
}
