import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchAuthTab, fetchActiveSessions, parseAuthFilters, type AuthTabFilters } from '@/lib/admin/data/auth';
import { fetchActivationFunnel } from '@/lib/admin/data/activation-funnel';
import {
  StatusPill,
  MetricCard,
  StatStrip,
  TrendChart,
  InlineNotice,
  Surface,
  SearchField,
  Button,
  type FwStatusTone,
} from '@/components/fairway';
import { SessionsPanel } from '../_components/SessionsPanel';
import { SportBadge, type BridgeSport } from '../_components/SportBadge';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelAllClear, PanelNoData } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { AuthFilterChips, type AuthFilterChip } from './AuthFilterChips';
import { ActivationRunway } from './ActivationRunway';

export const dynamic = 'force-dynamic';

// admin_events.severity → the same trio (dot + tone + label) used everywhere
// else severity renders — color is never the only channel.
const SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

const SPORT_CHIP_VALUES = ['golf', 'baseball', 'shared'] as const;
const EVENT_TYPE_CHIP_VALUES = ['login', 'signup', 'security'] as const;

function chipHref(current: URLSearchParams, param: string, value: string): string {
  const next = new URLSearchParams(current);
  if (next.get(param) === value) next.delete(param);
  else next.set(param, value);
  const qs = next.toString();
  return qs ? `/admin/auth?${qs}` : '/admin/auth';
}

function clearFiltersHref(): string {
  return '/admin/auth';
}

/** A user-linked cell — most rows carry a user_id (from admin_events, or
 *  resolved from login_attempts.email); some legacy/system rows don't, so the
 *  fallback renders the same text without a link rather than a dead link. */
function UserLink({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  if (!userId) return <>{children}</>;
  return (
    <Link href={`/admin/users/${userId}`} className="underline decoration-warm-300 hover:decoration-warm-600">
      {children}
    </Link>
  );
}

async function AuthBody({ filters }: { filters: AuthTabFilters }) {
  const tab = await fetchAuthTab(filters);
  const signInSeriesEmpty = tab.signInSeries.every((d) => d.y === 0);

  return (
    <div className="space-y-6">
      {tab.burst ? (
        <InlineNotice tone="danger" title="Failure burst detected">
          4 or more failed logins in the last 15 minutes — check the lockouts panel below.
        </InlineNotice>
      ) : null}

      {/* StatStrip (docs/MOBILE_DOCTRINE.md rule 11): below md this was a bare
          `grid` with no column count, so each MetricCard fell back to one
          full-bleed row — three stacked monolith cards on a 390px phone.
          StatStrip's count=3 phone shape (2-col + a full-width 3rd cell) plus
          mdColumns=3 reproduces the original `md:grid-cols-3` desktop recipe
          byte-for-byte, matching the same migration already done in
          admin/golf, admin/baseball, and admin/page.tsx. */}
      <StatStrip count={3} columns={3} mdColumns={3} ariaLabel="Signup funnel KPIs">
        <MetricCard label="Signups · 7d" value={tab.funnel.signups7d} tone="neutral" />
        <MetricCard label="Activated within 7d" value={tab.funnel.activated7d} tone="neutral" />
        <MetricCard
          label="Activation rate"
          value={Math.round(tab.funnel.activationRate * 1000) / 10}
          suffix="%"
          decimals={1}
          tone="neutral"
        />
      </StatStrip>

      <TrendChart
        title="Sign-ins, last 7 days"
        overline="Auth activity"
        data={tab.signInSeries}
        state={signInSeriesEmpty ? 'empty' : 'ready'}
        height={180}
        variant="area"
      />

      <Surface padding="md">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Lockouts &amp; failed attempts
          {tab.lockoutsTotal > tab.lockouts.length ? (
            <span className="ml-2 normal-case tracking-normal text-warm-400">
              (showing latest {tab.lockouts.length} of {tab.lockoutsTotal})
            </span>
          ) : null}
        </h2>
        <div className="mt-3">
          {tab.lockouts.length === 0 ? (
            <PanelAllClear
              label="No accounts with failed attempts"
              checkedAt={new Date().toISOString()}
            />
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {tab.lockouts.map((l) => {
                const lockedUntilDate = l.locked_until ? new Date(l.locked_until) : null;
                const isLocked = Boolean(lockedUntilDate && lockedUntilDate > new Date());
                return (
                  <li key={l.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <StatusPill tone={isLocked ? 'danger' : 'warning'} dot size="sm">
                      {isLocked ? 'locked' : 'failed'}
                    </StatusPill>
                    <span className="min-w-0 flex-1 basis-full break-words text-warm-900 [overflow-wrap:anywhere] sm:basis-auto">
                      <UserLink userId={l.user_id}>{l.email}</UserLink>
                    </span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      {l.failed_attempts} failed
                    </span>
                    {isLocked && lockedUntilDate ? (
                      <span className="font-fw-mono text-xs tabular-nums text-fw-danger">
                        until <LocalTime iso={lockedUntilDate.toISOString()} variant="time" />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Surface>

      <Surface padding="md">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Sign-in &amp; auth feed (7d)
          {tab.feedTotal > tab.feed.length ? (
            <span className="ml-2 normal-case tracking-normal text-warm-400">
              (showing latest {tab.feed.length} of {tab.feedTotal})
            </span>
          ) : null}
        </h2>
        <div className="mt-3">
          {tab.feed.length === 0 ? (
            <PanelNoData
              label="No sign-in activity"
              description="No logins, signups, or security events match the current filters."
            />
          ) : (
            <ul className="divide-y divide-warm-200/60">
              {tab.feed.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <StatusPill tone={SEVERITY_TONE[row.severity] ?? 'neutral'} dot size="sm">
                    {row.severity}
                  </StatusPill>
                  <span className="w-16 shrink-0 font-fw-mono text-eyebrow uppercase text-warm-500">
                    {row.event_type}
                  </span>
                  <span className="min-w-0 flex-1 basis-full break-words text-warm-900 [overflow-wrap:anywhere] sm:basis-auto">
                    {row.title}
                    {row.user_email ? (
                      <>
                        {' — '}
                        <UserLink userId={row.user_id}>{row.user_email}</UserLink>
                      </>
                    ) : null}
                  </span>
                  <SportBadge sport={(row.sport as BridgeSport) ?? null} />
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                    <LocalTime iso={row.created_at} variant="datetime" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Surface>
    </div>
  );
}

async function Runway() {
  const funnel = await fetchActivationFunnel();
  return (
    <Surface padding="md">
      <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
        First 7 days — signup to activation
      </h2>
      <div className="mt-4">
        <ActivationRunway golf={funnel.golf} baseball={funnel.baseball} />
      </div>
    </Surface>
  );
}

async function Sessions() {
  const sessions = await fetchActiveSessions();
  return (
    <Surface padding="md">
      <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
        Active sessions ({sessions.length})
      </h2>
      <div className="mt-3">
        {sessions.length === 0 ? (
          <PanelNoData
            label="No active sessions"
            description="Nobody is currently signed in with a live session."
          />
        ) : (
          <SessionsPanel sessions={sessions} />
        )}
      </div>
    </Surface>
  );
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const filters = parseAuthFilters(params);
  const current = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  );
  const hasActiveFilters = Boolean(filters.sport || filters.eventType || filters.q);

  const chips: AuthFilterChip[] = [
    ...SPORT_CHIP_VALUES.map((v) => ({
      key: `sport:${v}`,
      label: `sport: ${v}`,
      href: chipHref(current, 'sport', v),
      selected: filters.sport === v,
    })),
    ...EVENT_TYPE_CHIP_VALUES.map((v) => ({
      key: `eventType:${v}`,
      label: `type: ${v}`,
      href: chipHref(current, 'eventType', v),
      selected: filters.eventType === v,
    })),
  ];

  return (
    <div className="space-y-6">
      <AutoRefresh />

      <div className="space-y-3">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <SearchField
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Search email…"
            aria-label="Search auth events and lockouts by email"
            wrapperClassName="max-w-xs"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {hasActiveFilters ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={clearFiltersHref()}>Clear filters</Link>
            </Button>
          ) : null}
        </form>
        {/* Sport/event-type chips only narrow the feed below — login_attempts
            (Lockouts) has no sport/event_type column, only email, so those
            rows only respond to the search box above (a sport-less table by
            design — Lift Lab logins land here too). */}
        <AuthFilterChips chips={chips} ariaLabel="Filter the sign-in feed" />
      </div>

      <PanelBoundary title="Auth & sign-ins">
        <AuthBody filters={filters} />
      </PanelBoundary>
      <PanelBoundary title="First 7 days">
        <Runway />
      </PanelBoundary>
      <PanelBoundary title="Active sessions">
        <Sessions />
      </PanelBoundary>
    </div>
  );
}
