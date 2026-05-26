'use client';

/**
 * PuttHeatmap — premium top-down putting visualization.
 *
 * Left side: a green "viewed from above" with the cup at center,
 * distance buckets as concentric topo rings, and every putt plotted
 * as a dot (made = filled emerald, missed = hollow rose) at the
 * angle of its miss side.
 *
 * Right side: a stat ladder — per-bucket make %, attempts, and a
 * dominant-miss callout.
 *
 * Stats-page citizen, not per-round. Aggregates across whatever
 * putts the parent decides to pass in.
 */

import { useMemo, useState } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import {
  buildPuttHeatmap,
  formatPct,
  MISS_SIDE_LABEL,
  VB,
  MAX_R,
  HOLE_R,
  BUCKET_RADII,
  type PlottedPutt,
} from './geometry';
import type { PuttHeatmapProps } from './types';
import {
  EASE_CINEMATIC,
  enterVariants,
  enterTransition,
  stagger,
} from '@/lib/coachhelm/v3/motion';

export function PuttHeatmap({
  putts,
  title = 'Putting heatmap',
  className,
}: PuttHeatmapProps) {
  const data = useMemo(() => buildPuttHeatmap(putts), [putts]);
  const [hovered, setHovered] = useState<PlottedPutt | null>(null);

  const hasData = data.total_putts > 0;

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className={['surface-matte rounded-2xl p-5 md:p-7', className ?? ''].filter(Boolean).join(' ')}
        variants={enterVariants}
        initial="hidden"
        animate="visible"
        transition={enterTransition}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-warm-500">
              Putting
            </div>
            <h3 className="text-[18px] font-medium text-warm-900 tracking-[-0.012em]">
              {title}
            </h3>
          </div>
          {hasData && (
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.14em] text-warm-500">
                Make %
              </div>
              <div className="text-2xl font-medium text-warm-900 tabular-nums tracking-[-0.02em]">
                {formatPct(data.overall_make_pct)}
              </div>
              <div className="text-[11px] text-warm-400 tabular-nums">
                {data.total_made}/{data.total_putts}
              </div>
            </div>
          )}
        </div>

        {!hasData ? (
          <div className="py-16 text-center">
            <p className="text-sm text-warm-500 italic">
              No putts logged yet — the heatmap needs at least one putt with a
              distance and result.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1fr] gap-5 md:gap-8 items-start">
            {/* Green visualization */}
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden ring-1 ring-white/20 shadow-[0_22px_50px_-26px_rgba(15,42,30,0.55)] bg-[#3a7a5a]">
                <svg
                  viewBox={`0 0 ${VB.width} ${VB.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="h-full w-full"
                >
                  <defs>
                    <radialGradient id="ph-green" cx="50%" cy="48%" r="65%">
                      <stop offset="0%" stopColor="#7fc398" />
                      <stop offset="55%" stopColor="#4f9a72" />
                      <stop offset="100%" stopColor="#2c6a4c" />
                    </radialGradient>
                    <radialGradient id="ph-cup-shadow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#0a1f15" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#0a1f15" stopOpacity="0" />
                    </radialGradient>
                    <pattern
                      id="ph-grain"
                      x="0"
                      y="0"
                      width="240"
                      height="4"
                      patternUnits="userSpaceOnUse"
                    >
                      <rect x="0" y="0" width="240" height="2" fill="#ffffff" opacity="0.02" />
                      <rect x="0" y="2" width="240" height="2" fill="#000000" opacity="0.02" />
                    </pattern>
                  </defs>

                  {/* Green base + grain */}
                  <rect x="0" y="0" width={VB.width} height={VB.height} fill="url(#ph-green)" />
                  <rect x="0" y="0" width={VB.width} height={VB.height} fill="url(#ph-grain)" />

                  {/* Light highlight crescent (catches the sun) */}
                  <ellipse
                    cx={VB.cx - 18}
                    cy={VB.cy - 28}
                    rx={MAX_R * 0.7}
                    ry={MAX_R * 0.45}
                    fill="#ffffff"
                    opacity="0.08"
                  />

                  {/* Compass tick labels — L / R / Long / Short */}
                  <g fontSize="7" fontWeight={500} fill="#ffffff" opacity="0.55" textAnchor="middle">
                    <text x={VB.cx} y={14}>LONG</text>
                    <text x={VB.cx} y={VB.height - 8}>SHORT</text>
                    <text x={10} y={VB.cy + 2} textAnchor="start">L</text>
                    <text x={VB.width - 10} y={VB.cy + 2} textAnchor="end">R</text>
                  </g>

                  {/* Bucket topo rings */}
                  <g>
                    {BUCKET_RADII.map((b, i) => (
                      <g key={b.id}>
                        <circle
                          cx={VB.cx}
                          cy={VB.cy}
                          r={b.r}
                          fill="none"
                          stroke="#ffffff"
                          strokeOpacity={0.18}
                          strokeWidth={0.6}
                          strokeDasharray="2 2"
                        />
                        {/* Ring label sits along the top of each ring */}
                        <text
                          x={VB.cx}
                          y={VB.cy - b.r - 1.4}
                          fontSize="5.2"
                          fill="#ffffff"
                          opacity={0.55}
                          textAnchor="middle"
                          fontWeight={500}
                        >
                          {b.label} ft
                        </text>
                        {/* Stagger ring entrance */}
                        <m.circle
                          cx={VB.cx}
                          cy={VB.cy}
                          r={b.r}
                          fill="none"
                          stroke="#ffffff"
                          strokeOpacity={0}
                          strokeWidth={0.6}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease: EASE_CINEMATIC }}
                        />
                      </g>
                    ))}
                  </g>

                  {/* Cup shadow + cup */}
                  <circle cx={VB.cx} cy={VB.cy} r={HOLE_R + 4} fill="url(#ph-cup-shadow)" />
                  <circle cx={VB.cx} cy={VB.cy} r={HOLE_R} fill="#0d1f15" />
                  {/* Flag pin shadow on the green */}
                  <line
                    x1={VB.cx}
                    y1={VB.cy}
                    x2={VB.cx + 14}
                    y2={VB.cy + 2}
                    stroke="#0d1f15"
                    strokeOpacity={0.35}
                    strokeWidth={0.8}
                    strokeLinecap="round"
                  />

                  {/* Plotted putts */}
                  <g>
                    {data.plotted.map((p, i) => {
                      const fill = p.made ? '#10b981' : 'transparent';
                      const stroke = p.made ? '#065f46' : '#e3543b';
                      const radius = p.made ? 2.6 : 2.4;
                      return (
                        <m.g
                          key={p.key}
                          initial={{ opacity: 0, scale: 0.4 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            duration: 0.45,
                            delay: 0.35 + stagger(i % 30),
                            ease: EASE_CINEMATIC,
                          }}
                          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                          onMouseEnter={() => setHovered(p)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(p)}
                          onBlur={() => setHovered(null)}
                          tabIndex={0}
                        >
                          {/* Outer glow for made putts so they read first */}
                          {p.made && (
                            <circle cx={p.x} cy={p.y} r={radius + 1.6} fill="#10b981" opacity={0.18} />
                          )}
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={radius}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={p.made ? 0.3 : 0.8}
                          />
                        </m.g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {/* Hover tooltip */}
              {hovered && (
                <m.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: EASE_CINEMATIC }}
                  className="absolute left-1/2 -translate-x-1/2 -bottom-2 translate-y-full z-10 pointer-events-none surface-lift rounded-xl px-3 py-2 text-[11px] text-warm-800 whitespace-nowrap shadow-lg"
                  role="tooltip"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-warm-900 tabular-nums">
                      {Math.round(hovered.distance_feet)} ft
                    </span>
                    <span
                      className={hovered.made ? 'text-emerald-700' : 'text-rose-600'}
                    >
                      {hovered.made ? 'Made' : 'Missed'}
                    </span>
                  </div>
                  {!hovered.made && hovered.miss && (
                    <div className="text-warm-500">{MISS_SIDE_LABEL[hovered.miss]}</div>
                  )}
                </m.div>
              )}

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 px-1 text-[11px] text-warm-500">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                  Made
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-transparent ring-2 ring-rose-500" />
                  Missed
                </span>
              </div>
            </div>

            {/* Stat ladder */}
            <div className="space-y-5">
              <div>
                <h4 className="text-[11px] uppercase tracking-[0.14em] text-warm-500 mb-3">
                  Make rate by distance
                </h4>
                <ul className="space-y-2.5">
                  {data.buckets.map((b, i) => {
                    const pct = b.make_pct;
                    const barWidth = pct === null ? 0 : pct * 100;
                    return (
                      <m.li
                        key={b.id}
                        variants={enterVariants}
                        initial="hidden"
                        animate="visible"
                        transition={{ ...enterTransition, delay: 0.15 + stagger(i) }}
                        className="grid grid-cols-[68px_1fr_56px] items-center gap-3"
                      >
                        <span className="text-xs text-warm-700 tabular-nums">
                          {b.short} ft
                        </span>
                        <div className="relative h-2 rounded-full bg-warm-100 overflow-hidden">
                          <m.div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.7, delay: 0.25 + stagger(i), ease: EASE_CINEMATIC }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-right">
                          <span className="font-medium text-warm-900">{formatPct(pct)}</span>
                          <span className="ml-1 text-warm-400">· {b.attempts}</span>
                        </span>
                      </m.li>
                    );
                  })}
                </ul>
              </div>

              {/* Miss-bias callout */}
              {data.miss_bias.dominant && data.miss_bias.share >= 0.4 && (
                <div className="surface-lift rounded-2xl p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-warm-500 mb-1">
                    Miss tendency
                  </div>
                  <div className="text-[15px] text-warm-900 tracking-[-0.01em]">
                    <span className="font-medium">
                      {Math.round(data.miss_bias.share * 100)}%
                    </span>{' '}
                    of misses are{' '}
                    <span className="font-medium">
                      {data.miss_bias.dominant === 'long'
                        ? 'long'
                        : data.miss_bias.dominant === 'short'
                          ? 'short'
                          : data.miss_bias.dominant}
                    </span>
                    .
                  </div>
                  <div className="text-[11px] text-warm-500 mt-1">
                    Based on {data.miss_bias.total} missed putt
                    {data.miss_bias.total === 1 ? '' : 's'}.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </m.div>
    </LazyMotion>
  );
}

export type { PuttHeatmapProps, PuttRecord } from './types';
