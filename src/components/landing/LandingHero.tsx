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
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        viewBox="0 0 1000 700"
        /* UNIFORM scaling is required, not cosmetic: `getTotalLength()` returns
           a length in viewBox user units and the draw-on is a strokeDasharray
           in those same units. Under `preserveAspectRatio="none"` the x and y
           axes scale by different factors, so the rendered stroke no longer
           matches the dash length and the "hidden" tail leaks into view at
           offset 0. `slice` keeps the trace covering the hero while scaling
           both axes equally, which keeps the dash math honest. */
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
          <div data-hero="actions" className="mt-[34px] flex flex-wrap items-center gap-[22px]">
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
                className="h-[30px] w-[30px]"
              />
              Explore GolfHelm
              <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </a>
          </div>
        </div>

        <div data-hero="plate" className="relative mr-[calc(-1*clamp(20px,4vw,64px))]">
          <div className="relative aspect-[5/4.3] overflow-hidden rounded-l-3xl shadow-[0_2px_4px_oklch(0.18_0.01_60/0.08),0_20px_48px_oklch(0.18_0.01_60/0.17),0_48px_100px_oklch(0.18_0.01_60/0.14)]">
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
