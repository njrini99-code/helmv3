import { HelmMark } from '@/components/brand/HelmMark';

/**
 * Loading state for /golf/forgot-password.
 *
 * Mirrors AuthCanvas (src/components/auth/golf-auth-canvas.tsx), which
 * page.tsx renders: a flat `bg-canvas`, the app mark in the same position, one
 * grouped email row and the button. It matches ../login/loading.tsx. There is
 * no illustrated scene and no card.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[100dvh] flex-col bg-canvas"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
      }}
    >
      <span className="sr-only">Loading password reset form…</span>
      <div className="h-11 shrink-0" />
      <div className="mx-auto flex w-full max-w-[400px] flex-col items-center pt-[clamp(16px,9vh,88px)]">
        <HelmMark sport="golf" size={60} className="h-[60px] w-[60px]" priority />
        <div className="mt-5 h-[34px]" />
        <div className="mt-1.5 h-5" />
        <div className="mt-8 h-[52px] w-full rounded-xl bg-surface" />
        <div className="mt-6 h-[50px] w-full rounded-xl bg-accent-650" />
      </div>
    </div>
  );
}
