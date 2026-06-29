'use client';

import { m, useReducedMotion } from 'framer-motion';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import {
  enterVariants,
  enterTransition,
  stagger,
  liftHover,
  EASE_CINEMATIC,
  DURATION,
} from '@/lib/coachhelm/v3/motion';

interface Props {
  vector: GenomeVector;
}

export function GenomeDimensionGrid({ vector }: Props) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  return (
    <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {GENOME_DIMENSIONS.map((dim, i) => {
        const r = vector[dim.id];
        const norm = r ? normalizeForRadar(dim.id, r) : null;
        const isLocked = norm === null;
        const valueDisplay = isLocked
          ? r?.label ?? 'Locked'
          : r?.label ?? formatValue(r?.value ?? null);
        return (
          <m.li
            key={dim.id}
            variants={enterVariants}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            transition={{ ...enterTransition, delay: prefersReducedMotion ? 0 : stagger(i) }}
            whileHover={prefersReducedMotion || isLocked ? undefined : liftHover}
            className={`surface-matte rounded-2xl p-4 ${
              isLocked ? '' : 'cursor-default'
            }`}
          >
            <p className="text-caption uppercase tracking-[0.14em] text-warm-500 mb-1.5">
              {dim.label}
            </p>
            <p
              className={`text-body font-medium leading-snug ${
                isLocked ? 'text-warm-400 italic' : 'text-warm-900'
              }`}
            >
              {valueDisplay}
            </p>
            {/* Score bar — 8 cells, each fills per quintile of norm */}
            <div className="mt-3 flex gap-0.5 h-1.5" aria-hidden>
              {Array.from({ length: 8 }).map((_, idx) => {
                const fillThreshold = (idx + 1) / 8;
                const filled = norm !== null && norm >= fillThreshold - 0.125;
                return (
                  <m.span
                    key={idx}
                    initial={prefersReducedMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: DURATION.short,
                      delay: prefersReducedMotion ? 0 : 0.15 + stagger(i) + idx * 0.025,
                      ease: EASE_CINEMATIC,
                    }}
                    style={{ transformOrigin: 'left' }}
                    className={`flex-1 rounded-sm ${
                      filled ? 'bg-primary-600' : 'bg-warm-200'
                    }`}
                  />
                );
              })}
            </div>
            {!isLocked && r?.value !== undefined && r?.value !== null && (
              <p className="mt-2.5 text-caption tabular-nums text-warm-500">
                {formatValue(r.value)}
                {r.confidence !== null && (
                  <span className="opacity-60"> · conf {(r.confidence * 100).toFixed(0)}%</span>
                )}
              </p>
            )}
          </m.li>
        );
      })}
    </ul>
  );
}

function formatValue(v: number | string | null): string {
  if (v === null) return '—';
  if (typeof v === 'string') return v;
  if (Math.abs(v) < 1) return v.toFixed(2);
  return v.toFixed(1);
}
