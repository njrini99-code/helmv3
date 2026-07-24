'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Reveal } from './motion';

/**
 * Final CTA — warm-dark #0C0A09 field with concentric hairline rings.
 * (Footer lives in LandingFooter, shared via MarketingShell.)
 */

interface FinalCTASectionProps {
  onRequestDemo: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function FinalCTASection({ onRequestDemo }: FinalCTASectionProps) {
  return (
    <section className="bg-stone-950 text-text-on-accent">
      <div className="relative mx-auto max-w-[1320px] overflow-clip px-[clamp(20px,4vw,64px)] py-[clamp(90px,12vw,170px)] text-center">
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 aspect-square w-[min(560px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[oklch(1_0_0/0.06)]"
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 aspect-square w-[min(360px,60vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[oklch(1_0_0/0.08)]"
        />
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
