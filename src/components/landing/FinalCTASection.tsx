'use client';

import Link from 'next/link';
import { useRef, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Reveal } from './motion';
import { useScene } from '@/lib/motion/gsap/useScene';
import { pinScene } from './scenes/pinScene';

/**
 * Final CTA — warm-dark #0C0A09 field.
 *
 * The two concentric hairline rings that used to sit behind this copy are gone.
 * They were decorative geometry that would have looked equally at home behind
 * any product's closing band, in the one position on the page where a generic
 * flourish costs the most. In their place: the pin, the cup, and the shot the
 * hero started arriving at it — see `pinScene`.
 *
 * (Footer lives in LandingFooter, shared via MarketingShell.)
 */

interface FinalCTASectionProps {
  onRequestDemo: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function FinalCTASection({ onRequestDemo }: FinalCTASectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  useScene(sectionRef, pinScene);

  return (
    <section ref={sectionRef} className="bg-stone-950 text-text-on-accent">
      <div className="relative mx-auto max-w-[1320px] overflow-clip px-[clamp(20px,4vw,64px)] py-[clamp(90px,12vw,170px)] text-center">
        {/* The pin. `xMidYMid slice` and a fixed viewBox: the stroke lengths the
            scene measures are viewBox user units, and a non-uniform scale would
            desync them from what is painted — the dash "leak" this codebase has
            hit before. Sits at low opacity behind the copy and never over it. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 800 460"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ opacity: 0.5 }}
        >
          {/* The cup, then the pin standing in it. */}
          <path
            data-pin="cup"
            d="M 556 356 a 26 9 0 1 0 0.1 0"
            fill="none"
            stroke="oklch(1 0 0 / 0.22)"
            strokeWidth="1.25"
          />
          <path data-pin="pole" d="M 556 356 L 556 150" fill="none" stroke="oklch(1 0 0 / 0.28)" strokeWidth="1.25" />
          <path
            data-pin="flag"
            d="M 556 152 L 622 168 L 556 186 Z"
            fill="oklch(0.724 0.132 150 / 0.5)"
            stroke="none"
          />
          {/* The approach — the other end of the hero's arc. */}
          <path
            data-pin="approach"
            d="M 96 384 C 236 196, 404 168, 528 340"
            fill="none"
            stroke="oklch(0.724 0.132 150 / 0.42)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <g data-pin="ball">
            <circle r="9" fill="oklch(0.724 0.132 150 / 0.18)" />
            <circle r="4" fill="oklch(0.92 0.04 150 / 0.9)" />
          </g>
        </svg>
        <Reveal className="relative">
          <div className="font-fw-mono text-[0.75rem] uppercase tracking-[0.2em] text-accent-400">See GolfHelm</div>
          <h2
            className="mx-auto mt-[18px] max-w-[15em] text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[1.03] tracking-[-0.022em] text-text-on-accent [text-wrap:balance]"
            style={{ fontWeight: 600 }}
          >
            See GolfHelm with your program in mind.
          </h2>
          <p className="mx-auto mt-5 max-w-[34em] text-[clamp(1rem,1.4vw,1.18rem)] leading-relaxed text-[oklch(0.82_0.008_85)] [text-wrap:pretty]">
            Bring your rounds and roster. We&apos;ll show you the operating view built for college golf.
          </p>
          <div className="mt-[34px] flex flex-wrap items-center justify-center gap-5">
            <Button
              variant="primary"
              size="lg"
              onClick={onRequestDemo}
              className="rounded-full bg-primary-700 px-[30px] text-[0.9375rem] font-semibold hover:bg-primary-800 shadow-[0_2px_10px_oklch(0.35_0.08_150/0.5)]"
            >
              Request Demo
            </Button>
            <Link href="/golf/login" className="text-body font-medium text-[oklch(0.86_0.008_85)] transition-colors hover:text-text-on-accent">
              Log in
            </Link>
          </div>
        </Reveal>
      </div>

    </section>
  );
}
