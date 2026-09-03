import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUsersTab } from '@/lib/admin/data/users';
import { Surface, StatusPill } from '@/components/fairway';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelNoData } from '../../_components/PanelStates';
import { SportBadge } from '../../_components/SportBadge';
import { LocalTime } from '../../_components/LocalTime';
import { AutoRefresh } from '../../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

const ROLE_TONE = { coach: 'accent', player: 'neutral', admin: 'success' } as const;

/**
 * Table-first user directory for the lens layer (brief §20-27: "Users:
 * table-first directory; User Journey Ribbon on detail"). Deliberately
 * lean — /admin/users already carries the full directory experience
 * (search, role/team filters, at-risk roster); this list exists to route
 * into the NEW per-user Journey Ribbon at /admin/lenses/users/[id], which
 * /admin/users/[id] does not render. See the Phase 4 PR body for the
 * overlap disclosure between the two directories.
 */
async function UsersLensBody() {
  const { users, totalUsersCount } = await fetchUsersTab({});
  const rows = users.slice(0, 100);

  return (
    <div className="space-y-6">
      <Surface padding="sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Users lens</p>
        <h2 className="mt-2 text-h3 font-semibold tracking-normal text-warm-900 md:text-2xl">User directory</h2>
        <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-warm-600 md:block">
          {rows.length} of {totalUsersCount} users shown, most recently active first. Open a user for their Journey
          Ribbon.
        </p>
      </Surface>

      <Surface padding="sm">
        <div className="divide-y divide-warm-200/60">
          {rows.length === 0 ? (
            <PanelNoData label="No users yet" description="" />
          ) : (
            rows.map((u) => (
              <Link
                key={u.id}
                href={`/admin/lenses/users/${u.id}`}
                className="flex items-center justify-between gap-3 rounded-fw-md px-2 py-3 transition-colors hover:bg-surface-sunken"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-warm-900">{u.email}</p>
                  <p className="font-fw-mono text-xs text-warm-500">
                    {u.lastSeen ? (
                      <>
                        last seen <LocalTime iso={u.lastSeen} variant="datetime" fallback="—" />
                      </>
                    ) : (
                      'never seen'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {u.sports.map((s) => (
                    <SportBadge key={s} sport={s} />
                  ))}
                  <StatusPill tone={ROLE_TONE[u.role as keyof typeof ROLE_TONE] ?? 'neutral'} size="sm">
                    {u.role}
                  </StatusPill>
                </div>
              </Link>
            ))
          )}
        </div>
      </Surface>
    </div>
  );
}

export default async function UsersLensPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PanelBoundary title="Users lens" skeleton={<PanelPageSkeleton rows={8} />}>
        <UsersLensBody />
      </PanelBoundary>
    </div>
  );
}
