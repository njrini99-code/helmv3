'use client';

/**
 * M5 · THE INTELLIGENCE — CoachHelm/signals showcase.
 * docs/LANDING_ENTRY_WORLD_DESIGN.md M5, SAGE & CREAM amendment, ⚠
 * AMENDMENT 2 — IMMACULATE, ⚠ AMENDMENT 3 — BRAND & ARCHITECTURE §D.4.
 * Background register: cream → sage-mist → sage, deepening toward
 * sage-ink ONLY at the band's very far edge — the section must still
 * read light (daylight mood; never murky).
 *
 * Amendment 3 §D.4 goes off-axis: the signal card moves into a
 * right-of-center column (`md:grid-cols-[0.9fr_1.1fr]`, the card's column
 * is ~55% of the row) and the line that used to be a centered heading —
 * "No signal ships without its source." — becomes a large serif
 * margin-note anchored in the LEFT column instead, paired with a
 * `HelmRosette` eyebrow (§A.2). The margin note sits at the top of its
 * column (`md:items-start`), which keeps it inside the band's
 * cream/sage-mist zone (the gradient's light ~0–45% range) regardless of
 * how tall the card renders — sage-ink holds the doc's ≈10:1 contrast
 * floor there; this is a deliberate placement choice, not an accident of
 * layout, so don't switch this row to `items-center` without re-checking
 * contrast against whatever the card's height has grown to by then.
 *
 * The card's replica interior (icon well, top rule, badge, drift number,
 * source/limitation, confidence bar) is UNCHANGED from the previous
 * centered layout — only its outer wrapper moved into the new grid
 * column. See that block's own comments for the interior's design intent
 * (confidenceColor() echo, specular/hairline composition, etc).
 *
 * ⚠ AMENDMENT 2 — IMMACULATE (§B.7): this card is the page's ONE
 * `.fl-gradient-ring` element — applied to an outer wrapper (not the
 * `.fl-glass-2` element itself), because `.fl-gradient-ring::before` and
 * `.fl-glass-2::before` (the baked-in grain layer) would otherwise fight
 * over the same pseudo-element on one host. One `.fl-light-pool` sits
 * behind the wrapper (§A.2). The glass card itself gains an inline
 * `boxShadow` that layers `--fl-specular` (the cream-high top highlight)
 * and a faint sage-ink hairline on top of its existing brass top-edge —
 * composed via inline style (not a Tailwind `shadow-*`/`ring-*` utility)
 * so it can't lose a cascade fight against `.fl-glass-2`'s own box-shadow
 * rule; see `.fl-card`'s identical `var(--fl-specular), var(--fl-shadow-*)`
 * pattern in first-light.css for precedent.
 *
 * Per the amendment, kelly (`#16A34A` / Tailwind `primary-*`) is demoted
 * to product-only chrome. It appears ONLY on the confidence badge + bar
 * below, because that is a literal echo of the product's own
 * `confidenceColor()` helper (green at >=70% confidence, exactly this
 * card's 82%) — real product content, not landing chrome. Every other
 * surface on this card (icon well, top rule, labels, body ink) uses the
 * sage/cream tokens like the rest of the landing.
 */
import { useRef } from 'react';
import { m, useInView, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { HelmRosette } from '../brand';
import { AnimatedNumber } from '@/components/ui/animated-number';

export interface M5IntelligenceProps {
  className?: string;
}

const CONFIDENCE = 0.82;
const DRIFT_FEET = 4.2;

export function M5Intelligence({ className }: M5IntelligenceProps) {
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.5 });
  const confPct = Math.round(CONFIDENCE * 100);

  return (
    <section
      className={cn('relative px-6 py-24 sm:py-32', className)}
      style={{
        background:
          'linear-gradient(180deg, var(--fl-cream) 0%, var(--fl-sage-mist) 42%, var(--fl-sage) 86%, var(--fl-sage-ink) 100%)',
      }}
    >
      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-start md:gap-16">
        {/* LEFT — rosette eyebrow + the large serif margin-note. */}
        <div>
          <div className="flex items-center gap-3">
            <HelmRosette size={12} className="flex-shrink-0 text-[var(--fl-brass)]" />
            <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.28em] text-[var(--fl-sage-deep)]">
              The Intelligence
            </span>
          </div>
          <m.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              flFraunces.className,
              'mt-6 text-balance text-[clamp(2rem,4.2vw,3.1rem)] font-normal leading-[1.1] text-[var(--fl-sage-ink)]',
            )}
          >
            No signal ships without its source.
          </m.p>
        </div>

        {/* RIGHT — the signal card, off-axis (~55% column). Interior unchanged. */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="fl-light-pool left-1/2 top-1/2 h-[30rem] w-[36rem] -translate-x-1/2 -translate-y-1/2"
          />

          <div className="fl-gradient-ring relative mx-auto max-w-xl rounded-2xl md:mx-0">
            <m.div
              ref={cardRef}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-15%' }}
              transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="fl-glass-2 relative z-10 overflow-hidden rounded-2xl"
              style={{
                boxShadow:
                  'inset 0 1px 0 0 rgba(var(--fl-brass-rgb), 0.35), var(--fl-specular), 0 0 0 1px rgba(var(--fl-sage-ink-rgb), 0.06)',
              }}
            >
              <div className="relative z-10">
                <div className="h-1 w-full" style={{ backgroundColor: 'var(--fl-sage)' }} aria-hidden="true" />

                <div className="p-7 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: 'rgba(var(--fl-sage-ink-rgb), 0.08)' }}
                      >
                        <Sparkles className="h-4 w-4" style={{ color: 'var(--fl-sage-deep)' }} aria-hidden="true" />
                      </div>
                      <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.55)]">
                        Coach Insight
                      </span>
                    </div>
                    {/* Kelly, deliberately — see file header: a literal echo of
                        the product's own confidenceColor() >=70% threshold. */}
                    <span
                      data-testid="fl-signal-confidence-badge"
                      className="flex-shrink-0 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white"
                    >
                      {confPct}% confidence
                    </span>
                  </div>

                  <div className="mt-5 flex items-end justify-between gap-4">
                    <p className="max-w-[15rem] text-body-lg leading-[1.65] text-[var(--fl-sage-ink)]">
                      Approach proximity from 175&ndash;200yd has drifted long over the last 3 rounds.
                    </p>
                    <div className="flex-shrink-0 text-right">
                      <div className="font-annual text-3xl font-medium tabular-nums leading-none text-[var(--fl-sage-ink)]">
                        <AnimatedNumber
                          value={inView ? DRIFT_FEET : 0}
                          decimals={1}
                          prefix="+"
                          suffix="ft"
                          className="tabular-nums"
                        />
                      </div>
                      <div className="mt-1 text-eyebrow uppercase tracking-[0.14em] text-[rgba(var(--fl-sage-ink-rgb),0.5)]">
                        long
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[rgba(var(--fl-sage-ink-rgb),0.14)] pt-5 sm:grid-cols-2">
                    <div>
                      <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.5)]">
                        Source
                      </span>
                      <p className="mt-1 text-body leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.78)]">
                        3 rounds · strokes-gained approach, 175&ndash;200yd bucket
                      </p>
                    </div>
                    <div>
                      <span className="font-annual text-eyebrow font-semibold uppercase tracking-[0.18em] text-[rgba(var(--fl-sage-ink-rgb),0.5)]">
                        Limitation
                      </span>
                      <p className="mt-1 text-body leading-[1.65] text-[rgba(var(--fl-sage-ink-rgb),0.78)]">
                        Small sample &mdash; 3 rounds. Confidence rises after 5+.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-3">
                    <div
                      role="progressbar"
                      aria-valuenow={confPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Confidence"
                      className="relative h-1.5 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: 'rgba(var(--fl-sage-ink-rgb), 0.12)' }}
                    >
                      <m.div
                        className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary-500"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: confPct / 100 }}
                        viewport={{ once: true, margin: '-15%' }}
                        transition={reduced ? { duration: 0 } : { duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                    <span className="font-annual text-caption font-medium tabular-nums text-[rgba(var(--fl-sage-ink-rgb),0.6)]">
                      {confPct}%
                    </span>
                  </div>
                </div>
              </div>
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}
