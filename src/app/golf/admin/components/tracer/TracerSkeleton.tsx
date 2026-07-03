'use client';

import type { TracerSubTab } from './tracer-types';

// ============================================================================
// SKELETON COMPONENTS (per sub-tab)
// ============================================================================

const pulse = 'bg-warm-200/60 animate-pulse rounded';
const pulseLight = 'bg-warm-200/40 animate-pulse rounded';

function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-cream-50 rounded-2xl border border-white/20 p-5 md:p-6 border-l-[3px] border-l-warm-200">
          <div className={`w-24 h-3 ${pulse} mb-3`} />
          <div className={`w-16 h-8 ${pulse} mb-2`} />
          <div className={`w-20 h-3 ${pulseLight}`} />
        </div>
      ))}
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-6">
      <KPICardsSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Ring placeholder */}
        <div className="bg-cream-50 rounded-2xl border border-white/20 p-8 flex items-center justify-center">
          <div className="w-[200px] h-[200px] rounded-full bg-warm-200/40 animate-pulse" />
        </div>
        {/* Alerts placeholder */}
        <div className="bg-cream-50 rounded-2xl border border-white/20 p-6 lg:col-span-2">
          <div className={`w-24 h-3 ${pulse} mb-4`} />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-warm-50/50">
                <div className="w-8 h-8 rounded-lg bg-warm-200/50 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className={`w-40 h-3.5 ${pulse}`} />
                  <div className={`w-60 h-2.5 ${pulseLight}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Activity timeline */}
      <div className="bg-cream-50 rounded-2xl border border-white/20 overflow-hidden">
        <div className={`w-32 h-3 ${pulse} m-5 mb-4`} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-warm-50 last:border-0">
            <div className="w-7 h-7 rounded-lg bg-warm-200/40 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className={`w-48 h-3.5 ${pulse}`} />
              <div className={`w-32 h-2.5 ${pulseLight}`} />
            </div>
            <div className={`w-12 h-2.5 ${pulseLight} flex-shrink-0`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-64 h-9 ${pulseLight} rounded-xl`} />
        <div className={`w-28 h-9 ${pulseLight} rounded-xl`} />
        <div className={`w-28 h-9 ${pulseLight} rounded-xl`} />
      </div>
      {/* Summary bar */}
      <div className={`w-72 h-4 ${pulseLight}`} />
      {/* Table */}
      <div className="bg-cream-50 rounded-2xl border border-white/20 overflow-hidden">
        <div className="h-11 border-b border-warm-100 bg-warm-50/30" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-warm-50 last:border-0">
            <div className="w-8 h-8 rounded-full bg-warm-200/50 animate-pulse" />
            <div className={`w-28 h-3.5 ${pulse}`} />
            <div className="flex-1" />
            <div className={`w-20 h-3.5 ${pulseLight}`} />
            <div className={`w-12 h-5 rounded-full ${pulseLight}`} />
            <div className={`w-16 h-3.5 ${pulseLight}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function QualitySkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats accuracy table */}
      <div className="bg-cream-50 rounded-2xl border border-white/20 overflow-hidden">
        <div className="h-11 border-b border-warm-100 bg-warm-50/30" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-warm-50 last:border-0">
            <div className={`w-28 h-3.5 ${pulse}`} />
            <div className="flex-1" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className={`w-16 h-3.5 ${pulseLight}`} />
            ))}
          </div>
        ))}
      </div>
      {/* Heatmap placeholder */}
      <div className="bg-cream-50 rounded-2xl border border-white/20 p-6">
        <div className={`w-40 h-3 ${pulse} mb-4`} />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className={`h-8 ${pulseLight} rounded`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Chart area */}
      <div className="bg-cream-50 rounded-2xl border border-white/20 p-6">
        <div className={`w-32 h-3 ${pulse} mb-4`} />
        <div className={`w-full h-[200px] ${pulseLight}`} />
      </div>
      {/* Error grouping */}
      <div className="bg-cream-50 rounded-2xl border border-white/20 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-warm-50 last:border-0">
            <div className={`w-16 h-5 ${pulseLight} rounded-full`} />
            <div className="flex-1 space-y-1.5">
              <div className={`w-64 h-3.5 ${pulse}`} />
              <div className={`w-32 h-2.5 ${pulseLight}`} />
            </div>
            <div className={`w-8 h-5 ${pulseLight} rounded-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN SKELETON (dispatches to sub-tab specific skeleton)
// ============================================================================

export function TracerSkeleton({ activeTab }: { activeTab?: TracerSubTab }) {
  return (
    <div className="space-y-6">
      {/* Status bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-warm-200 animate-pulse" />
          <div className={`w-32 h-3 ${pulse}`} />
        </div>
        <div className={`w-20 h-7 rounded-lg ${pulseLight}`} />
      </div>

      {/* Sub-tab nav skeleton */}
      <div className="flex items-center gap-1 p-1 bg-warm-100/50 rounded-xl w-fit">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`w-24 h-8 ${pulseLight} rounded-lg`} />
        ))}
      </div>

      {/* Tab content skeleton */}
      {(!activeTab || activeTab === 'health') && <HealthSkeleton />}
      {activeTab === 'rounds' && <RoundsSkeleton />}
      {activeTab === 'quality' && <QualitySkeleton />}
      {activeTab === 'errors' && <ErrorsSkeleton />}
    </div>
  );
}
