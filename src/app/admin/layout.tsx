import { redirect } from 'next/navigation';
import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
import { fetchBridgeErrorBadge } from '@/lib/admin/data/overview';
import { fetchFeatureHealth, summarizeFeatureHealth } from '@/lib/admin/data/feature-health';
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

  // bridge-refit: the Health badge — count of RED features, via the SAME
  // rollup Overview's own Feature command map panel computes
  // (fetchFeatureHealth() + summarizeFeatureHealth(), React `cache()`-
  // memoised per request — see feature-health.ts's doc comment). On the
  // Overview page itself this is free: FeatureHealthPanel asks for the exact
  // same rollup on the exact same render, so the RPC + per-feature Sentry
  // sweep run once, not twice.
  //
  // COST NOTE for every OTHER /admin/* route (the 12 tabs that don't already
  // call fetchFeatureHealth() on their own page): this IS a genuinely new,
  // uncached cost paid on every navigation. When Sentry is configured,
  // fetchFeatureHealth() runs a ~15-round sequential per-feature Sentry
  // sweep (85 features, 6 concurrent workers — see fetchSentryFeatureCounts
  // in src/lib/admin/sentry-api.ts), and there is no success-path cooldown —
  // `featureCountCooldownUntil` is only set on FAILURE, never after a
  // healthy sweep. It can't be wrapped in the same `unstable_cache()` as
  // `fetchBridgeErrorBadge` above: `fetchFeatureHealth()` reads the
  // USER-scoped client (its RPC gates on `auth.uid()`), and
  // `unstable_cache()` cannot read cookies. Fail-soft to no badge rather
  // than let a broken pipeline throw here; the real fix is a service-role,
  // `unstable_cache()`-able red-count fetcher in feature-health.ts (flagged
  // to the file's owner — not edited here, out of this change's ownership).
  let healthCount = 0;
  try {
    const raw = await fetchFeatureHealth();
    healthCount = summarizeFeatureHealth(raw, new Date()).red;
  } catch {
    healthCount = 0;
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
