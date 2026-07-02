import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchAuthTab, fetchActiveSessions } from '@/lib/admin/data/auth';
import {
  StatusPill,
  MetricCard,
  TrendChart,
  InlineNotice,
  Surface,
  type FwStatusTone,
} from '@/components/fairway';
import { SessionsPanel } from '../_components/SessionsPanel';
import { SportBadge, type BridgeSport } from '../_components/SportBadge';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelAllClear, PanelNoData } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';

export const dynamic = 'force-dynamic';

// admin_events.severity → the same trio (dot + tone + label) used everywhere
// else severity renders — color is never the only channel.
const SEVERITY_TONE: Record<string, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

async function AuthBody() {
  const tab = await fetchAuthTab();
  const signInSeriesEmpty = tab.signInSeries.every((d) => d.y === 0);

  return (
    <div className="space-y-6">
      {tab.burst ? (
        <InlineNotice tone="danger" title="Failure burst detected">
          4 or more failed logins in the last 15 minutes — check the lockouts panel below.
        </InlineNotice>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Signups · 7d" value={tab.funnel.signups7d} />
        <MetricCard label="Activated within 7d" value={tab.funnel.activated7d} />
        <MetricCard
          label="Activation rate"
          value={Math.round(tab.funnel.activationRate * 1000) / 10}
          suffix="%"
          decimals={1}
        />
      </section>

      <TrendChart
        title="Sign-ins, last 7 days"
        overline="Auth activity"
        data={tab.signInSeries}
        state={signInSeriesEmpty ? 'empty' : 'ready'}
        height={180}
        variant="area"
      />

      <Surface padding="md">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Lockouts &amp; failed attempts
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
                    <span className="min-w-0 flex-1 basis-full truncate text-warm-900 sm:basis-auto">{l.email}</span>
                    <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                      {l.failed_attempts} failed
                    </span>
                    {isLocked && lockedUntilDate ? (
                      <span className="font-fw-mono text-xs tabular-nums text-fw-danger">
                        until {lockedUntilDate.toLocaleTimeString()}
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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Sign-in &amp; auth feed (7d)
        </h2>
        <div className="mt-3">
          {tab.feed.length === 0 ? (
            <PanelNoData
              label="No sign-in activity"
              description="No logins, signups, or security events in the last 7 days."
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
                  <span className="min-w-0 flex-1 basis-full truncate text-warm-900 sm:basis-auto">
                    {row.title}
                    {row.user_email ? ` — ${row.user_email}` : ''}
                  </span>
                  <SportBadge sport={(row.sport as BridgeSport) ?? null} />
                  <span className="font-fw-mono text-xs tabular-nums text-warm-500">
                    {new Date(row.created_at).toLocaleString()}
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

async function Sessions() {
  const sessions = await fetchActiveSessions();
  return (
    <Surface padding="md">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
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

export default async function AuthPage() {
  await requireSuperAdmin();
  return (
    <main className="space-y-6 p-6">
      <AutoRefresh />
      <PanelBoundary title="Auth & sign-ins">
        <AuthBody />
      </PanelBoundary>
      <PanelBoundary title="Active sessions">
        <Sessions />
      </PanelBoundary>
    </main>
  );
}
