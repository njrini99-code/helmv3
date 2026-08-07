import { redirect } from 'next/navigation';
import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
import { fetchBridgeErrorBadge } from '@/lib/admin/data/overview';
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

  // AdminNativeGuard hides /admin from the iOS Capacitor shell (App Store
  // 4.2.2/3.1.1) — belt to the middleware's braces.
  return (
    <AdminMotionProvider>
      <AdminNativeGuard />
      <AdminShell email={probe.context.email} errorCount={errorCount}>
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
