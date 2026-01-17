'use client';

/**
 * Shot Dispersion Chart
 *
 * Premium visual spray charts showing:
 * 1. Driving dispersion (left/fairway/right)
 * 2. Approach shot dispersion (green/miss patterns)
 * 3. Putting miss patterns (left/right/short/long)
 *
 * Design: Foundation-first approach with solid surfaces for data.
 * Follows Helm's Kelly Green accent + professional aesthetic.
 */

import { memo } from 'react';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { cn } from '@/lib/utils';

interface ShotDispersionChartProps {
  stats: GolfStats;
  className?: string;
}

// ============================================================================
// DRIVING DISPERSION CHART - Premium Visual
// ============================================================================

function DrivingDispersionVisual({
  fairwayPct,
  driverFairwayPct,
  missLeftCount,
  missRightCount,
  fairwaysHit,
  fairwayOpportunities,
}: {
  fairwayPct: number | null;
  driverFairwayPct: number | null;
  missLeftCount: number;
  missRightCount: number;
  fairwaysHit: number;
  fairwayOpportunities: number;
}) {
  const totalMisses = missLeftCount + missRightCount;
  const leftPctOfMisses = totalMisses > 0 ? (missLeftCount / totalMisses) * 100 : 50;
  const rightPctOfMisses = totalMisses > 0 ? (missRightCount / totalMisses) * 100 : 50;

  const fairway = fairwayPct ?? 0;
  const missTotal = 100 - fairway;
  const left = (missTotal * leftPctOfMisses) / 100;
  const right = (missTotal * rightPctOfMisses) / 100;

  // Determine miss tendency
  const missTendency = leftPctOfMisses > 60 ? 'left' : rightPctOfMisses > 60 ? 'right' : 'balanced';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Driving Dispersion</h3>
            <p className="text-sm text-slate-500 mt-0.5">Tee shot accuracy breakdown</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600 tabular-nums tracking-tight">
              {fairwayPct?.toFixed(0) ?? '--'}%
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Fairways</div>
          </div>
        </div>
      </div>

      {/* Visual Spray Chart */}
      <div className="px-6 py-8 bg-gradient-to-b from-slate-50/50 to-white">
        <div className="relative max-w-sm mx-auto">
          {/* Fairway Visual - Top Down View */}
          <svg viewBox="0 0 240 160" className="w-full" style={{ maxHeight: '200px' }}>
            <defs>
              {/* Fairway gradient */}
              <linearGradient id="fairwayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.25" />
              </linearGradient>
              {/* Rough gradient */}
              <linearGradient id="roughGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#84cc16" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#65a30d" stopOpacity="0.15" />
              </linearGradient>
            </defs>

            {/* Left rough */}
            <path d="M0,0 L70,0 L55,160 L0,160 Z" fill="url(#roughGrad)" />
            {/* Fairway */}
            <path d="M70,0 L170,0 L185,160 L55,160 Z" fill="url(#fairwayGrad)" />
            {/* Right rough */}
            <path d="M170,0 L240,0 L240,160 L185,160 Z" fill="url(#roughGrad)" />

            {/* Fairway edge lines */}
            <path d="M70,0 L55,160" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4" />
            <path d="M170,0 L185,160" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4" />

            {/* Tee box indicator */}
            <rect x="105" y="140" width="30" height="12" rx="2" fill="#78716c" opacity="0.8" />
            <text x="120" y="150" textAnchor="middle" fontSize="7" fill="white" fontWeight="500">TEE</text>

            {/* Shot distribution visualization */}
            {/* Left misses */}
            {left > 0 && (
              <g>
                {Array.from({ length: Math.min(Math.round(left / 8), 10) }).map((_, i) => (
                  <circle
                    key={`left-${i}`}
                    cx={25 + (i % 4) * 12 + Math.random() * 8}
                    cy={25 + Math.floor(i / 4) * 30 + Math.random() * 15}
                    r="5"
                    fill="#ef4444"
                    opacity="0.75"
                  />
                ))}
              </g>
            )}

            {/* Fairway hits */}
            {fairway > 0 && (
              <g>
                {Array.from({ length: Math.min(Math.round(fairway / 8), 10) }).map((_, i) => (
                  <circle
                    key={`fair-${i}`}
                    cx={90 + (i % 5) * 12}
                    cy={20 + Math.floor(i / 5) * 35}
                    r="5"
                    fill="#16a34a"
                    opacity="0.85"
                  />
                ))}
              </g>
            )}

            {/* Right misses */}
            {right > 0 && (
              <g>
                {Array.from({ length: Math.min(Math.round(right / 8), 10) }).map((_, i) => (
                  <circle
                    key={`right-${i}`}
                    cx={195 + (i % 4) * 10 + Math.random() * 8}
                    cy={25 + Math.floor(i / 4) * 30 + Math.random() * 15}
                    r="5"
                    fill="#f97316"
                    opacity="0.75"
                  />
                ))}
              </g>
            )}

            {/* Zone labels */}
            <text x="35" y="95" textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="500">LEFT</text>
            <text x="120" y="70" textAnchor="middle" fontSize="11" fill="#16a34a" fontWeight="600">FAIRWAY</text>
            <text x="205" y="95" textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="500">RIGHT</text>
          </svg>
        </div>
      </div>

      {/* Stats Grid - Solid surface for data */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        <div className="grid grid-cols-3 gap-4">
          {/* Left Miss */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 border border-red-100">
            <div className="text-2xl font-bold text-red-600 tabular-nums">{left.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Left</div>
            <div className="text-xs text-slate-400 mt-0.5">{missLeftCount} shots</div>
          </div>

          {/* Fairway */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
            <div className="text-2xl font-bold text-green-600 tabular-nums">{fairway.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Fairway</div>
            <div className="text-xs text-slate-400 mt-0.5">{fairwaysHit}/{fairwayOpportunities}</div>
          </div>

          {/* Right Miss */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100">
            <div className="text-2xl font-bold text-orange-600 tabular-nums">{right.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Right</div>
            <div className="text-xs text-slate-400 mt-0.5">{missRightCount} shots</div>
          </div>
        </div>

        {/* Miss Tendency Insight */}
        {totalMisses >= 3 && (
          <div className={cn(
            'mt-4 p-3 rounded-lg flex items-center gap-3',
            missTendency === 'left' ? 'bg-red-50 border border-red-100' :
            missTendency === 'right' ? 'bg-orange-50 border border-orange-100' :
            'bg-slate-50 border border-slate-100'
          )}>
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
              missTendency === 'left' ? 'bg-red-100 text-red-600' :
              missTendency === 'right' ? 'bg-orange-100 text-orange-600' :
              'bg-slate-200 text-slate-600'
            )}>
              {missTendency === 'left' ? '←' : missTendency === 'right' ? '→' : '↔'}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">
                {missTendency === 'balanced'
                  ? 'Balanced miss pattern'
                  : `Tendency to miss ${missTendency}`}
              </div>
              <div className="text-xs text-slate-500">
                {missTendency === 'balanced'
                  ? 'Misses are evenly distributed'
                  : `${Math.max(leftPctOfMisses, rightPctOfMisses).toFixed(0)}% of misses go ${missTendency}`}
              </div>
            </div>
          </div>
        )}

        {/* Driver stats */}
        {driverFairwayPct !== null && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">Driver fairway %</span>
              <span className="font-semibold text-slate-900 tabular-nums">{driverFairwayPct.toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// APPROACH DISPERSION CHART - Premium Visual
// ============================================================================

function ApproachDispersionVisual({
  girPct,
  girFromFairway,
  girFromRough,
  girFromSand,
  girTotal,
  girOpportunities,
}: {
  girPct: number | null;
  girFromFairway: number | null;
  girFromRough: number | null;
  girFromSand: number | null;
  girTotal: number;
  girOpportunities: number;
}) {
  const missedGreen = girOpportunities - girTotal;
  const missedPct = girOpportunities > 0 ? (missedGreen / girOpportunities) * 100 : 0;
  const gir = girPct ?? 0;

  // Calculate the gap between fairway and rough GIR
  const fairwayAdvantage = girFromFairway !== null && girFromRough !== null
    ? girFromFairway - girFromRough
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Approach Accuracy</h3>
            <p className="text-sm text-slate-500 mt-0.5">Greens in regulation</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600 tabular-nums tracking-tight">
              {gir.toFixed(0)}%
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">GIR</div>
          </div>
        </div>
      </div>

      {/* Visual Green Target */}
      <div className="px-6 py-8 bg-gradient-to-b from-slate-50/50 to-white">
        <div className="relative max-w-sm mx-auto">
          <svg viewBox="0 0 200 200" className="w-full" style={{ maxHeight: '200px' }}>
            <defs>
              <radialGradient id="greenGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                <stop offset="70%" stopColor="#16a34a" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#15803d" stopOpacity="0.1" />
              </radialGradient>
              <radialGradient id="fringeGrad" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stopColor="#86efac" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#4ade80" stopOpacity="0.2" />
              </radialGradient>
            </defs>

            {/* Fringe/collar area */}
            <ellipse cx="100" cy="100" rx="90" ry="80" fill="url(#fringeGrad)" />

            {/* Green surface */}
            <ellipse cx="100" cy="100" rx="60" ry="50" fill="url(#greenGrad)" stroke="#16a34a" strokeWidth="2" strokeDasharray="6 4" opacity="0.8" />

            {/* Pin location */}
            <circle cx="100" cy="100" r="4" fill="#1f2937" />
            <line x1="100" y1="70" x2="100" y2="100" stroke="#fbbf24" strokeWidth="2" />
            <polygon points="100,70 115,78 100,78" fill="#ef4444" />

            {/* GIR shots (on green) */}
            {gir > 0 && Array.from({ length: Math.min(Math.round(gir / 10), 8) }).map((_, i) => {
              const angle = (i / 8) * 2 * Math.PI - Math.PI / 2;
              const radius = 18 + (i % 3) * 14;
              const x = 100 + Math.cos(angle) * radius;
              const y = 100 + Math.sin(angle) * (radius * 0.8);
              return (
                <circle key={`gir-${i}`} cx={x} cy={y} r="6" fill="#16a34a" opacity="0.8" />
              );
            })}

            {/* Missed green shots */}
            {missedPct > 0 && Array.from({ length: Math.min(Math.round(missedPct / 10), 8) }).map((_, i) => {
              const angle = ((i + 3) / 8) * 2 * Math.PI;
              const radius = 65 + (i % 2) * 15;
              const x = 100 + Math.cos(angle) * radius;
              const y = 100 + Math.sin(angle) * (radius * 0.75);
              return (
                <circle key={`miss-${i}`} cx={x} cy={y} r="5" fill="#f97316" opacity="0.7" />
              );
            })}

            {/* Labels */}
            <text x="100" y="130" textAnchor="middle" fontSize="11" fill="#16a34a" fontWeight="600" opacity="0.9">GREEN</text>
            <text x="100" y="185" textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="500">FRINGE</text>
          </svg>
        </div>
      </div>

      {/* Stats - Solid surface */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Hit Green */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
            <div className="text-2xl font-bold text-green-600 tabular-nums">{gir.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Hit Green</div>
            <div className="text-xs text-slate-400 mt-0.5">{girTotal} of {girOpportunities}</div>
          </div>

          {/* Missed Green */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100">
            <div className="text-2xl font-bold text-orange-600 tabular-nums">{missedPct.toFixed(0)}%</div>
            <div className="text-xs font-medium text-slate-600 mt-1">Missed</div>
            <div className="text-xs text-slate-400 mt-0.5">{missedGreen} misses</div>
          </div>
        </div>

        {/* GIR by lie breakdown */}
        {(girFromFairway !== null || girFromRough !== null || girFromSand !== null) && (
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">GIR by Lie</div>

            {girFromFairway !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm text-slate-600">From Fairway</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${girFromFairway}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
                    {girFromFairway.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            {girFromRough !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm text-slate-600">From Rough</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${girFromRough}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
                    {girFromRough.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            {girFromSand !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-sm text-slate-600">From Sand</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${girFromSand}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">
                    {girFromSand.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fairway advantage insight */}
        {fairwayAdvantage !== null && fairwayAdvantage > 10 && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 text-xs font-bold">!</span>
              </div>
              <div className="text-sm text-blue-800">
                <span className="font-medium">Fairway advantage:</span>{' '}
                +{fairwayAdvantage.toFixed(0)}% GIR from fairway vs rough
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PUTTING DISPERSION CHART - Premium Visual
// ============================================================================

function PuttingDispersionVisual({
  puttMissLeftPct,
  puttMissRightPct,
  puttMissShortPct,
  puttMissLongPct,
  totalPutts,
  onePuttsTotal,
  threePuttsTotal,
}: {
  puttMissLeftPct: number | null;
  puttMissRightPct: number | null;
  puttMissShortPct: number | null;
  puttMissLongPct: number | null;
  totalPutts: number;
  onePuttsTotal: number;
  threePuttsTotal: number;
}) {
  const left = puttMissLeftPct ?? 0;
  const right = puttMissRightPct ?? 0;
  const short = puttMissShortPct ?? 0;
  const long = puttMissLongPct ?? 0;

  // Find dominant miss pattern
  const misses = [
    { type: 'left', pct: left, label: 'Left', color: 'red' },
    { type: 'right', pct: right, label: 'Right', color: 'orange' },
    { type: 'short', pct: short, label: 'Short', color: 'blue' },
    { type: 'long', pct: long, label: 'Long', color: 'purple' },
  ];
  const dominantMiss = misses.reduce((a, b) => a.pct > b.pct ? a : b);
  const hasDominantPattern = dominantMiss.pct > 35;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Putting Miss Pattern</h3>
            <p className="text-sm text-slate-500 mt-0.5">Where missed putts finish</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {totalPutts}
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Putts</div>
          </div>
        </div>
      </div>

      {/* Visual Hole Target */}
      <div className="px-6 py-8 bg-gradient-to-b from-slate-50/50 to-white">
        <div className="relative max-w-xs mx-auto">
          <svg viewBox="0 0 200 200" className="w-full" style={{ maxHeight: '200px' }}>
            <defs>
              <radialGradient id="puttGreenGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.1" />
              </radialGradient>
            </defs>

            {/* Green surface */}
            <rect x="10" y="10" width="180" height="180" rx="12" fill="url(#puttGreenGrad)" />

            {/* Grid lines for reference */}
            <line x1="100" y1="20" x2="100" y2="180" stroke="#16a34a" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
            <line x1="20" y1="100" x2="180" y2="100" stroke="#16a34a" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />

            {/* Hole */}
            <circle cx="100" cy="100" r="8" fill="#1f2937" />
            <circle cx="100" cy="100" r="6" fill="#374151" />

            {/* Miss zone indicators - sized by percentage */}
            {/* Left */}
            <rect
              x="20" y="60" width="40" height="80" rx="8"
              fill="#ef4444"
              opacity={Math.min(left / 100, 0.6)}
            />
            <text x="40" y="105" textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700" opacity={left > 10 ? 1 : 0.5}>
              {left.toFixed(0)}%
            </text>
            <text x="40" y="120" textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="500">LEFT</text>

            {/* Right */}
            <rect
              x="140" y="60" width="40" height="80" rx="8"
              fill="#f97316"
              opacity={Math.min(right / 100, 0.6)}
            />
            <text x="160" y="105" textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700" opacity={right > 10 ? 1 : 0.5}>
              {right.toFixed(0)}%
            </text>
            <text x="160" y="120" textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="500">RIGHT</text>

            {/* Short */}
            <rect
              x="60" y="140" width="80" height="40" rx="8"
              fill="#3b82f6"
              opacity={Math.min(short / 100, 0.6)}
            />
            <text x="100" y="165" textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700" opacity={short > 10 ? 1 : 0.5}>
              {short.toFixed(0)}%
            </text>
            <text x="100" y="178" textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="500">SHORT</text>

            {/* Long */}
            <rect
              x="60" y="20" width="80" height="40" rx="8"
              fill="#8b5cf6"
              opacity={Math.min(long / 100, 0.6)}
            />
            <text x="100" y="45" textAnchor="middle" fontSize="14" fill="#1f2937" fontWeight="700" opacity={long > 10 ? 1 : 0.5}>
              {long.toFixed(0)}%
            </text>
            <text x="100" y="56" textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="500">LONG</text>
          </svg>
        </div>
      </div>

      {/* Stats - Solid surface */}
      <div className="px-6 py-5 bg-white border-t border-slate-100">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* 1-Putts */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
            <div className="text-2xl font-bold text-green-600 tabular-nums">{onePuttsTotal}</div>
            <div className="text-xs font-medium text-slate-600 mt-1">1-Putts</div>
          </div>

          {/* 3-Putts */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 border border-red-100">
            <div className="text-2xl font-bold text-red-600 tabular-nums">{threePuttsTotal}</div>
            <div className="text-xs font-medium text-slate-600 mt-1">3-Putts</div>
          </div>
        </div>

        {/* Dominant miss pattern insight */}
        {hasDominantPattern && (
          <div className={cn(
            'p-3 rounded-lg flex items-center gap-3',
            dominantMiss.color === 'red' ? 'bg-red-50 border border-red-100' :
            dominantMiss.color === 'orange' ? 'bg-orange-50 border border-orange-100' :
            dominantMiss.color === 'blue' ? 'bg-blue-50 border border-blue-100' :
            'bg-purple-50 border border-purple-100'
          )}>
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
              dominantMiss.color === 'red' ? 'bg-red-100 text-red-600' :
              dominantMiss.color === 'orange' ? 'bg-orange-100 text-orange-600' :
              dominantMiss.color === 'blue' ? 'bg-blue-100 text-blue-600' :
              'bg-purple-100 text-purple-600'
            )}>
              {dominantMiss.type === 'left' ? '←' :
               dominantMiss.type === 'right' ? '→' :
               dominantMiss.type === 'short' ? '↓' : '↑'}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">
                Dominant miss: {dominantMiss.label}
              </div>
              <div className="text-xs text-slate-500">
                {dominantMiss.pct.toFixed(0)}% of missed putts
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ShotDispersionChart = memo(function ShotDispersionChart({
  stats,
  className,
}: ShotDispersionChartProps) {
  const hasData = stats.holesPlayed > 0;

  if (!hasData) {
    return (
      <div className={cn('', className)}>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎯</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Shot Data Yet</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Complete rounds with shot tracking to see dispersion patterns.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Section Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Shot Dispersion</h2>
        <p className="text-sm text-slate-500 mt-1">Visual breakdown of where your shots land</p>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Driving Dispersion */}
        <DrivingDispersionVisual
          fairwayPct={stats.fairwayPercentage}
          driverFairwayPct={stats.fairwayPctDriver}
          missLeftCount={stats.missLeftCount}
          missRightCount={stats.missRightCount}
          fairwaysHit={stats.fairwaysHit}
          fairwayOpportunities={stats.fairwayOpportunities}
        />

        {/* Approach Dispersion */}
        <ApproachDispersionVisual
          girPct={stats.girPercentage}
          girFromFairway={stats.girPctFromFairway}
          girFromRough={stats.girPctFromRough}
          girFromSand={stats.girPctFromSand}
          girTotal={stats.girTotal}
          girOpportunities={stats.girOpportunities}
        />
      </div>

      {/* Putting Dispersion - Full Width */}
      <PuttingDispersionVisual
        puttMissLeftPct={stats.puttMissLeftPct}
        puttMissRightPct={stats.puttMissRightPct}
        puttMissShortPct={stats.puttMissShortPct}
        puttMissLongPct={stats.puttMissLongPct}
        totalPutts={stats.totalPutts}
        onePuttsTotal={stats.onePuttsTotal}
        threePuttsTotal={stats.threePuttsTotal}
      />
    </div>
  );
});

export default ShotDispersionChart;
