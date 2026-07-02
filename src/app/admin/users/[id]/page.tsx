import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUserDetail } from '@/lib/admin/data/users';
import { fetchActiveSessions } from '@/lib/admin/data/auth';
import { Surface, StatusPill, Button, type FwStatusTone } from '@/components/fairway';
import { SessionsPanel } from '../../_components/SessionsPanel';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelNoData } from '../../_components/PanelStates';
import { SportBadge } from '../../_components/SportBadge';
import { enterViewAs } from '../../actions/view-as';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">{children}</h2>;
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;

  async function Body() {
    const detail = await fetchUserDetail(id);
    if (!detail.user) {
      return <PanelNoData label="User not found" description={`No user with id ${id}.`} />;
    }
    const user = detail.user;
    const sessions = (await fetchActiveSessions()).filter((s) => s.user_id === id);
    const enterViewAsForUser = enterViewAs.bind(null, id);
    const viewAsConfigured = Boolean(process.env.ADMIN_IMPERSONATION_SECRET);

    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-warm-900">{user.email}</h1>
              {user.sports.map((s) => (
                <SportBadge key={s} sport={s} />
              ))}
            </div>
            <p className="font-fw-mono text-xs tabular-nums text-warm-500">
              {user.role} · joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'} · last
              seen {user.lastSeen ? new Date(user.lastSeen).toLocaleString() : 'never'}
            </p>
          </div>
          {viewAsConfigured ? (
            <form action={enterViewAsForUser}>
              <Button type="submit" variant="secondary" size="sm">
                View as (read-only, 15 min)
              </Button>
            </form>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled title="ADMIN_IMPERSONATION_SECRET is not set">
              View as — not configured
            </Button>
          )}
        </header>

        <Surface padding="sm">
          <SectionLabel>Memberships</SectionLabel>
          <div className="mt-3">
            {detail.memberships.length === 0 ? (
              <PanelNoData
                label="No team memberships"
                description="This user isn't on a roster or coaching staff yet."
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

        <div className="grid gap-4 md:grid-cols-2">
          <Surface padding="sm">
            <SectionLabel>Recent auth events</SectionLabel>
            <div className="mt-3">
              {detail.authEvents.length === 0 ? (
                <PanelNoData
                  label="No auth events"
                  description="No logins, signups, or security events recorded for this user."
                />
              ) : (
                <ul className="divide-y divide-warm-200/60">
                  {detail.authEvents.map((e) => (
                    <li key={e.id} className="py-1.5 text-sm text-warm-800">
                      {e.title}
                      <span className="ml-2 font-fw-mono text-xs text-warm-500">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Surface>
          <Surface padding="sm">
            <SectionLabel>Error events</SectionLabel>
            <div className="mt-3">
              {detail.errorEvents.length === 0 ? (
                <PanelNoData label="No error events" description="Nothing filed against this user." />
              ) : (
                <ul className="divide-y divide-warm-200/60">
                  {detail.errorEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <StatusPill tone={SEVERITY_TONE[e.severity] ?? 'neutral'} dot size="sm">
                        {e.severity}
                      </StatusPill>
                      {e.fingerprint ? (
                        <Link
                          href={`/admin/errors/${e.fingerprint}`}
                          className="min-w-0 flex-1 truncate text-warm-800 hover:underline"
                        >
                          {e.title}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-warm-800">{e.title}</span>
                      )}
                      <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Surface>
        </div>

        <Surface padding="sm">
          <SectionLabel>Active sessions</SectionLabel>
          <div className="mt-3">
            {sessions.length === 0 ? (
              <PanelNoData label="No active sessions" description="This user isn't currently signed in anywhere." />
            ) : (
              <SessionsPanel sessions={sessions} />
            )}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <PanelBoundary title="User detail">
        <Body />
      </PanelBoundary>
    </main>
  );
}
