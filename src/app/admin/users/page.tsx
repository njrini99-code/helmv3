import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUsersTab } from '@/lib/admin/data/users';
import { Surface, StatTile, StatusPill, SearchField, Button } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelAllClear, PanelNoData } from '../_components/PanelStates';
import { SportBadge } from '../_components/SportBadge';
import { TeamHealthTable } from '../_components/TeamHealthTable';
import { AutoRefresh } from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : undefined;
  const role = typeof params.role === 'string' ? params.role : undefined;
  const team = typeof params.team === 'string' ? params.team : undefined;

  async function Body() {
    const tab = await fetchUsersTab({ q, role, team });
    const golfCount = tab.users.filter((u) => u.sports.includes('golf')).length;
    const baseballCount = tab.users.filter((u) => u.sports.includes('baseball')).length;

    return (
      <div className="space-y-6">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <SearchField
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search email…"
            aria-label="Search users by email"
            wrapperClassName="max-w-xs"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {q || role || team ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/users">Clear filters</Link>
            </Button>
          ) : null}
          {team ? (
            <span className="font-fw-mono text-xs text-warm-500">filtered to team {team}</span>
          ) : null}
        </form>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Total users" value={tab.users.length} tone="neutral" mono />
          <StatTile label="Golf" value={golfCount} tone="neutral" mono />
          <StatTile label="Baseball" value={baseballCount} tone="neutral" mono />
          <StatTile label="At-risk" value={tab.atRisk.length} tone="neutral" mono goodDirection="down" />
        </section>

        <Surface padding="sm">
          <SectionLabel>Users ({tab.users.length})</SectionLabel>
          <div className="mt-3">
            {tab.users.length === 0 ? (
              <PanelNoData
                label="No users match"
                description="Try a different search, or clear filters to see everyone."
              />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {tab.users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="min-w-0 flex-1 basis-full truncate font-medium text-warm-900 hover:underline sm:basis-auto"
                    >
                      {u.email}
                    </Link>
                    <span className="text-xs uppercase text-warm-500">{u.role}</span>
                    <div className="flex gap-1">
                      {u.sports.map((s) => (
                        <SportBadge key={s} sport={s} />
                      ))}
                    </div>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      {u.lastSeen ? `seen ${new Date(u.lastSeen).toLocaleDateString()}` : 'never seen'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>

        <Surface padding="sm">
          <SectionLabel>Teams ({tab.teams.length})</SectionLabel>
          <div className="mt-3">
            {tab.teams.length === 0 ? (
              <PanelNoData label="No teams yet" description="Teams appear here once a coach creates one." />
            ) : (
              <TeamHealthTable teams={tab.teams.map((t) => ({ ...t, href: `/admin/users?team=${t.teamId}` }))} />
            )}
          </div>
        </Surface>

        <Surface padding="sm" className="border-fw-warning/40">
          <SectionLabel>At-risk accounts ({tab.atRisk.length})</SectionLabel>
          <div className="mt-3">
            {tab.atRisk.length === 0 ? (
              <PanelAllClear label="No at-risk accounts" checkedAt={new Date().toISOString()} />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {tab.atRisk.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <StatusPill tone="warning" dot size="sm">
                      {u.lastSeen ? 'at-risk' : 'never seen'}
                    </StatusPill>
                    <Link href={`/admin/users/${u.id}`} className="min-w-0 flex-1 basis-full truncate text-warm-900 hover:underline sm:basis-auto">
                      {u.email}
                    </Link>
                    {/* CRM boundary: link OUT only — zero email capability here. */}
                    <a href="/golf/admin/crm" className="text-xs text-accent-700 underline">
                      Open in CRM →
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <PanelBoundary title="Users & Teams">
        <Body />
      </PanelBoundary>
    </div>
  );
}
