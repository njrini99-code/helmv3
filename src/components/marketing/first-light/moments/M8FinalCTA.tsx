'use client';

/**
 * M8 · FINAL CTA — full-bleed misty photo, inset in a double-bezel frame.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M8. Centered serif ask + the dual CTA
 * pair, each with a REAL, distinct handler:
 *   - Coach — "See it in action" opens the live calendar booking link in a
 *     new tab (flagged for Nick's confirmation — see PR body).
 *   - Player — "Join your team" goes to the new sport-agnostic `/join`
 *     invite-code entry page.
 * `id="cta"` so other moments/nav can deep-link here.
 */
import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';

export interface M8FinalCTAProps {
  className?: string;
}

/**
 * Live scheduling link for "See it in action." Flagged in the PR body per
 * lane instructions — Nick should confirm this is the calendar he wants
 * coach demo requests landing on before this ships to production.
 */
const DEMO_CALENDAR_URL = 'https://calendar.app.google/s9DBb3bKD2teLLBT7';

// Misty morning grade: airy cream/sage haze, only grounding toward sage-ink
// at the base where the ask sits — "airy morning, never murky" per the
// sage & cream amendment. Never the old pine/black duotone.
const MIST_FALLBACK_GRADIENT =
  'linear-gradient(180deg, rgba(var(--fl-cream-high-rgb),0.32) 0%, rgba(var(--fl-sage-rgb),0.4) 48%, rgba(var(--fl-sage-ink-rgb),0.7) 100%), radial-gradient(ellipse 70% 50% at 50% 28%, rgba(var(--fl-cream-high-rgb),0.32), transparent 65%)';

export function M8FinalCTA({ className }: M8FinalCTAProps) {
  const prefersReduced = useReducedMotion();
  return (
    <section
      id="cta"
      className={cn('relative overflow-hidden px-4 py-24 sm:px-8 sm:py-32', className)}
      style={{ backgroundColor: 'var(--fl-sage-ink)' }}
    >
      {/* Double-bezel frame — outer brass mat, inner brass frame, the misty
          photo inset within (not full-bleed to the section edges — the
          section itself is the full-bleed sage-ink field the frame floats
          on). */}
      <div className="relative mx-auto max-w-5xl">
        <div
          className="rounded-3xl p-2 sm:p-3"
          style={{ border: '1px solid rgba(var(--fl-brass-rgb), 0.32)', backgroundColor: 'rgba(0,0,0,0.14)' }}
        >
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              ...photoLayerStyle({ src: '/marketing/first-light/photos/mist.jpg', fallbackGradient: MIST_FALLBACK_GRADIENT }),
              border: '1px solid rgba(var(--fl-brass-rgb), 0.5)',
            }}
          >
            <m.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={{ duration: prefersReduced ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 mx-auto max-w-2xl px-6 py-24 text-center sm:px-10 sm:py-32"
            >
              <h2 className={cn(flFraunces.className, 'text-[clamp(2rem,4vw,3rem)] font-normal leading-[1.1] text-[var(--fl-cream)]')}>
                See your program, seen clearly.
              </h2>
              <p className="mt-4 text-body-lg text-[rgba(var(--fl-cream-rgb),0.7)]">
                A short walkthrough for coaches. An invite code for players.
              </p>

              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                {/* Coach CTA — sage-deep fill + cream text (kelly is
                    product-only, never landing chrome). Hover brightens
                    rather than swapping to a saturated green. */}
                <a
                  href={DEMO_CALENDAR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full bg-[var(--fl-sage-deep)] px-7 py-3.5 text-sm font-semibold text-[var(--fl-cream)] shadow-[0_10px_25px_-5px_rgba(var(--fl-sage-ink-rgb),0.4)] transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
                >
                  See it in action
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  <span className="sr-only">(opens the booking calendar in a new tab)</span>
                </a>
                <Link
                  href="/join"
                  className="fl-glass-1 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-[var(--fl-cream)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <span className="relative z-10 inline-flex items-center gap-2">
                    Join your team
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}
