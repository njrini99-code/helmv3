'use client';

/**
 * v3 polish — Genome compare picker column.
 *
 * The compare-page audit bullet ("Compare page player-picker has
 * functional but plain rows. Add hover lift.") called this out as the
 * one remaining gap on the genome cluster. We keep the routing model
 * (Link with query-string state — no client store needed) and just
 * wrap each row in canonical v3 motion so it lifts, taps, and enters
 * the same way every other v3 surface does.
 *
 * Respects `prefers-reduced-motion` — when set, the rows skip the
 * entrance stagger and hover lift, falling back to a static row that
 * still highlights on hover via Tailwind.
 */

import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';
import {
  enterVariants,
  enterTransition,
  stagger,
  liftHover,
  tapPress,
} from '@/lib/coachhelm/v3/motion';

export interface GenomeComparePickerProps {
  heading: string;
  selectedId: string | null;
  otherId: string | null;
  roster: { id: string; name: string }[];
  paramName: 'p1' | 'p2';
  /** Currently-selected value for the OTHER slot. Preserved in links. */
  otherSlot: string | undefined;
}

export function GenomeComparePicker({
  heading,
  selectedId,
  otherId,
  roster,
  paramName,
  otherSlot,
}: GenomeComparePickerProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const otherParam = paramName === 'p1' ? 'p2' : 'p1';

  return (
    <div className="surface-matte rounded-2xl p-4">
      <h3 className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 mb-3">
        {heading}
      </h3>
      {roster.length === 0 ? (
        <p className="text-sm text-warm-400 italic px-2 py-6 text-center">
          No active roster — add players in roster settings.
        </p>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {roster.map((p, i) => {
            const isSelected = p.id === selectedId;
            const isOther = p.id === otherId;
            const params = new URLSearchParams();
            params.set(paramName, p.id);
            if (otherSlot) params.set(otherParam, otherSlot);
            const href = `/golf/dashboard/coachhelm/genome/compare?${params.toString()}`;
            const interactive = !isOther;
            const hoverProps =
              prefersReducedMotion || isSelected || !interactive ? {} : { whileHover: liftHover };
            const tapProps =
              prefersReducedMotion || !interactive ? {} : { whileTap: tapPress };
            return (
              <m.li
                key={p.id}
                variants={enterVariants}
                initial={prefersReducedMotion ? false : 'hidden'}
                animate="visible"
                transition={{
                  ...enterTransition,
                  delay: prefersReducedMotion ? 0 : stagger(i),
                }}
              >
                <m.div {...hoverProps} {...tapProps}>
                  <Link
                    href={href}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-disabled={isOther || undefined}
                    tabIndex={isOther ? -1 : undefined}
                    className={`block px-3 py-2 rounded-lg text-sm transition-colors [transition-duration:280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
                      isSelected
                        ? 'bg-warm-900 text-white shadow-[0_8px_18px_-12px_rgba(28,25,23,0.45)]'
                        : isOther
                          ? 'text-warm-400 cursor-not-allowed pointer-events-none'
                          : 'text-warm-800 hover:bg-warm-100'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      {isOther && (
                        <span className="text-eyebrow opacity-60 shrink-0">in other slot</span>
                      )}
                      {isSelected && (
                        <span aria-hidden className="text-eyebrow tracking-[0.08em] uppercase opacity-70 shrink-0">
                          Picked
                        </span>
                      )}
                    </span>
                  </Link>
                </m.div>
              </m.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
