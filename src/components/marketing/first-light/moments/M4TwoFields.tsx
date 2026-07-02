'use client';

/**
 * M4 · TWO FIELDS — the portal fork. docs/LANDING_ENTRY_WORLD_DESIGN.md M4.
 * Background register: diptych split — golf dawn (left) / baseball dusk
 * (right), graded to one light language, each a G2 glass card carrying an
 * enter-arrow into the real sport login (`/golf/login`, `/baseball/login`).
 *
 * SCRUB (design doc M4, "choreography map"): as the section enters view the
 * two halves slide in from opposite edges and settle at the center seam; a
 * brass hairline flashes once at the seam when they meet, then rests as a
 * faint permanent hairline. Built on `useScrollProgress` (the shared
 * full-pass window every other moment in this scaffold uses) rather than a
 * new primitive — multi-stop `useTransform` keyframes give the deceleration
 * without inventing a new easing curve (Apple scroll playbook §3i).
 *
 * Hover: the hovered field brightens, the other dims slightly (kept from
 * the foundation stub). Mobile (`< sm`): stacked portals, fully static — no
 * slide, no seam (design doc M4: "Mobile: stacked portals").
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { m, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';
import { useScrollProgress } from '../scroll/useScrollProgress';

export interface M4TwoFieldsProps {
  className?: string;
}

type FieldKey = 'golf' | 'baseball';

const FIELDS: Array<{
  key: FieldKey;
  title: string;
  line: string;
  href: string;
  fallbackGradient: string;
}> = [
  {
    key: 'golf',
    title: 'GolfHelm',
    line: 'College golf team management + the CoachHelm AI layer.',
    href: '/golf/login',
    // Dawn grade: airy cream/sage lift at the top, capping at sage-ink 0.5
    // at the bottom — DAYLIGHT amendment: M4 is not a second deep band, M3
    // owns that. Legibility for the card's cream text instead comes from a
    // tight local pocket (see the third layer below) anchored behind the
    // card only. No clay here — clay's only home is the baseball half.
    fallbackGradient:
      'linear-gradient(165deg, rgba(var(--fl-cream-high-rgb),0.3) 0%, rgba(var(--fl-sage-rgb),0.35) 45%, rgba(var(--fl-sage-ink-rgb),0.5) 100%), radial-gradient(ellipse 80% 60% at 30% 18%, rgba(var(--fl-cream-high-rgb),0.4), transparent 60%), radial-gradient(circle at 20% 82%, rgba(var(--fl-sage-ink-rgb),0.55), transparent 55%)',
  },
  {
    key: 'baseball',
    title: 'BaseballHelm',
    line: 'College baseball recruiting + team management, coach to player.',
    href: '/baseball/login',
    // Dusk grade: same airy sage/cream language as golf's, with a TRACE of
    // clay warmth folded into the mid-tone and bloom — clay's only
    // remaining home per the amendment. Capped at sage-ink 0.5 at the
    // bottom (DAYLIGHT amendment — see golf's comment above); the local
    // pocket behind the card carries legibility instead. Never structural,
    // never dominant.
    fallbackGradient:
      'linear-gradient(165deg, rgba(var(--fl-cream-high-rgb),0.28) 0%, rgba(var(--fl-clay-rgb),0.16) 42%, rgba(var(--fl-sage-ink-rgb),0.5) 100%), radial-gradient(ellipse 80% 60% at 70% 22%, rgba(var(--fl-brass-rgb),0.22), transparent 60%), radial-gradient(circle at 20% 82%, rgba(var(--fl-sage-ink-rgb),0.55), transparent 55%)',
  },
];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** `min-width: 640px` (Tailwind `sm`) — value-only (not structural) branch,
 * so a plain `useState`+effect (default `false` on server/first paint) is
 * safe the same way the reduced-motion prop-only pattern is (CONTRACTS.md
 * "Reduced-motion: two valid patterns"): it only ever changes which
 * MotionValue feeds a `style` prop, never which JSX tree renders. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 640px)');
    setIsDesktop(mql.matches);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function M4TwoFields({ className }: M4TwoFieldsProps) {
  const [hovered, setHovered] = useState<FieldKey | null>(null);
  const prefersReduced = useReducedMotion();
  const isDesktop = useIsDesktop();
  const scrubEnabled = isDesktop && !prefersReduced;

  const { ref, progress } = useScrollProgress<HTMLElement>();
  const settled = useMotionValue(1);

  // Halves slide in from the outer edges (±42% of their own width) and
  // land by ~40% of the section's full-pass window, decelerating across
  // three stops rather than one linear jump.
  const xLeftScrub = useTransform(progress, [0, 0.16, 0.3, 0.4], ['-42%', '-20%', '-5%', '0%']);
  const xRightScrub = useTransform(progress, [0, 0.16, 0.3, 0.4], ['42%', '20%', '5%', '0%']);
  const staticX = useTransform(settled, () => '0%');
  const xLeft = scrubEnabled ? xLeftScrub : staticX;
  const xRight = scrubEnabled ? xRightScrub : staticX;

  // The seam hairline: builds to a brief flash right as the halves meet
  // (~0.3–0.42), then rests at a faint permanent hairline for the remainder
  // of the scroll pass.
  const seamOpacityScrub = useTransform(progress, [0, 0.28, 0.36, 0.5, 0.65, 1], [0, 0, 1, 1, 0.16, 0.16]);
  const seamOpacityStatic = useTransform(settled, () => 0.16);
  const seamOpacity = scrubEnabled ? seamOpacityScrub : seamOpacityStatic;

  return (
    <section ref={ref} className={cn('relative', className)} style={{ backgroundColor: 'var(--fl-sage-mist)' }}>
      <div className="mx-auto max-w-6xl px-6 pb-6 pt-20 text-center sm:pt-24">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-sage-ink-rgb),0.6)]">
          One Helm. Two fields.
        </span>
      </div>
      <div className="relative grid grid-cols-1 sm:grid-cols-2">
        {/* Center seam — desktop only, the halves have nothing to meet at
            when stacked on mobile. */}
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 sm:block"
          style={{
            opacity: seamOpacity,
            background:
              'linear-gradient(180deg, transparent, rgba(var(--fl-brass-rgb),0.95) 12%, rgba(var(--fl-brass-rgb),0.95) 88%, transparent)',
          }}
        />
        {FIELDS.map((field) => {
          const dimmed = hovered !== null && hovered !== field.key;
          const x = field.key === 'golf' ? xLeft : xRight;
          return (
            <m.div
              key={field.key}
              style={{ x, willChange: scrubEnabled ? 'transform' : undefined }}
              className="relative"
            >
              <Link
                href={field.href}
                onMouseEnter={() => setHovered(field.key)}
                onMouseLeave={() => setHovered(null)}
                className="group relative flex min-h-[60vh] items-end overflow-hidden p-6 sm:min-h-[70vh] sm:p-10"
                style={{ backgroundColor: 'var(--fl-sage-ink)' }}
              >
                <m.div
                  animate={{
                    opacity: dimmed ? 0.55 : 1,
                    scale: hovered === field.key ? 1.02 : 1,
                    filter:
                      hovered === field.key
                        ? 'brightness(1.08) saturate(0.92) contrast(1.02)'
                        : 'brightness(1) saturate(0.92) contrast(1.02)',
                  }}
                  transition={{ duration: prefersReduced ? 0 : 0.4, ease: EASE }}
                  className="absolute inset-0"
                  style={photoLayerStyle({ src: `/marketing/first-light/photos/${field.key}.jpg`, fallbackGradient: field.fallbackGradient })}
                />
                {/* Directional corner light — one per photo moment (Amendment
                    2 §C.13, "the morning sun you never see"), opposite
                    corners across the diptych: golf top-left, baseball
                    top-right. Anchored to this field's own `relative` Link,
                    so each half gets its own light pocket. */}
                <div
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute -top-16 h-96 w-96 rounded-full blur-2xl',
                    field.key === 'golf' ? '-left-16' : '-right-16',
                  )}
                  style={{ background: 'radial-gradient(circle, rgba(var(--fl-sage-rgb),0.18), transparent 70%)' }}
                />
                {/* Double-bezel: a brass hairline outer frame wrapping the
                    G2 glass card, matching the design system's bezel idiom
                    elsewhere (glass grammar #4, first-light.css). */}
                <div className="relative w-full max-w-sm rounded-[1.1rem] border border-[rgba(var(--fl-brass-rgb),0.4)] p-[3px]">
                  <div
                    className="fl-glass-2 rounded-[0.9rem] p-6"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.35), var(--fl-specular), var(--fl-shadow-lg)' }}
                  >
                    <div className="relative z-10">
                      <h3 className={cn(flFraunces.className, 'text-balance text-2xl font-medium text-[var(--fl-cream)] sm:text-3xl')}>
                        {field.title}
                      </h3>
                      {/* Baseline row: brass rule segment + one-line
                          description + enter arrow, all on one line. */}
                      <div className="mt-3 flex items-center gap-3">
                        <span aria-hidden="true" className="fl-rule w-8 shrink-0" />
                        <p className="flex-1 text-pretty text-body text-[rgba(var(--fl-cream-rgb),0.7)]">{field.line}</p>
                        {/* Sage (not sage-deep) for legibility — sage-deep
                            reads as a CTA-fill color and is too low-contrast
                            as an icon over this card; sage is the spec's
                            "decorative/large" register and reads clean here
                            (verified live at 1440 + 390). */}
                        <ArrowRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-[var(--fl-sage)] transition-transform duration-200 group-hover:translate-x-[2px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </m.div>
          );
        })}
      </div>
    </section>
  );
}
