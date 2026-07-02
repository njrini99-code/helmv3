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
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { m, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';

export interface M8FinalCTAProps {
  className?: string;
}

/** `pointer: fine` (a real mouse/trackpad) — value-only branch (same safe
 * pattern as M4's `useIsDesktop`): it only ever changes whether the magnetic
 * transform is applied to the primary CTA, never which JSX tree renders, so
 * a `false` default on server/first paint is safe. Amendment 2 §B.9: the
 * magnetic pull is desktop pointer-fine only, dead under reduced-motion. */
function usePointerFine(): boolean {
  const [pointerFine, setPointerFine] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(pointer: fine)');
    setPointerFine(mql.matches);
    const onChange = () => setPointerFine(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return pointerFine;
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
  const pointerFine = usePointerFine();
  const magneticEnabled = pointerFine && !prefersReduced;

  // Magnetic cursor-follow (Amendment 2 §B.9, research §5.2): translate
  // toward the cursor at ×0.25 strength, spring back on leave. Springed
  // (not a raw MotionValue) so the return has the "mass" the recipe wants.
  const magX = useMotionValue(0);
  const magY = useMotionValue(0);
  const magSpringX = useSpring(magX, { stiffness: 300, damping: 22, mass: 0.5 });
  const magSpringY = useSpring(magY, { stiffness: 300, damping: 22, mass: 0.5 });

  function handleCtaMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!magneticEnabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    magX.set((e.clientX - (rect.left + rect.width / 2)) * 0.25);
    magY.set((e.clientY - (rect.top + rect.height / 2)) * 0.25);
  }
  function handleCtaMouseLeave() {
    magX.set(0);
    magY.set(0);
  }

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
              border: '1px solid rgba(var(--fl-brass-rgb), 0.5)',
              // Double-bezel inner edge gains the specular lip (Amendment 2
              // §B.6/§B.9's card-craft rule applied to this frame's own
              // elevated surface), layered over the frame's existing brass
              // border (a `border`, not `box-shadow`, so no stacking
              // conflict with the inline box-shadow below).
              boxShadow: 'var(--fl-specular)',
            }}
          >
            {/* Dedicated photo layer — kept separate from the content div
                below so the anti-stock grade (saturate/contrast, Amendment 2
                §C.11) filters only the photograph, never the text sitting
                on top of it (CSS `filter` rasterizes an element's whole
                subtree, so it must live on its own layer). */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                ...photoLayerStyle({ src: '/marketing/first-light/photos/mist.jpg', fallbackGradient: MIST_FALLBACK_GRADIENT }),
                filter: 'saturate(0.92) contrast(1.02)',
              }}
            />
            {/* Directional corner light — one per photo moment (Amendment 2
                §C.13), off-center, opposite the M4 baseball half's light so
                the two aren't mirrored back-to-back down the page. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-96 w-96 rounded-full blur-2xl"
              style={{ background: 'radial-gradient(circle, rgba(var(--fl-sage-rgb),0.18), transparent 70%)' }}
            />
            <m.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={{ duration: prefersReduced ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 mx-auto max-w-2xl px-6 py-24 text-center sm:px-10 sm:py-32"
            >
              <h2 className={cn(flFraunces.className, 'text-balance text-[clamp(2rem,4vw,3rem)] font-normal leading-[1.1] text-[var(--fl-cream)]')}>
                See your program, seen clearly.
              </h2>
              <p className="mt-4 text-pretty text-body-lg text-[rgba(var(--fl-cream-rgb),0.7)]">
                A short walkthrough for coaches. An invite code for players.
              </p>

              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                {/* Coach CTA — sage-deep fill + cream text (kelly is
                    product-only, never landing chrome). Button-in-button
                    (Amendment 2 §B.8): trailing arrow lives in its own
                    circle that translates diagonally on hover. `.fl-cta-glow`
                    (§A.3/§B.8) + magnetic cursor-follow (§B.9) — one of the
                    page's ≤2 sage glows. Magnetic transform only applied
                    when enabled so the plain `hover:-translate-y-0.5` CSS
                    lift still works for touch/reduced-motion visitors (an
                    inline motion-value transform would otherwise always win
                    over that class). */}
                <m.a
                  href={DEMO_CALENDAR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseMove={handleCtaMouseMove}
                  onMouseLeave={handleCtaMouseLeave}
                  style={magneticEnabled ? { x: magSpringX, y: magSpringY } : undefined}
                  className="fl-cta-glow group relative inline-flex items-center gap-2 rounded-full bg-[var(--fl-sage-deep)] px-7 py-3.5 text-sm font-semibold text-[var(--fl-cream)] shadow-[0_10px_25px_-5px_rgba(var(--fl-sage-ink-rgb),0.4)] transition-[transform,box-shadow,filter] duration-[240ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
                >
                  See it in action
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[rgba(var(--fl-cream-high-rgb),0.15)] transition-transform duration-[240ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="sr-only">(opens the booking calendar in a new tab)</span>
                </m.a>
                {/* Player CTA — ghost pill, press physics + specular (no
                    glow — the ≤2-glow budget is spent on the primary CTA +
                    M1's, per Amendment 2 §E). Specular adds the cream-high
                    lip on top of the shared `.fl-glass-1` brass edge-light,
                    which the inline box-shadow below must restate since it
                    fully replaces (not appends to) the class's box-shadow. */}
                <Link
                  href="/join"
                  style={{ boxShadow: 'inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.35), var(--fl-specular)' }}
                  className="fl-glass-1 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium text-[var(--fl-cream)] transition-transform duration-[240ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 active:scale-[0.98]"
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
