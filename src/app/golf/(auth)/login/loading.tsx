'use client';

import Image from 'next/image';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';

/**
 * Loading skeleton for /golf/login.
 *
 * Mirrors the real page's composition exactly — one painted scene per
 * viewport (mobile CourseScene / desktop CoastalScene, same 768px switch
 * and `idSuffix` pattern as `page.tsx`), the brand lockup, and the
 * top-aligned cream form card (same position, radius, fill, border and
 * shadow as the real card) — instead of the previous flat green gradient
 * with a vertically-centered gray `glass-standard` card, which popped on
 * swap.
 */
export default function Loading() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="relative overflow-hidden" style={{ height: '100dvh' }}>
      {isDesktop ? (
        <CoastalScene idSuffix="login-loading-coastal" />
      ) : (
        <CourseScene idSuffix="login-loading" />
      )}

      <div
        className="relative z-10 h-full flex flex-col items-center px-5"
        style={{
          paddingTop: 'max(2.5rem, calc(env(safe-area-inset-top) + 1.75rem))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        {/* Brand lockup */}
        <div className="flex flex-col items-center gap-2.5 shrink-0">
          <Image
            src="/helm-golf-logo-transparent.png"
            alt=""
            width={64}
            height={64}
            className="object-contain"
            priority
            style={{ filter: 'drop-shadow(0 1px 3px rgba(60,40,20,0.22))' }}
          />
          <div className="skeleton-shimmer h-7 w-36 rounded-lg bg-warm-900/10" />
        </div>

        {/* Form card — same position, radius, fill, border and shadow as the real card */}
        <div
          className="w-full max-w-[420px] mt-5 shrink-0"
          style={{
            padding: '22px 20px 18px',
            background: 'rgba(255, 253, 245, 0.94)',
            borderRadius: 24,
            border: '0.5px solid rgba(255,255,255,0.9)',
            boxShadow:
              '0 20px 50px rgba(60, 40, 20, 0.18), 0 4px 12px rgba(60, 40, 20, 0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
          }}
        >
          <div className="flex justify-center">
            <div className="skeleton-shimmer h-6 w-40 rounded-lg bg-warm-900/10" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="skeleton-shimmer h-3.5 w-16 rounded bg-warm-900/8" />
            <div className="skeleton-shimmer h-11 w-full rounded-xl bg-warm-900/8" />
            <div className="skeleton-shimmer h-3.5 w-16 rounded bg-warm-900/8" />
            <div className="skeleton-shimmer h-11 w-full rounded-xl bg-warm-900/8" />
            <div className="skeleton-shimmer h-11 w-full rounded-xl mt-2 bg-primary-600/15" />
          </div>
        </div>

        <div className="flex-1" />
      </div>
    </div>
  );
}
