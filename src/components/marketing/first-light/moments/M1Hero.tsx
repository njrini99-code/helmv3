'use client';

/**
 * M1 · HERO — full-bleed dawn-field photo cinema + G1 glass nav pill.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M1. Background register: photo-dark
 * with a deep-pine gradient fallback layer underneath (graceful when
 * `public/marketing/first-light/photos/hero.jpg` isn't shipped yet — see
 * CONTRACTS.md "Photo asset contract").
 *
 * Motion: near-still — a slow 1.02 scale drift on the photo layer, grain,
 * a staggered mount reveal on the headline/CTAs. No parallax circus.
 * `prefers-reduced-motion` → the scale drift freezes; reveals render in
 * their final state (framer-motion's own reduced-motion path, used
 * throughout this file via `whileInView`/mount variants).
 */
import Link from 'next/link';
import { m, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScrollProgress } from '../scroll/useScrollProgress';
import { MaskedReveal } from '../scroll/MaskedReveal';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';

export interface M1HeroProps {
  className?: string;
}

const HERO_FALLBACK_GRADIENT =
  'linear-gradient(160deg, rgba(20,53,39,0.55) 0%, rgba(20,53,39,0.88) 55%, rgba(10,26,19,0.97) 100%), radial-gradient(ellipse 90% 60% at 30% 15%, rgba(176,141,87,0.14), transparent 60%)';

export function M1Hero({ className }: M1HeroProps) {
  const { ref, progress } = useScrollProgress<HTMLElement>({
    offset: ['start start', 'end start'],
  });
  const photoScale = useTransform(progress, [0, 1], [1, 1.02]);
  const contentOpacity = useTransform(progress, [0, 0.7], [1, 0.2]);

  return (
    <section
      ref={ref}
      className={cn(
        'relative min-h-[100svh] min-h-dvh overflow-hidden',
        className,
      )}
      style={{ backgroundColor: 'var(--fl-pine)' }}
    >
      {/* Background register — graded photo over a pine gradient fallback */}
      <m.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ ...photoLayerStyle({ src: '/marketing/first-light/photos/hero.jpg', fallbackGradient: HERO_FALLBACK_GRADIENT }), scale: photoScale }}
      />
      <div className="fl-grain" aria-hidden="true" />

      {/* G1 glass nav pill — Products/Log-in collapse below `sm` so the
          390px layout stays a calm brand + single-CTA row instead of
          wrapping/overflowing (design bar: "mobile 390px => calm static
          layout that still reads perfectly"). */}
      <div className="relative z-30 pt-4 sm:pt-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--fl-ecru)]">
            Helm Sports Labs
          </Link>
          <nav
            className="fl-glass-1 flex items-center gap-1 rounded-full px-1.5 py-1.5"
            aria-label="Primary"
          >
            <span className="relative z-10 flex items-center gap-1">
              <Link
                href="/products"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-[rgba(var(--fl-ecru-rgb),0.85)] transition-colors duration-200 hover:bg-[rgba(var(--fl-ecru-rgb),0.12)] hover:text-[var(--fl-ecru)] sm:inline-flex"
              >
                Products
              </Link>
              <Link
                href="/golf/login"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-[rgba(var(--fl-ecru-rgb),0.85)] transition-colors duration-200 hover:bg-[rgba(var(--fl-ecru-rgb),0.12)] hover:text-[var(--fl-ecru)] sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                href="/golf/demo"
                className="rounded-full bg-[var(--fl-green)] px-4 py-2 text-sm font-semibold text-white transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-primary-500 active:translate-y-0"
              >
                See it in action
              </Link>
            </span>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <m.div
        style={{ opacity: contentOpacity }}
        className="relative z-20 mx-auto flex min-h-[calc(100svh-88px)] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-10 text-center sm:px-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <span className="h-px w-8 bg-[rgba(var(--fl-brass-rgb),0.7)]" />
          <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-ecru-rgb),0.6)]">
            Helm Sports Labs
          </span>
          <span className="h-px w-8 bg-[rgba(var(--fl-brass-rgb),0.7)]" />
        </div>

        <MaskedReveal
          as="h1"
          lines={[
            'The program,',
            <span key="seen" className="text-[var(--fl-green)]">
              seen clearly.
            </span>,
          ]}
          className={cn(flFraunces.className, 'text-[clamp(2.75rem,6vw,5.25rem)] font-normal leading-[0.98] tracking-tight text-[var(--fl-ecru)]')}
        />

        <m.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-lg text-body-lg leading-relaxed text-[rgba(var(--fl-ecru-rgb),0.7)]"
        >
          One Helm. Two fields. Roster, schedule, stats, and an AI that reads the game with you.
        </m.p>

        <m.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
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
        </m.div>
      </m.div>
    </section>
  );
}
