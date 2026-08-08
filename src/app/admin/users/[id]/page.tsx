import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchUserDetail } from '@/lib/admin/data/users';
import { fetchActiveSessions } from '@/lib/admin/data/auth';
import { Surface, StatusPill, Button, Skeleton, type FwStatusTone } from '@/components/fairway';
import { SessionsPanel } from '../../_components/SessionsPanel';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelNoData } from '../../_components/PanelStates';
import { SportBadge } from '../../_components/SportBadge';
import { LocalTime } from '../../_components/LocalTime';
import { enterViewAs } from '../../actions/view-as';
import { EngagementPanel } from './EngagementPanel';
import { ViewAsButton } from './ViewAsButton';

export const dynamic = 'force-dynamic';

// EngagementPanel renders its own <Surface> with a dateline rule, a heading,
// and the 112px engagement ring beside a pill + two caption lines — reserve
// exactly that so the ring does not shove the memberships panel down on swap.
const ENGAGEMENT_SKELETON = (
  <Surface padding="sm">
    <Skeleton className="mb-3 h-[2px] w-7 rounded-full" />
    <Skeleton className="h-3 w-24" />
    <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
      <Skeleton circle className="h-28 w-28 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
    </div>
  </Surface>
);

const SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

// `fetchUserDetail`'s `recentActivity` is cross-sport (golf rounds + Lift Lab
// sessions) — kinds map 1:1 to the two queries that feed it in `users.ts`.
const ACTIVITY_KIND_LABEL: Record<string, string> = { round: 'Round', lift: 'Lift' };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
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
    // Server-side filter (SQL WHERE, before the RPC's internal LIMIT 500) —
    // a client-side filter of the platform-wide top-500 window would
    // silently show "No active sessions" for a user outside that window.
    const sessions = await fetchActiveSessions(id);
    const enterViewAsForUser = enterViewAs.bind(null, id);
    const viewAsConfigured = Boolean(process.env.ADMIN_IMPERSONATION_SECRET);

    return (
      <div className="space-y-6">
        {/* Stacks below `sm`. Side-by-side, the "View as (read-only, 15 min)"
            button took roughly half the row and squeezed the identity block
            into a ~150px column — the meta line then wrapped to FOUR lines
            ("player · joined / 5/28/2026 · last / seen 7/23/2026, / 4:53:02 PM")
            and the email truncated to "kcentenoglen…". On an admin tool the
            email IS the identity, so that is the one string that must not be
            the thing that gets sacrificed. MOBILE_DOCTRINE rule 2: mastheads
            condense on phone rather than compete for the row. `md`+ is
            unchanged. */}
        <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* `min-w-0` on the h1 itself — it's a flex item of THIS inner
                  row (nested inside the outer `min-w-0 flex-1` header cell),
                  so without its own min-w-0 the default min-width:auto keeps
                  it pinned to the email's full un-clipped width, and
                  `truncate` never engages for a long address.

                  On phone it WRAPS instead of truncating: a full-width row has
                  the space, and a half-shown address is useless for the one
                  job this page has. `sm:truncate` restores the desktop
                  single-line treatment, where the h1 shares its row. */}
              <h1 className="min-w-0 break-all text-xl font-semibold text-warm-900 sm:break-normal sm:truncate">
                {user.email}
              </h1>
              {user.sports.map((s) => (
                <SportBadge key={s} sport={s} />
              ))}
            </div>
            <p className="font-fw-mono text-xs tabular-nums text-warm-500">
              {user.role} · joined{' '}
              {user.createdAt ? <LocalTime iso={user.createdAt} variant="date" fallback="—" /> : '—'} · last seen{' '}
              {user.lastSeen ? <LocalTime iso={user.lastSeen} variant="datetime" fallback="never" /> : 'never'}
            </p>
          </div>
          {viewAsConfigured ? (
            <ViewAsButton onEnter={enterViewAsForUser} />
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled title="ADMIN_IMPERSONATION_SECRET is not set">
              View as — not configured
            </Button>
          )}
        </header>

        <PanelBoundary title="Engagement" skeleton={ENGAGEMENT_SKELETON}>
          <EngagementPanel userId={id} />
        </PanelBoundary>

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

        {/* The two event lists below use `break-words sm:truncate`, not
            `truncate`. `truncate` implies `white-space: nowrap`, and these
            labels are log lines — "[getPlayerProfile] No completed rounds found
            for this player". On a phone the label already gets its own line via
            `basis-full`, so nowrap bought nothing and cost the whole message:
            the text ran under the right edge and was clipped by the
            `overflow-x: clip` on html/body (globals.css:182-188), cut mid-word
            with no ellipsis to even signal something had been hidden. Wrapping
            makes the line readable, which is the only reason these panels
            exist. `sm:truncate` keeps the desktop one-line-per-event density
            exactly as it was. */}
        <Surface padding="sm">
          <SectionLabel>Recent activity</SectionLabel>
          <div className="mt-3">
            {detail.recentActivity.length === 0 ? (
              <PanelNoData
                label="No recent activity"
                description="No rounds or lifting sessions logged for this user yet."
              />
            ) : (
              <ul className="divide-y divide-warm-200/60">
                {detail.recentActivity.map((a, i) => (
                  <li key={`${a.kind}:${a.at}:${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                    <span className="w-14 shrink-0 font-fw-mono text-eyebrow uppercase text-warm-500">
                      {ACTIVITY_KIND_LABEL[a.kind] ?? a.kind}
                    </span>
                    <span className="min-w-0 flex-1 basis-full break-words text-warm-800 sm:truncate sm:basis-auto">{a.label}</span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      <LocalTime iso={a.at} variant="datetime" />
                    </span>
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
                        <LocalTime iso={e.created_at} variant="datetime" />
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
                    <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                      <StatusPill tone={SEVERITY_TONE[e.severity] ?? 'neutral'} dot size="sm">
                        {e.severity}
                      </StatusPill>
                      {e.fingerprint ? (
                        <Link
                          href={`/admin/errors/${e.fingerprint}`}
                          className="min-w-0 flex-1 basis-full break-words text-warm-800 sm:truncate hover:underline sm:basis-auto"
                        >
                          {e.title}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 basis-full break-words text-warm-800 sm:truncate sm:basis-auto">{e.title}</span>
                      )}
                      <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                        <LocalTime iso={e.created_at} variant="datetime" />
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
    <div className="space-y-6">
      <PanelBoundary title="User detail" skeleton={<PanelPageSkeleton stats={3} rows={6} />}>
        <Body />
      </PanelBoundary>
    </div>
  );
}
