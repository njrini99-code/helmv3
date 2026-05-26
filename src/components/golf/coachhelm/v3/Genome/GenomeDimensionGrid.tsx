'use client';

import { m } from 'framer-motion';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';

interface Props {
  vector: GenomeVector;
}

export function GenomeDimensionGrid({ vector }: Props) {
  return (
    <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {GENOME_DIMENSIONS.map((dim, i) => {
        const r = vector[dim.id];
        const norm = r ? normalizeForRadar(dim.id, r) : null;
        const isLocked = norm === null;
        return (
          <m.li
            key={dim.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 * i, ease: 'easeOut' }}
            className="surface-matte rounded-2xl p-4"
          >
            <p className="text-[10px] uppercase tracking-[0.14em] text-warm-500 mb-1">
              {dim.label}
            </p>
            <p
              className={`text-[15px] font-medium ${
                isLocked ? 'text-warm-400 italic' : 'text-warm-900'
              }`}
            >
              {isLocked ? r?.label ?? 'Locked' : r?.label ?? formatValue(r?.value ?? null)}
            </p>
            {/* Score bar — 8 cells, each filled per quintile of norm */}
            <div className="mt-3 flex gap-0.5 h-1.5">
              {Array.from({ length: 8 }).map((_, idx) => {
                const fillThreshold = (idx + 1) / 8;
                const filled = norm !== null && norm >= fillThreshold - 0.125;
                return (
                  <span
                    key={idx}
                    className={`flex-1 rounded-sm ${
                      filled ? 'bg-primary-600' : 'bg-warm-200'
                    }`}
                  />
                );
              })}
            </div>
            {!isLocked && r?.value !== undefined && r?.value !== null && (
              <p className="mt-2 text-[11px] tabular-nums text-warm-500">
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
