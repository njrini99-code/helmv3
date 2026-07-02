import { redirect } from 'next/navigation';
import { checkSuperAdminAccess } from '@/lib/admin/require-super-admin';
import { AdminNativeGuard } from '@/components/golf/AdminNativeGuard';
import { AdminMotionProvider } from './_motion-provider';
import { AdminShell } from './_components/AdminShell';

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

  // AdminNativeGuard hides /admin from the iOS Capacitor shell (App Store
  // 4.2.2/3.1.1) — belt to the middleware's braces.
  return (
    <AdminMotionProvider>
      <AdminNativeGuard />
      <AdminShell email={probe.context.email}>{children}</AdminShell>
    </AdminMotionProvider>
  );
}
