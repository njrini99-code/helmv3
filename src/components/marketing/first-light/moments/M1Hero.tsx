'use client';

/**
 * M1 · HERO — full-bleed dawn-field photo cinema + G1 glass nav pill.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M1. Background register: photo-dark
 * with a pine/ecru graded gradient layered over it (doubles as the fallback
 * when `public/marketing/first-light/photos/hero.jpg` isn't shipped yet —
 * see CONTRACTS.md "Photo asset contract"; `photoLayerStyle` paints the
 * gradient ON TOP of the photo URL layer per CSS background-image stacking,
 * so it's a permanent grade whenever the photo loads AND the on-brand
 * fallback whenever it 404s).
 *
 * Motion — near-still at rest: a slow 1.02→1.06 scale drift on the photo
 * (the drift itself is driven by the M1→M2 exit scrub below, so "at rest"
 * reads as scale 1), grain, a staggered mount reveal on the
 * eyebrow/headline/subhead/CTAs.
 *
 * M1→M2 EXIT SCRUB (docs/LANDING_ENTRY_WORLD_DESIGN.md "scroll choreography
 * map"): as the section scrolls out from under the viewport, the photo
 * scales to 1.06 and darkens under a pine wash while the headline stack
 * lifts and dissolves — one continuous camera move, driven by
 * `useScrollProgress`'s `['start start', 'end start']` window (0 while the
 * hero is pinned to the top of the viewport, 1 once it's fully scrolled
 * past). Transform/opacity only. Disabled — final "at rest" frame held
 * static — under `prefers-reduced-motion` and coarse-pointer/touch, per the
 * lane brief ("Static on mobile/reduced-motion"), matching `LenisRoot`'s
 * own disablement heuristic.
 */
import Link from 'next/link';
import { m, useTransform, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useScrollProgress } from '../scroll/useScrollProgress';
import { MaskedReveal } from '../scroll/MaskedReveal';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';
import { GlassNav } from '../nav/GlassNav';

export interface M1HeroProps {
  className?: string;
}

/** House cinematic-settle curve — see CONTRACTS.md "Motion discipline". */
const EASE_GLIDE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const HERO_FALLBACK_GRADIENT =
  'linear-gradient(165deg, rgba(20,53,39,0.4) 0%, rgba(20,53,39,0.82) 58%, rgba(8,20,15,0.96) 100%), radial-gradient(ellipse 85% 55% at 26% 10%, rgba(245,241,230,0.16), transparent 62%), radial-gradient(ellipse 60% 40% at 76% 6%, rgba(176,141,87,0.14), transparent 60%)';

export function M1Hero({ className }: M1HeroProps) {
  const { ref, progress } = useScrollProgress<HTMLElement>({
    offset: ['start start', 'end start'],
  });
  const reducedMotion = useReducedMotion();
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const scrubDisabled = Boolean(reducedMotion) || coarsePointer;

  // One continuous camera move: photo scales + darkens while the headline
  // stack lifts + dissolves, all keyed off the same scroll progress.
  const photoScale = useTransform(progress, [0, 1], [1, 1.06]);
  const darkenOpacity = useTransform(progress, [0, 1], [0, 0.55]);
  const contentOpacity = useTransform(progress, [0, 0.65], [1, 0]);
  const contentY = useTransform(progress, [0, 1], [0, -56]);

  return (
    <section
      ref={ref}
      className={cn('relative min-h-[100svh] min-h-dvh overflow-hidden', className)}
      style={{ backgroundColor: 'var(--fl-pine)' }}
    >
      {/* Background register — graded photo over a pine/ecru gradient. */}
      <m.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          ...photoLayerStyle({ src: '/marketing/first-light/photos/hero.jpg', fallbackGradient: HERO_FALLBACK_GRADIENT }),
          scale: scrubDisabled ? 1 : photoScale,
        }}
      />
      {/* Exit-scrub darken wash — pine, ramps in as the section scrolls out. */}
      <m.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--fl-pine)', opacity: scrubDisabled ? 0 : darkenOpacity }}
      />
      <div className="fl-grain" aria-hidden="true" />

      {/* G1 glass nav pill — detached, floating, centered. */}
      <div className="relative z-30 flex justify-center px-4 pt-6 sm:px-6">
        <GlassNav />
      </div>

      {/* Main content — lifts + dissolves on exit scrub. */}
      <m.div
        style={{
          opacity: scrubDisabled ? 1 : contentOpacity,
          y: scrubDisabled ? 0 : contentY,
        }}
        className="relative z-20 mx-auto flex min-h-[calc(100svh-88px)] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-8"
      >
        <m.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, ease: EASE_GLIDE }}
          className="mb-6 flex items-center gap-3"
        >
          <span className="h-px w-8 bg-[rgba(var(--fl-brass-rgb),0.7)]" />
          <span className="text-eyebrow font-annual font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-ecru-rgb),0.6)]">
            Helm Sports Labs
          </span>
          <span className="h-px w-8 bg-[rgba(var(--fl-brass-rgb),0.7)]" />
        </m.div>

        <MaskedReveal
          as="h1"
          lines={[
            'The program,',
            <span key="seen" className="text-[var(--fl-green)]">
              seen clearly.
            </span>,
          ]}
          className={cn(
            flFraunces.className,
            'text-[clamp(2.75rem,6vw,5.25rem)] font-normal leading-[0.98] tracking-tight text-[var(--fl-ecru)]',
          )}
        />

        <m.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, delay: 0.35, ease: EASE_GLIDE }}
          className="mt-6 max-w-lg text-body-lg leading-relaxed text-[rgba(var(--fl-ecru-rgb),0.7)]"
        >
          One Helm. Two fields. Roster, schedule, stats, and an AI that reads the game with you.
        </m.p>

        <m.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, delay: 0.5, ease: EASE_GLIDE }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Link
            href="#cta"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--fl-green)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-primary-500 active:translate-y-0"
          >
            See it in action
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="#cta"
            className="fl-glass-1 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-[var(--fl-ecru)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="relative z-10">Join your team</span>
          </Link>
        </m.div>
      </m.div>
    </section>
  );
}
