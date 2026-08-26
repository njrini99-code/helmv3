import { redirect } from 'next/navigation';
import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
import { fetchBridgeErrorBadge } from '@/lib/admin/data/overview';
import { fetchFeatureHealthRedCount } from '@/lib/admin/data/feature-health';
import { AdminNativeGuard } from '@/components/golf/AdminNativeGuard';
import { AdminMotionProvider } from './_motion-provider';
import { AdminShell } from './_components/AdminShell';
import { ThemeApplier } from '@/components/golf/theme/ThemeApplier';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layer 2 — first line, before ANY data access. Layout uses the
  // non-throwing probe so denial is a clean redirect, not a 500.
  const probe = await checkSuperAdminAccess();
  if (!probe.allowed) {
    redirect(probe.reason === 'unauthenticated' ? '/golf/login' : '/golf/dashboard');
  }

  // M1 (bridge-chrome): the mobile bottom bar's Errors badge — a single
  // cheap COUNT (see fetchBridgeErrorBadge's doc comment), re-resolved on
  // every navigation + `router.refresh()` under this force-dynamic layout.
  const errorCount = await fetchBridgeErrorBadge();

  // bridge-refit: the Health badge — count of RED features. This layout
  // re-executes on EVERY navigation AND every `<AutoRefresh />` tick (30s on
  // admin/page.tsx, 60s on the tracer), so an idle open Bridge tab polls this
  // continuously — it previously called fetchFeatureHealth(), whose dominant
  // cost is a ~15-round sequential per-feature Sentry sweep (85 features, 6
  // concurrent workers) with no success-path cooldown. `fetchFeatureHealthRedCount()`
  // (feature-health.ts) is the DB-only subset: one get_feature_health() RPC
  // call, zero Sentry round-trips, and PROVABLY the same red count — see its
  // doc comment for why the classifier's RED branch never depends on Sentry
  // data. It still can't be wrapped in `unstable_cache()` like
  // `fetchBridgeErrorBadge` above (the RPC gates on `auth.uid()` via the
  // USER-scoped client, which `unstable_cache()` cannot read cookies for),
  // but the per-navigation cost is now one cheap RPC, not an external API
  // fan-out.
  //
  // Honest-only: `null` — never `0` — means "couldn't find out", so a
  // degraded/failed pipeline can never render as a clean badge (the bug this
  // replaces: `catch { healthCount = 0 }` made a rate-limited Sentry sweep
  // indistinguishable from "0 red features"). AdminShell only shows a badge
  // when the count is a positive number.
  let healthCount: number | null = null;
  try {
    healthCount = await fetchFeatureHealthRedCount();
  } catch {
    healthCount = null;
  }

  // AdminNativeGuard hides /admin from the iOS Capacitor shell (App Store
  // 4.2.2/3.1.1) — belt to the middleware's braces.
  return (
    <AdminMotionProvider>
      <AdminNativeGuard />
      <AdminShell email={probe.context.email} errorCount={errorCount} healthCount={healthCount}>
        {/* Same mount as the golf dashboard shell (src/app/golf/(dashboard)/
            layout.tsx): keeps the root-head ThemeScript boot hydrated and
            OS-followed at runtime, including when the Bridge is entered by
            soft navigation. The Bridge deliberately shares the `golf_theme`
            preference rather than adding a second toggle to forget — the
            token flip is the same one, and /admin is already 100% on the
            same warm and fw token scales the .dark block inverts. */}
        <ThemeApplier />
        {children}
      </AdminShell>
    </AdminMotionProvider>
  );
}
