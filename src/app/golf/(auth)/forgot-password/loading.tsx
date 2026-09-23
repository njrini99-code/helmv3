'use client';

import Image from 'next/image';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { useMediaQuery } from '@/hooks/use-media-query';

/**
 * Loading skeleton for /golf/forgot-password.
 *
 * page.tsx renders `<GolfAuthShell>` (GolfAuthShell.tsx), which paints: one
 * scene per viewport via a `useMediaQuery('(min-width: 768px)')` switch
 * (GolfAuthShell.tsx:36) at the same 768px breakpoint — CoastalScene on
 * desktop, CourseScene on mobile/native (GolfAuthShell.tsx:80); the brand
 * lockup (GolfAuthShell.tsx:90-124, logo GolfAuthShell.tsx:104-110 + the
 * "GolfHelm" wordmark h1 GolfAuthShell.tsx:112-123); and a top-aligned cream
 * form card (GolfAuthShell.tsx:127-162) at radius 24 / `rgba(255,253,245,0.94)`
 * fill / matching border+shadow (GolfAuthShell.tsx:137-141). At t=0 (`success`
 * defaults false, page.tsx:19) the card holds the "Reset your password"
 * heading and its subheading (page.tsx:88,92), then one email field and the
 * submit button (page.tsx:133-150).
 *
 * This previously rendered a centered `bg-auth-golf` wash with a
 * `glass-standard`/`rounded-2xl` (16px) card — matching neither the shell's
 * top-aligned layout, its painted scene, nor the real card's position or
 * radius. Mirrors the already-corrected `../login/loading.tsx`, which uses
 * the same `GolfAuthShell`.
 */
export default function Loading() {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div className="relative overflow-hidden" style={{ height: '100dvh' }}>
      {isDesktop ? (
        <CoastalScene idSuffix="forgot-password-loading-coastal" />
      ) : (
        <CourseScene idSuffix="forgot-password-loading" />
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
          <div className="flex flex-col items-center gap-1.5">
            <div className="skeleton-shimmer h-6 w-44 rounded-lg bg-warm-900/10" />
            <div className="skeleton-shimmer h-3.5 w-56 rounded bg-warm-900/8" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="skeleton-shimmer h-3.5 w-14 rounded bg-warm-900/8" />
            <div className="skeleton-shimmer h-11 w-full rounded-xl bg-warm-900/8" />
            <div className="skeleton-shimmer h-11 w-full rounded-xl mt-2 bg-primary-600/15" />
          </div>
        </div>

        <div className="flex-1" />

        <span role="status" aria-busy="true" className="sr-only">
          Loading password reset form…
        </span>
      </div>
    </div>
  );
}
