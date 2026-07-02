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
import { ArrowUpRight } from 'lucide-react';
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
    fallbackGradient:
      'linear-gradient(150deg, rgba(20,53,39,0.35) 0%, rgba(20,53,39,0.82) 100%), radial-gradient(ellipse 80% 60% at 30% 20%, rgba(245,241,230,0.18), transparent 60%)',
  },
  {
    key: 'baseball',
    title: 'BaseballHelm',
    line: 'College baseball recruiting + team management, coach to player.',
    href: '/baseball/login',
    fallbackGradient:
      'linear-gradient(150deg, rgba(176,112,60,0.28) 0%, rgba(20,53,39,0.86) 100%), radial-gradient(ellipse 80% 60% at 70% 25%, rgba(176,141,87,0.16), transparent 60%)',
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
    <section ref={ref} className={cn('relative', className)} style={{ backgroundColor: 'var(--fl-pine)' }}>
      <div className="mx-auto max-w-6xl px-6 pb-6 pt-20 text-center sm:pt-24">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-ecru-rgb),0.5)]">
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
                style={{ backgroundColor: 'var(--fl-pine)' }}
              >
                <m.div
                  animate={{ opacity: dimmed ? 0.55 : 1, scale: hovered === field.key ? 1.02 : 1 }}
                  transition={{ duration: prefersReduced ? 0 : 0.4, ease: EASE }}
                  className="absolute inset-0"
                  style={photoLayerStyle({ src: `/marketing/first-light/photos/${field.key}.jpg`, fallbackGradient: field.fallbackGradient })}
                />
                <div className="fl-glass-2 relative w-full max-w-sm rounded-2xl p-6">
                  <div className="relative z-10">
                    <h3 className={cn(flFraunces.className, 'text-2xl font-medium text-[var(--fl-ecru)] sm:text-3xl')}>
                      {field.title}
                    </h3>
                    <p className="mt-2 text-body text-[rgba(var(--fl-ecru-rgb),0.7)]">{field.line}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--fl-green)]">
                      Enter
                      <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
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
