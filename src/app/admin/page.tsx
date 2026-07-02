import { requireSuperAdmin } from '@/lib/admin/require-super-admin';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const admin = await requireSuperAdmin();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-xs uppercase tracking-widest text-warm-500">Helm Bridge</p>
      <h1 className="mt-2 text-3xl font-semibold text-warm-900">Command center online</h1>
      <p className="mt-4 text-sm text-warm-500">
        Signed in as {admin.email}. Panels arrive in W5.
      </p>
    </main>
  );
}
