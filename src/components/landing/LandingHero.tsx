'use client';

import Image from 'next/image';
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { scrollToHash } from './LandingHeader';

/**
 * Hero — sunlit champagne canvas, sans display type, no dashboard. A graded
 * full-bleed course-photo plane with a floating warm-glass stat card.
 * Entrance rides the landing-hero-* CSS keyframes (reduced-motion-safe).
 */

interface LandingHeroProps {
  onRequestDemo: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function LandingHero({ onRequestDemo }: LandingHeroProps) {
  return (
    <section className="relative overflow-clip">
      {/* Sunlit glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[14%] -right-[8%] h-[52vw] max-h-[760px] w-[52vw] max-w-[760px] rounded-full blur-[10px]"
        style={{ background: 'radial-gradient(circle at 50% 50%, oklch(0.9 0.07 120 / 0.28), transparent 62%)' }}
      />
      <div
        className="mx-auto grid max-w-[1320px] items-center gap-[clamp(32px,5vw,72px)] px-[clamp(20px,4vw,64px)] pt-[clamp(40px,7vw,96px)] pb-[clamp(56px,7vw,110px)]"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}
      >
        <div className="max-w-[600px]">
          <h1
            className="landing-hero-up text-[clamp(3rem,6.6vw,6rem)] leading-[0.98] tracking-[-0.028em] text-text-primary [text-wrap:balance]"
            style={{ animationDelay: '0.1s', animationDuration: '0.62s', fontWeight: 640 }}
          >
            Command every angle of your program.
          </h1>
          <p
            className="landing-hero-up mt-[30px] max-w-[32em] text-[clamp(1.06rem,1.5vw,1.32rem)] leading-normal text-text-secondary [text-wrap:pretty]"
            style={{ animationDelay: '0.3s' }}
          >
            The operating system for college golf — where every round, shot, and stat resolves into your next coaching decision.
          </p>
          <div
            className="landing-hero-up mt-[34px] flex flex-wrap items-center gap-[22px]"
            style={{ animationDelay: '0.4s' }}
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
              <Image src="/helm-golf-logo-transparent.png" alt="" width={21} height={21} className="h-[21px] w-[21px]" />
              Explore GolfHelm
              <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </a>
          </div>
        </div>

        <div className="landing-hero-img relative mr-[calc(-1*clamp(20px,4vw,64px))]">
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
