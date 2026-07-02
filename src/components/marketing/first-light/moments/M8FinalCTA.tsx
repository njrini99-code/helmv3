'use client';

/**
 * M8 · FINAL CTA — full-bleed misty photo inset.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M8. Centered serif ask + the dual CTA
 * pair again: demo path = "See it in action" (`/golf/demo`); player path =
 * invite-code entry (`/golf/join`). Real handlers, no dead buttons.
 */
import Link from 'next/link';
import { m } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';

export interface M8FinalCTAProps {
  className?: string;
}

const MIST_FALLBACK_GRADIENT =
  'linear-gradient(180deg, rgba(20,53,39,0.72) 0%, rgba(20,53,39,0.9) 100%), radial-gradient(ellipse 70% 50% at 50% 30%, rgba(245,241,230,0.14), transparent 65%)';

export function M8FinalCTA({ className }: M8FinalCTAProps) {
  return (
    <section
      className={cn('relative overflow-hidden px-6 py-28 sm:py-36', className)}
      style={photoLayerStyle({ src: '/marketing/first-light/photos/mist.jpg', fallbackGradient: MIST_FALLBACK_GRADIENT })}
    >
      <div className="fl-grain" aria-hidden="true" />
      <m.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-15%' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto max-w-2xl text-center"
      >
        <h2 className={cn(flFraunces.className, 'text-[clamp(2rem,4vw,3rem)] font-normal leading-[1.1] text-[var(--fl-ecru)]')}>
          See your program, seen clearly.
        </h2>
        <p className="mt-4 text-body-lg text-[rgba(var(--fl-ecru-rgb),0.7)]">
          A short walkthrough for coaches. An invite code for players.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/golf/demo"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--fl-green)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-primary-500 active:translate-y-0"
          >
            See it in action
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/golf/join"
            className="fl-glass-1 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-[var(--fl-ecru)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="relative z-10">Join your team</span>
          </Link>
        </div>
      </m.div>
    </section>
  );
}
