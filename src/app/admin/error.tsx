'use client';

import { RouteErrorBoundary } from '@/components/errors';

/**
 * Helm Bridge root error boundary.
 *
 * Every panel inside the Bridge already degrades gracefully via
 * `PanelBoundary` (src/app/admin/_components/PanelBoundary.tsx) — one
 * upstream hiccup scopes to a single amber card, never the whole console.
 * But nothing upstream of a panel was protected: a throw at the very top of
 * a page component (e.g. a bare `await requireSuperAdmin()` in
 * `AdminOverviewPage` / `TracerPage` before any `<PanelBoundary>` is
 * reached), or anywhere else in an /admin page.tsx or nested layout outside
 * a panel, had zero local boundary and fell all the way to the generic
 * cross-product `src/app/error.tsx` (non-Fairway chrome, "Baseball
 * Dashboard" style CTAs — wrong console for a super-admin).
 *
 * Reuses the same Fairway-tokened `RouteErrorBoundary` the golf Fairway
 * shell uses (see src/app/golf/(dashboard)/error.tsx) so the degraded state
 * still looks like Helm Bridge, not a foreign product.
 *
 * NOTE (Next.js boundary scope): error.tsx does NOT catch throws in
 * `layout.tsx` of this SAME folder (src/app/admin/layout.tsx) — only in
 * nested layouts/pages below it. A throw from `checkSuperAdminAccess()` in
 * that layout still bubbles to the root `src/app/error.tsx`. That layout only
 * ever *redirects* on auth failure (a Next.js control-flow throw, not a real
 * error) — a genuine failure there (e.g. Supabase down) is the one remaining
 * gap, sized in the W9 report as a follow-up, not fixed here.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/admin"
      component="HelmBridge"
      title="Helm Bridge hit a snag"
      message="Something outside a panel failed to render. Try again, or head back to the command center."
      homePath="/admin"
    />
  );
}
