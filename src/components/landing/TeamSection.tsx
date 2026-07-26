'use client';

import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { GLASS_BEZEL, GLASS_CARD } from './glass';
import { FitEmbed } from './MockViewport';
import { TeamMock } from './mockups/TeamMock';
import { Reveal, ScaledEmbed, clamp01, prefersReducedMotion, useIsDesktop, useParallax, useScrollFrame } from './motion';

/**
 * Team Management — an in-flow assembly scene. The seven cards of the team
 * surface (roster, travel, class schedules, announcements, live qualifier,
 * development plans, this-week) start loosely pulled toward the board's centre
 * — each with its own deterministic offset, rotation, and scale — and scrub
 * back together into the composed board as you scroll. Keeping every piece
 * inside the board avoids the clipped/blank opening frame of the old
 * off-canvas scatter. Fully reversible; static under reduced motion.
 */

const TEAM_ARIA =
  'Preview of team management: an eight-player roster with statuses and focus areas, travel itinerary, class-schedule conflicts, announcements, a live qualifier with the top-5 cut line, development plans, and the week’s schedule';

/** Deterministic pseudo-random (no Math.random — scrub must be stable). */
function rand(n: number): number {
  const x = Math.sin((n + 1) * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function StatCard({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div
      className="flex h-full min-w-0 flex-col items-center gap-1.5 overflow-clip rounded-2xl px-3 py-[15px] text-center backdrop-blur-xl sm:flex-row sm:items-center sm:gap-3 sm:px-[17px] sm:text-left"
      style={GLASS_CARD}
    >
      <span className="hidden h-[34px] w-[34px] flex-none items-center justify-center rounded-md bg-accent-50 shadow-[inset_0_1px_0_oklch(1_0_0/0.6),0_2px_6px_oklch(0.18_0.01_60/0.1)] sm:inline-flex">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--fw-color-accent-700)" strokeWidth="2" aria-hidden="true">
          {icon}
        </svg>
      </span>
      <div className="min-w-0">
        <div className="font-fw-mono text-[1.1875rem] font-semibold text-text-primary">{value}</div>
        <div className="text-caption font-normal leading-tight text-text-tertiary">{label}</div>
      </div>
    </div>
  );
}

function SectionHeading() {
  return (
    <>
      <Reveal wipeOnly data-parallax="22" className="mx-auto mb-[clamp(22px,3vh,38px)] max-w-[600px] text-center">
        <div className="font-fw-mono text-[0.719rem] uppercase tracking-[0.18em] text-accent-700">Team Management</div>
        <h2
          className="mt-4 text-[clamp(1.9rem,3.4vw,2.75rem)] leading-[1.06] tracking-[-0.02em] text-text-primary [text-wrap:balance]"
          style={{ fontWeight: 600 }}
        >
          No more group chats.
        </h2>
        <p className="mt-5 text-[clamp(1rem,1.3vw,1.12rem)] leading-relaxed text-text-secondary [text-wrap:pretty]">
          Roster, travel, class schedules, qualifiers, development, and announcements run in one place — so the
          program moves on a system, not a group chat.
        </p>
      </Reveal>
      <div className="mb-[26px] grid w-full max-w-[660px] grid-cols-3 gap-3.5">
        <Reveal data-team-stat className="min-w-0" delay={0}>
          <StatCard
            icon={
              <>
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 4a3 3 0 0 1 0 6" />
              </>
            }
            value="8"
            label="Players on roster"
          />
        </Reveal>
        <Reveal data-team-stat className="min-w-0" delay={70}>
          <StatCard
            icon={
              <>
                <rect x="3" y="4.5" width="18" height="17" rx="2" />
                <path d="M16 3v4M8 3v4M3 10h18" />
              </>
            }
            value="3"
            label="Events this week"
          />
        </Reveal>
        <Reveal data-team-stat className="min-w-0" delay={140}>
          <StatCard icon={<path d="M5 21V4h11l-1.5 3L16 10H5" />} value="1" label="Active qualifier" />
        </Reveal>
      </div>
    </>
  );
}

export function TeamSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const piecesRef = useRef<HTMLElement[] | null>(null);
  const isDesktop = useIsDesktop();
  useParallax(sectionRef);

  // Tag each assembly piece with its deterministic scatter BEFORE first
  // paint (a passive effect would flash the assembled board for one frame
  // on back-navigation with restored scroll or /#team deep links).
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const board = boardRef.current;
    if (!board) return;
    const cards = Array.from(board.querySelectorAll<HTMLElement>('[data-assembly-piece]'));
    if (!cards.length) return;
    const boardRect = board.getBoundingClientRect();
    const boardCenterX = boardRect.left + boardRect.width / 2;
    const boardCenterY = boardRect.top + boardRect.height / 2;
    cards.forEach((el, i) => {
      const cardRect = el.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const cardCenterY = cardRect.top + cardRect.height / 2;
      const pull = 0.1 + rand(i + 7) * 0.08;
      const jitterX = (rand(i + 11) - 0.5) * 28;
      const jitterY = (rand(i + 17) - 0.5) * 20;

      // Pull inward instead of throwing pieces beyond the section's clip.
      // The board remains readable from its first frame, while the authored
      // arrival order still resolves every surface into its exact grid slot.
      el.dataset.dx = ((boardCenterX - cardCenterX) * pull + jitterX).toFixed(0);
      el.dataset.dy = ((boardCenterY - cardCenterY) * pull + jitterY).toFixed(0);
      el.dataset.rot = ((rand(i + 3) - 0.5) * 9).toFixed(1);
      el.dataset.scale = (0.9 + rand(i + 19) * 0.04).toFixed(3);
      // ARRIVAL ORDER IS AUTHORED, NOT POSITIONAL. `i` is DOM order, which is a
      // layout accident — it had the roster, the qualifier and the week landing
      // in whatever sequence the grid happened to declare them. The board now
      // assembles the way a program is actually built: roster first, then the
      // week that roster is committed to, then the qualifier that decides who
      // travels, then travel, then the development plans that come out of it,
      // and announcements LAST — a broadcast is the consequence of every
      // decision above it, never the start of one. `data-assembly-order` on the
      // mock is the source of truth; DOM order is the fallback.
      const order = Number(el.dataset.assemblyOrder ?? i);
      el.dataset.st = ((Number.isFinite(order) ? order : i) * 0.055).toFixed(3);
    });
    piecesRef.current = cards;
    return () => {
      piecesRef.current = null;
    };
    // Re-tag when the desktop variant (re)mounts across the breakpoint.
  }, [isDesktop]);

  useScrollFrame(
    useCallback(() => {
      const pieces = piecesRef.current;
      const sec = sectionRef.current;
      if (!pieces || !sec) return;
      if (window.innerWidth < 768) {
        pieces.forEach((el) => {
          el.style.transform = 'none';
        });
        return;
      }
      // Resolve while the section enters the viewport. The previous 210vh
      // sticky stage was shorter than its heading + board, so the lower cards
      // were permanently clipped on common laptop viewports. Keeping the board
      // in normal flow lets readers reach every surface, while this bounded
      // entrance still gives the assembly a clear scroll-driven beat.
      const rect = sec.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp01((vh * 0.88 - rect.top) / Math.max(1, vh * 0.55));
      const active = p > 0 && p < 1;
      pieces.forEach((el) => {
        el.style.willChange = active ? 'transform' : '';
        const st = parseFloat(el.dataset.st ?? '0') || 0;
        const local = clamp01((p - st) / 0.5);
        const e = 1 - Math.pow(1 - local, 3);
        const inv = 1 - e;
        const dx = Number(el.dataset.dx) * inv;
        const dy = Number(el.dataset.dy) * inv;
        const rot = Number(el.dataset.rot) * inv;
        const startScale = Number(el.dataset.scale) || 0.92;
        const scale = startScale + (1 - startScale) * e;
        el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      });
    }, []),
  );

  return (
    <section id="team" ref={sectionRef} className="relative scroll-mt-[90px] bg-canvas">
      {/* Desktop: in-flow assembly scene */}
      {isDesktop !== false && (
      <div className="hidden md:flex md:flex-col md:items-center md:px-[clamp(20px,4vw,64px)] md:py-[clamp(72px,9vw,132px)]">
        <SectionHeading />
        <Reveal
          className="relative w-[min(1060px,96vw)] rounded-3xl p-1.5"
          style={GLASS_BEZEL}
          role="img"
          aria-label={TEAM_ARIA}
        >
          <div ref={boardRef} aria-hidden="true" className="rounded-xl">
            <ScaledEmbed designWidth={1180}>
              <TeamMock />
            </ScaledEmbed>
          </div>
        </Reveal>
      </div>
      )}

      {/* Mobile: composed static band */}
      {isDesktop !== true && (
      <div className="flex flex-col items-center px-5 py-16 md:hidden">
        <SectionHeading />
        <FitEmbed designWidth={1180} ariaLabel={TEAM_ARIA} className="w-full">
          <TeamMock />
        </FitEmbed>
      </div>
      )}
    </section>
  );
}
