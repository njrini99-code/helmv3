import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { verifyViewAsToken, VIEW_AS_COOKIE } from '@/lib/admin/view-as';
import { fetchUserDetail } from '@/lib/admin/data/users';
import { Surface } from '@/components/fairway';
import { ViewAsBanner } from '../../../_components/ViewAsBanner';
import { SportBadge } from '../../../_components/SportBadge';
import { PanelNoData } from '../../../_components/PanelStates';

export const dynamic = 'force-dynamic';

/**
 * READ-ONLY impersonation surface. Requires BOTH the super-admin gate AND a
 * live signed token for THIS user id. Renders the user's world from gated
 * service-role reads — zero mutation affordances exist on this page (the
 * only interactive control anywhere on it is the banner's "Exit view-as"),
 * and no session for the target user is ever created.
 */
export default async function ViewAsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;

  const cookieStore = await cookies();
  const token = verifyViewAsToken(
    cookieStore.get(VIEW_AS_COOKIE)?.value,
    process.env.ADMIN_IMPERSONATION_SECRET,
    new Date(),
  );
  if (!token.valid || token.targetUserId !== id) {
    redirect(`/admin/users/${id}`); // expired, tampered, or mismatched — re-enter explicitly
  }

  const detail = await fetchUserDetail(id);
  if (!detail.user) redirect('/admin/users');
  const user = detail.user;

  return (
    <main className="space-y-4 p-6">
      <ViewAsBanner email={user.email} expiresAtMs={token.expiresAtMs} />

      <Surface padding="sm">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Their teams</h2>
        <div className="mt-3">
          {detail.memberships.length === 0 ? (
            <PanelNoData
              label="No team memberships"
              description="This user isn't on a roster or coaching staff."
            />
          ) : (
            <ul className="space-y-1.5">
              {detail.memberships.map((m) => (
                <li key={`${m.sport}:${m.teamId}`} className="flex items-center gap-2 text-sm text-warm-800">
                  <SportBadge sport={m.sport} /> {m.teamName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Surface>

      <Surface padding="sm">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Their recent activity</h2>
        <div className="mt-3">
          {detail.recentActivity.length === 0 ? (
            <PanelNoData label="No recent activity" description="Nothing logged yet for this user." />
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {detail.recentActivity.map((a, i) => (
                <li key={i} className="py-1.5 text-sm text-warm-800">
                  {a.label}
                  <span className="ml-2 font-fw-mono text-xs text-warm-500">
                    {new Date(a.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Surface>
    </main>
  );
}
