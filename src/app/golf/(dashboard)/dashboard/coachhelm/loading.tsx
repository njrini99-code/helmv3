'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'skeleton-shimmer bg-slate-200/60',
        className
      )}
    />
  );
}

function GlassCardSkeleton({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-glass',
        className
      )}
    >
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <SkeletonPulse className="w-10 h-10 rounded-xl" />
      <div className="space-y-2">
        <SkeletonPulse className="h-5 w-32 rounded" />
        <SkeletonPulse className="h-3 w-48 rounded" />
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <GlassCardSkeleton className="relative overflow-hidden">
      {/* Top accent bar */}
      <SkeletonPulse className="absolute top-0 left-0 right-0 h-1" />

      <HeaderSkeleton />

      {/* Main prediction */}
      <div className="flex justify-center my-8">
        <div className="text-center space-y-2">
          <SkeletonPulse className="h-4 w-24 rounded mx-auto" />
          <SkeletonPulse className="h-14 w-20 rounded mx-auto" />
        </div>
      </div>

      {/* Range bar */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between">
          <SkeletonPulse className="h-3 w-20 rounded" />
          <SkeletonPulse className="h-3 w-24 rounded" />
        </div>
        <SkeletonPulse className="h-3 w-full rounded-full" />
      </div>

      {/* Key factors */}
      <div className="space-y-2">
        <SkeletonPulse className="h-3 w-20 rounded" />
        {[1, 2, 3].map((i) => (
          <SkeletonPulse key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function FocusAreasSkeleton() {
  return (
    <GlassCardSkeleton>
      <HeaderSkeleton />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-white/30 bg-white/50 space-y-3"
          >
            <div className="flex items-center gap-2">
              <SkeletonPulse className="w-8 h-8 rounded-lg" />
              <div className="space-y-1 flex-1">
                <SkeletonPulse className="h-4 w-24 rounded" />
                <SkeletonPulse className="h-3 w-16 rounded" />
              </div>
            </div>
            <SkeletonPulse className="h-8 w-20 rounded" />
            <SkeletonPulse className="h-2 w-full rounded-full" />
            <SkeletonPulse className="h-3 w-full rounded" />
            <SkeletonPulse className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function InsightsPanelSkeleton() {
  return (
    <GlassCardSkeleton>
      <HeaderSkeleton />

      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="relative rounded-xl border border-slate-200/60 bg-white/50 p-4 overflow-hidden"
          >
            <SkeletonPulse className="absolute top-0 left-0 right-0 h-0.5" />
            <div className="flex items-start gap-3">
              <SkeletonPulse className="w-9 h-9 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <SkeletonPulse className="h-4 w-3/4 rounded" />
                <SkeletonPulse className="h-3 w-full rounded" />
                <SkeletonPulse className="h-3 w-2/3 rounded" />
                <div className="flex items-center gap-2 mt-2">
                  <SkeletonPulse className="h-3 w-20 rounded" />
                  <SkeletonPulse className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

function RecentRoundsSkeleton() {
  return (
    <GlassCardSkeleton>
      <div className="flex items-center justify-between mb-4">
        <HeaderSkeleton />
        <SkeletonPulse className="h-4 w-20 rounded" />
      </div>

      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/50 border border-white/30"
          >
            <SkeletonPulse className="w-14 h-14 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <SkeletonPulse className="h-4 w-40 rounded" />
              <div className="flex items-center gap-3">
                <SkeletonPulse className="h-3 w-16 rounded" />
                <SkeletonPulse className="h-3 w-20 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCardSkeleton>
  );
}

export default function CoachHelmLoading() {
  return (
    <div className="min-h-full">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Header skeleton */}
      <div className="relative border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SkeletonPulse className="w-12 h-12 rounded-xl" />
              <div className="space-y-2">
                <SkeletonPulse className="h-6 w-36 rounded" />
                <SkeletonPulse className="h-4 w-48 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SkeletonPulse className="h-7 w-24 rounded-full" />
              <SkeletonPulse className="h-4 w-28 rounded hidden sm:block" />
              <SkeletonPulse className="w-8 h-8 rounded-lg" />
              <SkeletonPulse className="w-8 h-8 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content skeleton */}
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        {/* Section toggle skeleton */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          <SkeletonPulse className="h-11 w-60 rounded-xl" />
        </motion.div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <StatCardSkeleton />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <FocusAreasSkeleton />
            </motion.div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <InsightsPanelSkeleton />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <RecentRoundsSkeleton />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
