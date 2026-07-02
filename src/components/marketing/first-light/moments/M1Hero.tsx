'use client';

/**
 * M1 · HERO — full-bleed morning-field photo cinema + G1 glass nav pill.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M1, built under the ⚠ SAGE & CREAM
 * AMENDMENT at the top of that doc (Nick, 2026-07-02) — see CONTRACTS.md
 * "Palette v2 — SAGE & CREAM". Background register: a graded photo (or,
 * absent the real asset, an on-brand sage→cream gradient fallback — see
 * CONTRACTS.md "Photo asset contract") with a permanent grade overlay:
 * shadows lean sage-ink, a soft cream bloom lifts the sky/nav zone,
 * and a moderate sage-ink vignette sits behind the centered content stack
 * for legibility. `photoLayerStyle` stacks that grade ON TOP of the photo
 * `url(...)` layer (CSS background-image layers paint first-listed-on-top),
 * so it doubles as the on-brand fallback whenever the photo 404s.
 *
 * Motion — near-still at rest: a slow, independent 1→1.02 ambient
 * "breathing" scale drift on the photo (Ken-Burns, always looping while
 * the hero is idle), grain, a staggered mount reveal on the
 * eyebrow → headline → subhead → CTAs.
 *
 * M1→M2 EXIT SCRUB (docs/LANDING_ENTRY_WORLD_DESIGN.md "scroll choreography
 * map", brightened per the amendment): as the section scrolls out from
 * under the viewport, the photo scales further to 1.06 while a cream wash
 * ramps in over it — the frame BRIGHTENS toward M2's own cream field
 * rather than darkening — as the headline stack lifts and dissolves. One
 * continuous camera move, driven by `useScrollProgress`'s
 * `['start start', 'end start']` window (0 while the hero is pinned to the
 * top of the viewport, 1 once it's fully scrolled past). Transform/opacity
 * only. Both the ambient drift and the exit scrub are disabled — final "at
 * rest" frame held static — under `prefers-reduced-motion` and
 * coarse-pointer/touch, per the lane brief ("Static on mobile/reduced-
 * motion"), matching `LenisRoot`'s own disablement heuristic.
 */
import Link from 'next/link';
import Image from 'next/image';
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

/**
 * Quiet two-sport chip row (⚠ A-OVERRIDE, Amendment 3 §2, Nick 2026-07-02
 * 18:00: "doesn't give sports on landing"). Two small `fl-glass-1` pills
 * under the CTA pair, both pointing at `#fields` — the M4 "Two Fields"
 * section anchor (the `landing-portals+cta` lane adds `id="fields"` to
 * that section; this lane only needs the hash, not the target file).
 *
 * The marks are the REAL product logos (Nick, second pass: "Golfhelm
 * and baseballhelm logos aren't on there") — kelly helm wheels with
 * the golf ball / baseball hub, clean-alpha PNGs. Real logos keep
 * their kelly per the ⚠ A-OVERRIDE logo exemption; the abstract
 * `SportGlyph` line icons were the placeholder these replace.
 */
const SPORT_CHIPS = [
  { sport: 'golf', label: 'GolfHelm', logo: '/helm-golf-logo-transparent.png' },
  { sport: 'baseball', label: 'BaseballHelm', logo: '/helm-baseball-logo-cropped.png' },
] as const;

/**
 * The permanent sage→cream grade, painted ON TOP of the photo (or, if the
 * photo is missing, standing alone as the fallback — see file header).
 * Three stacked layers, first-listed = topmost:
 *  1. A TIGHT sage-ink legibility pocket behind the content stack (~62%
 *     down) for cream-text contrast — tapers to nothing by ~60% of its own
 *     radius, so most of the frame stays bright (kept deliberately small;
 *     an early wider pass read as a flat, uniform grey-green wash across
 *     the whole photo — off-spec "murky", not "airy morning").
 *  2. A cream bloom spilling down from just above the frame (the morning
 *     sun you never see directly, per the entry-scenes family rule),
 *     pulled in and dimmed so it warms the nav zone only — it no longer
 *     bleaches the whole upper half. Cream, not cream-high (⚠ AMENDMENT 2
 *     §D2, 2026-07-02 — a fill this large can't read near-white).
 *  3. A full-bleed sage-mist → cream base wash at HALF its original
 *     opacity — it should warm the photo, not blanket it; the earlier
 *     full-strength pass compounded with layers 1-2 into uniform fog that
 *     buried the real photo underneath (pixel-review 2026-07-02 hard
 *     fail). Still reads as a complete, airy, on-brand frame with zero
 *     blank edges when the photo is missing.
 */
const HERO_GRADE = [
  'radial-gradient(ellipse 50% 34% at 50% 62%, rgba(var(--fl-sage-ink-rgb),0.45) 0%, rgba(var(--fl-sage-ink-rgb),0.18) 38%, rgba(var(--fl-sage-ink-rgb),0) 60%)',
  'radial-gradient(ellipse 62% 38% at 50% -8%, rgba(var(--fl-cream-rgb),0.4) 0%, rgba(var(--fl-cream-rgb),0.14) 40%, rgba(var(--fl-cream-rgb),0) 62%)',
  'linear-gradient(165deg, rgba(var(--fl-sage-mist-rgb),0.45) 0%, rgba(var(--fl-cream-rgb),0.48) 100%)',
].join(', ');

export function M1Hero({ className }: M1HeroProps) {
  const { ref, progress } = useScrollProgress<HTMLElement>({
    offset: ['start start', 'end start'],
  });
  const reducedMotion = useReducedMotion();
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  const scrubDisabled = Boolean(reducedMotion) || coarsePointer;

  // One continuous camera move: photo scales + brightens toward cream
  // while the headline stack lifts + dissolves, all keyed off the same
  // scroll progress.
  const photoScale = useTransform(progress, [0, 1], [1, 1.06]);
  const brightenOpacity = useTransform(progress, [0, 1], [0, 0.94]);
  const contentOpacity = useTransform(progress, [0, 0.65], [1, 0]);
  const contentY = useTransform(progress, [0, 1], [0, -56]);

  return (
    <section
      ref={ref}
      className={cn('relative min-h-[100svh] min-h-dvh overflow-hidden', className)}
      style={{ backgroundColor: 'var(--fl-sage-mist)' }}
    >
      {/* Background register — ambient Ken-Burns wrapper (outer) holding
          the scroll-linked exit-scrub scale (inner) + the graded photo. */}
      <m.div
        aria-hidden="true"
        className="absolute inset-0"
        animate={scrubDisabled ? undefined : { scale: [1, 1.02, 1] }}
        transition={scrubDisabled ? undefined : { duration: 20, repeat: Infinity, ease: EASE_GLIDE }}
      >
        <m.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            ...photoLayerStyle({ src: '/marketing/first-light/photos/hero.jpg', fallbackGradient: HERO_GRADE }),
            scale: scrubDisabled ? 1 : photoScale,
            filter: 'saturate(0.92) contrast(1.02)',
          }}
        />
      </m.div>
      {/* Directional corner light (Amendment 2 §C.13, research §1.4) — the
          "morning sun you never see," top-left, partially off-canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full blur-2xl"
        style={{ background: 'radial-gradient(circle, rgba(var(--fl-sage-rgb),0.18), transparent 70%)' }}
      />
      {/* Static bottom dissolve veil (Amendment 2 §C.12) — hands M1 into
          M2's cream field with no hard seam at rest; the scroll-linked
          brighten wash below layers on top of this at exit. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[14%]"
        style={{ backgroundImage: 'linear-gradient(to top, var(--fl-cream), transparent)' }}
      />
      {/* Exit-scrub brighten wash — cream, ramps in as the section scrolls
          out, bleaching the frame toward M2's own cream field. */}
      <m.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--fl-cream)', opacity: scrubDisabled ? 0 : brightenOpacity }}
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
          <span className="text-eyebrow font-annual font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-cream-rgb),0.62)]">
            Helm Sports Labs
          </span>
          <span className="h-px w-8 bg-[rgba(var(--fl-brass-rgb),0.7)]" />
        </m.div>

        <MaskedReveal
          as="h1"
          delay={0.15}
          lines={[
            'The program,',
            <span key="seen" className="font-bold">
              seen clearly.
            </span>,
          ]}
          className={cn(
            flFraunces.className,
            'text-balance text-[clamp(2.75rem,6vw,5.25rem)] font-normal leading-[0.98] tracking-tight text-[var(--fl-cream)]',
          )}
        />

        <m.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, delay: 0.35, ease: EASE_GLIDE }}
          className="mt-6 max-w-lg text-pretty text-body-lg leading-relaxed text-[rgba(var(--fl-cream-rgb),0.75)]"
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
            className="fl-cta-glow group inline-flex items-center gap-2 rounded-full bg-[var(--fl-sage-deep)] px-7 py-3.5 text-sm font-semibold text-[var(--fl-cream-high)] shadow-[0_16px_32px_-14px_rgba(var(--fl-sage-ink-rgb),0.55)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--fl-sage-ink)] active:translate-y-0 active:scale-[0.98]"
          >
            See it in action
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[rgba(var(--fl-cream-high-rgb),0.15)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          <Link
            href="#cta"
            style={{
              backgroundColor: 'rgba(var(--fl-cream-rgb), 0.86)',
              boxShadow: 'var(--fl-specular), inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.35)',
            }}
            className="fl-glass-1 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-[var(--fl-sage-ink)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="relative z-10">Join your team</span>
          </Link>
        </m.div>

        <m.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, delay: 0.65, ease: EASE_GLIDE }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2.5"
        >
          {SPORT_CHIPS.map((chip) => (
            <Link
              key={chip.sport}
              href="#fields"
              style={{
                backgroundColor: 'rgba(var(--fl-cream-rgb), 0.86)',
                boxShadow: 'var(--fl-specular), inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.3)',
              }}
              className="fl-glass-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--fl-sage-ink)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Image
                src={chip.logo}
                alt=""
                width={16}
                height={16}
                className="relative z-10 h-4 w-4 shrink-0 object-contain"
              />
              <span className="relative z-10">{chip.label}</span>
            </Link>
          ))}
        </m.div>
      </m.div>
    </section>
  );
}
