'use client';

import Image from 'next/image';
import { useRef, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { scrollToHash } from './LandingHeader';
import { useScene } from '@/lib/motion/gsap/useScene';
import { heroScene } from './scenes/heroScene';

/**
 * L1 · Hero — the tee.
 *
 * A graded full-bleed course photograph acting as the page's GROUND PLANE, a
 * masked-line headline entrance, and a scroll-scrubbed flight arc that draws
 * out of the photograph's horizon and becomes the corridor every chapter below
 * travels down.
 *
 * The entrance is owned by `heroScene` (GSAP), not by CSS keyframes — the old
 * `landing-hero-*` classes were removed rather than left in place, because a
 * CSS animation and a GSAP tween writing the same transform is a race whose
 * winner depends on when hydration lands.
 */

interface LandingHeroProps {
  onRequestDemo: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function LandingHero({ onRequestDemo }: LandingHeroProps) {
  const rootRef = useRef<HTMLElement>(null);
  useScene(rootRef, heroScene);

  return (
    <section ref={rootRef} className="relative overflow-clip">
      {/* Sunlit glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[14%] -right-[8%] h-[52vw] max-h-[760px] w-[52vw] max-w-[760px] rounded-full blur-[10px]"
        style={{ background: 'radial-gradient(circle at 50% 50%, oklch(0.9 0.07 120 / 0.28), transparent 62%)' }}
      />

      {/* The tee shot. Decorative — the corridor is a metaphor, and every fact
          it implies is stated in text below.

          The trace is a WARM GRAPHITE HAIRLINE, not a bright line: it has to
          read against the champagne canvas on the left AND the sunlit
          photograph on the right, and a cream stroke disappears on cream. A
          hairline + a single bright ball also matches the depth model — the
          canvas plane stays quiet, and the DATUM (the ball) is the only thing
          allowed to be loud. */}
      {/* z-[3]: ABOVE the photograph. At z-[1] the trace ran behind the plate
          and only the faint cream-on-cream half was visible, which read as a
          rendering artifact rather than a deliberate mark. A trace that crosses
          the photograph and continues onto the linen is the whole point — it is
          what makes the corridor one continuous plane. */}
      {/* TWO frames, one gesture. `slice` scales uniformly to COVER the hero,
          anchored top-left — so on a portrait phone the scale is driven by
          height (828/700 ≈ 1.18) and the 1000-unit-wide viewBox renders ~1183px
          across a 390px screen. Two thirds of the arc, including the entire
          start and most of the ball's flight, was being clipped off the right
          edge: the ball flew in from nowhere with no trace under it.

          A single responsive path cannot fix that, because the visible user-space
          window differs per aspect ratio. So the landscape frame keeps the
          original geometry and the portrait frame redraws the SAME descending
          tee shot inside a box a phone can actually show. `heroScene` picks
          whichever is rendered, so only one is ever animated.

          UNIFORM scaling stays mandatory in both: `getTotalLength()` returns
          viewBox user units and the draw-on is a strokeDasharray in those units,
          so a non-uniform `preserveAspectRatio="none"` would desync the dash
          from the rendered stroke and leak the hidden tail at offset 0. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] h-full w-full md:hidden"
        viewBox="0 0 340 700"
        preserveAspectRatio="xMinYMin slice"
        fill="none"
      >
        {/* THE PORTRAIT ARC MUST START BELOW THE COPY.
            The previous path began at (300, 70) — near the top of the frame —
            and descended left across the whole hero. In one column the copy is
            the whole width, so that line ran straight THROUGH it: measured at
            402px it crossed the headline at (355, 155) and the body paragraph
            at (319, 287), cutting between "angle" and "of" and through
            "— where". A graphite hairline crossing running text is exactly the
            "reads as a rendering artifact" failure this file already records
            for the desktop frame, only worse, because here it lands on words.

            There is no clear column to route around: below `md` the text spans
            edge to edge. So the arc starts where the text ENDS — at the top
            right of the photograph — and sweeps down across it. The tee shot
            now launches out of the copy and onto the course, which is the same
            gesture the landscape frame makes, stated in the form a single
            column can actually hold. */}
        <path
          data-hero="arc"
          d="M 332 336 C 300 424, 250 516, 180 588 S 72 668, 6 700"
          stroke="oklch(0.44 0.02 70 / 0.34)"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <g data-hero="ball">
          <circle r="9" cx="0" cy="0" fill="oklch(0.953 0.022 83 / 0.55)" />
          <circle r="4.5" cx="0" cy="0" fill="oklch(0.28 0.02 60)" />
        </g>
      </svg>

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] hidden h-full w-full md:block"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMinYMin slice"
        fill="none"
      >
        <path
          data-hero="arc"
          d="M 760 150 C 700 300, 560 420, 380 520 S 120 640, 40 700"
          stroke="oklch(0.44 0.02 70 / 0.34)"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* The ball carries a soft halo so it stays legible crossing from the
            dark photograph onto the light canvas without changing colour. Both
            marks live in ONE group so the scene translates a single node —
            two elements sharing the hook would leave the halo behind. */}
        <g data-hero="ball">
          <circle r="9" cx="0" cy="0" fill="oklch(0.953 0.022 83 / 0.55)" />
          <circle r="4.5" cx="0" cy="0" fill="oklch(0.28 0.02 60)" />
        </g>
      </svg>

      <div
        className="relative z-[2] mx-auto grid max-w-[1320px] items-center gap-[clamp(32px,5vw,72px)] px-[clamp(20px,4vw,64px)] pt-[clamp(40px,7vw,96px)] pb-[clamp(56px,7vw,110px)]"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}
      >
        <div className="max-w-[600px]">
          <h1
            data-hero="headline"
            className="text-[clamp(3rem,6.6vw,6rem)] leading-[0.98] tracking-[-0.028em] text-text-primary [text-wrap:balance]"
            style={{ fontWeight: 640 }}
          >
            Command every angle of your program.
          </h1>
          <p
            data-hero="sub"
            className="mt-[30px] max-w-[32em] text-[clamp(1.06rem,1.5vw,1.32rem)] leading-normal text-text-secondary [text-wrap:pretty]"
          >
            The operating system for college golf — where every round, shot, and stat resolves into your next coaching decision.
          </p>
          {/* STACKED BELOW `sm`, NOT WRAPPED.
              `flex-wrap` + a 22px gap put these two on a knife edge: the button
              and the link together need ~378px, and a phone offers 350 at 390px
              wide and 362 at 402px. So the row rendered on ONE line on an
              iPhone 14 Pro and wrapped to TWO on a 390px phone — measured 48px
              tall vs 100px — which is the same "renders differently on every
              device" class of bug as the stat tiles below.

              The row returns at `lg`, NOT at `sm`. From 768px the hero grid
              splits into two columns, which leaves the copy column only ~334px
              wide — narrower than a phone — so a row restored at `sm` wrapped
              again on iPad portrait (measured 100px there too). The column
              first clears the ~378px the row needs at around 900px, so `lg` is
              the first breakpoint where a row is honestly safe. Below it the
              two actions stack, which is deterministic at every width and gives
              both a full-width tap target. */}
          <div
            data-hero="actions"
            className="mt-[34px] flex flex-col items-start gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-[22px]"
          >
            <Button
              variant="primary"
              size="lg"
              onClick={onRequestDemo}
              className="rounded-full bg-primary-700 px-7 text-[0.9375rem] font-semibold hover:bg-primary-800 shadow-[0_1px_1px_oklch(0.35_0.08_150/0.4),0_3px_10px_oklch(0.35_0.08_150/0.28)]"
            >
              Request Demo
            </Button>
            <a
              href="#golfhelm"
              onClick={(e) => scrollToHash(e, '#golfhelm')}
              className="group inline-flex items-center gap-[9px] text-body font-medium text-text-primary"
            >
              {/* The GolfHelm mark was 21px — smaller than the cap-height of
                  the label beside it, so it read as a bullet rather than as
                  the product's logo. 30px sits it properly against the
                  ~17px/1.5 line box and lets the mark actually be legible. */}
              <Image
                src="/helm-golf-logo-transparent.png"
                alt=""
                width={60}
                height={60}
                // object-contain: the source is 189x154 (WIDER than tall), so
                // forcing a 30x30 box with the default object-fit:fill stretched it
                // ~19%. Every other usage of this mark in the app already pins
                // object-contain; these landing ones were the two that did not.
                className="h-[30px] w-[30px] object-contain"
              />
              Explore GolfHelm
              <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </a>
          </div>
        </div>

        {/* The plate escapes the text column toward the viewport edge. At md+
            that is one edge: the grid puts it in the right-hand column of a
            centred max-w-[1320px] container, so pulling only its right margin
            reads as deliberate.

            On a phone the grid is one column and the same rule bled the photo
            flush to the right edge — square corner against the screen — while
            the headline beside it stayed inset 20px on the left. Asymmetric
            like that reads as a bug, not a decision. Below md it bleeds BOTH
            edges and drops its rounding, which is the same idea stated in the
            form a single column can carry. */}
        <div
          data-hero="plate"
          className="relative -mx-[clamp(20px,4vw,64px)] md:ml-0 md:mr-[calc(-1*clamp(20px,4vw,64px))]"
        >
          <div className="relative aspect-[5/4.3] overflow-hidden rounded-none shadow-[0_2px_4px_oklch(0.18_0.01_60/0.08),0_20px_48px_oklch(0.18_0.01_60/0.17),0_48px_100px_oklch(0.18_0.01_60/0.14)] md:rounded-l-3xl">
            <Image
              src="/hero-golf.jpg"
              alt="An elevated, sunlit view of a college course green — two players walking the putting surface beside bunkers, flag in place"
              fill
              priority
              sizes="(min-width: 1400px) 720px, (min-width: 768px) 52vw, 100vw"
              className="object-cover brightness-[1.15] contrast-[0.98] saturate-[1.05]"
              style={{ objectPosition: '50% 46%' }}
            />
            {/* Glass sheen + grade */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(158deg, oklch(1 0 0 / 0.24), transparent 32%), linear-gradient(180deg, transparent 60%, oklch(0.28 0.02 60 / 0.28))',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{ boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.35)' }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
