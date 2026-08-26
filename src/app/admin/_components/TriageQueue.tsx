'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, CheckCheck } from 'lucide-react';
import { Button, Sparkline, StatusPill } from '@/components/fairway';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';
import { hasUnknownAffectedUsers } from '@/lib/admin/incident-report';
import { resolveTriageEvents } from '@/app/admin/actions/triage';
import { resolveSentryIssueAction } from '@/app/admin/actions/sentry-resolve';
import { SportBadge } from './SportBadge';
import { PanelAllClear } from './PanelStates';
import { LocalTime } from './LocalTime';
import { CopyReportButton } from './CopyReportButton';

const SENTRY_KEY_PREFIX = 'sentry:';
const APP_KEY_PREFIX = 'app:';

const SEVERITY_TONE: Record<TriageSeverity, 'danger' | 'warning' | 'neutral' | 'info'> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

/**
 * "0 users" reads as "this affected nobody," which is misleading for `app`
 * incidents: affectedUsers there is a count of DISTINCT KNOWN identities
 * (user_id/user_email), so 0 usually means the failure happened before/
 * outside auth (anonymous, system/cron, or identity wasn't wired into the
 * observed-action call) — not that zero people were impacted. Sentry-origin
 * items use Sentry's own userCount, which IS a real zero-means-zero metric,
 * so only `app` incidents get the "unknown" wording.
 */
export function affectedUsersLabel(item: Pick<TriageItem, 'origin' | 'affectedUsers' | 'occurrences'>): string {
  if (hasUnknownAffectedUsers(item.origin === 'sentry', item.affectedUsers, item.occurrences)) {
    return 'unknown user';
  }
  const n = item.affectedUsers;
  return `${n} user${n === 1 ? '' : 's'}`;
}

export function TriageQueue({
  items,
  onResolve = resolveTriageEvents,
  onResolveSentry = resolveSentryIssueAction,
  appHourlyBuckets = {},
  sentryStats24h = {},
}: {
  items: TriageItem[];
  onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>;
  onResolveSentry?: (issueId: string) => Promise<{ ok: boolean; error?: string; unconfigured?: boolean }>;
  /** fingerprint (or `row:<id>`) → rolling 24h hourly histogram — see
   *  @/lib/admin/data/errors's computeAppHourlyBuckets. Omitted (the
   *  Overview triage panel, which doesn't fetch this) simply renders no
   *  sparkline for app rows; the count/last-seen text is unaffected. */
  appHourlyBuckets?: Record<string, number[]>;
  /** Sentry issue id → that issue's own baked-in 24h stats (`SentryIssue.
   *  stats24h`), keyed by the caller from its separate Sentry pull. */
  sentryStats24h?: Record<string, ReadonlyArray<readonly [number, number]>>;
}) {
  const router = useRouter();
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [, startTransition] = useTransition();

  const visible = items.filter((i) => !hiddenKeys.has(i.key));

  if (visible.length === 0) {
    return (
      <PanelAllClear
        label="Nothing in the queue — no unresolved incidents"
        checkedAt={new Date().toISOString()}
      />
    );
  }

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  function restore(key: string, message: string) {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setErrors((prev) => {
      const next = new Map(prev);
      next.set(key, message);
      return next;
    });
  }

  function resolve(item: TriageItem) {
    // Optimistic: hide now; refresh reconciles. Resolution is idempotent
    // (resolve_admin_event only touches resolved=false rows). If the action
    // rejects (e.g. requireSuperAdmin() throws on a dead session, or the RPC
    // errors) the row is restored and the failure surfaced — an admin must
    // never believe an incident was resolved when it wasn't.
    clearError(item.key);
    setHiddenKeys((prev) => new Set([...prev, item.key]));
    startTransition(() => {
      void onResolve(item.eventIds)
        .then(() => {
          router.refresh();
        })
        .catch((err: unknown) => {
          restore(item.key, err instanceof Error ? err.message : 'Failed to resolve — try again');
        });
    });
  }

  /**
   * Sentry-origin counterpart to `resolve` above — same optimistic-hide/
   * restore-on-failure shape, using resolveSentryIssueAction instead of
   * resolveTriageEvents. `unconfigured` and an ordinary failure render
   * identically (both are "the Bridge can't do this yet" from an operator's
   * chair) via the same inline error text `resolve` already uses.
   */
  function resolveSentry(item: TriageItem) {
    const issueId = item.key.slice(SENTRY_KEY_PREFIX.length);
    clearError(item.key);
    setHiddenKeys((prev) => new Set([...prev, item.key]));
    startTransition(() => {
      void onResolveSentry(issueId)
        .then((result) => {
          if (!result.ok) {
            restore(item.key, result.error ?? 'Failed to resolve in Sentry — try again');
            return;
          }
          router.refresh();
        })
        .catch((err: unknown) => {
          restore(item.key, err instanceof Error ? err.message : 'Failed to resolve — try again');
        });
    });
  }

  /** Per-row 24h series for the sparkline, or `null` to render none. Never a
   *  series shorter than 2 finite points — Sparkline's own honesty contract
   *  would otherwise draw a fixed-size "not enough data" em-dash box on
   *  every row lacking real history, which is noise in a dense queue. */
  function rowSparkline(item: TriageItem): number[] | null {
    const series =
      item.origin === 'sentry'
        ? sentryStats24h[item.key.slice(SENTRY_KEY_PREFIX.length)]?.map(([, count]) => count)
        : appHourlyBuckets[item.key.slice(APP_KEY_PREFIX.length)];
    return series && series.length >= 2 ? series : null;
  }

  function detailLine(item: TriageItem): string | null {
    const parts = [
      item.source ? `source ${item.source}` : null,
      item.feature ? `feature ${item.feature}` : null,
      item.actionName ? `action ${item.actionName}` : null,
      item.route ? `route ${item.route}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  return (
    <ul className="divide-y divide-warm-200/60">
      {visible.map((item) => {
        const series = rowSparkline(item);
        return (
        <li key={item.key} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-3">
          <StatusPill tone={SEVERITY_TONE[item.severity]} dot size="sm">
            {item.severity}
          </StatusPill>
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            {item.origin === 'app' ? (
              <Link
                href={`/admin/errors/${item.key.slice(4)}`}
                className="block break-words text-sm font-medium text-warm-900 [overflow-wrap:anywhere] hover:underline"
              >
                {item.title}
              </Link>
            ) : (
              <p className="break-words text-sm font-medium text-warm-900 [overflow-wrap:anywhere]">{item.title}</p>
            )}
            <p className="font-fw-mono text-xs tabular-nums text-warm-500">
              {affectedUsersLabel(item)} · {item.occurrences} events · last{' '}
              <LocalTime iso={item.lastSeen} />
            </p>
            {/* REGRESSED is the single highest-signal thing on a triage row —
                it means a fix did not hold — so it gets a real badge rather
                than the inline mono text it used to share with the counts.
                Now reachable for app-origin rows too, not just Sentry. */}
            {item.substatus === 'regressed' ? (
              <p className="pt-0.5">
                <StatusPill tone="danger" dot size="sm">
                  Regressed — resolved, then fired again
                </StatusPill>
              </p>
            ) : null}
            {/* Kind axis. Only shown when it is NOT a plain actionable defect —
                labelling every ordinary bug "Defect" would be pure chrome. The
                cases worth calling out are the ones that change what an
                operator does: non-actionable noise, and a degraded message. */}
            {!item.actionable || item.hasDegradedMessage ? (
              <p className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {!item.actionable ? (
                  <span
                    className="rounded bg-warm-100 px-1.5 py-0.5 text-eyebrow uppercase text-warm-600"
                    title={item.klassReason}
                  >
                    {INCIDENT_CLASS_LABEL[item.klass]}
                  </span>
                ) : null}
                {item.hasDegradedMessage ? (
                  <span
                    className="rounded bg-warm-100 px-1.5 py-0.5 text-eyebrow uppercase text-warm-600"
                    title="The message was stringified on capture (e.g. [object Object]) — the real cause was lost. Fix the call site to use describeError()."
                  >
                    message lost
                  </span>
                ) : null}
              </p>
            ) : null}
            {detailLine(item) ? (
              <p className="break-words font-fw-mono text-caption leading-4 text-warm-500 [overflow-wrap:anywhere]">
                {detailLine(item)}
              </p>
            ) : null}
            {errors.has(item.key) ? (
              <p className="text-xs text-fw-danger-ink">
                Resolve failed — {errors.get(item.key)}
              </p>
            ) : null}
          </div>
          <SportBadge sport={item.sport} />
          <span className="rounded bg-warm-100 px-1.5 py-0.5 text-eyebrow uppercase text-warm-600">
            {item.origin === 'sentry' ? 'Sentry' : 'App'}
          </span>
          {series ? (
            <Sparkline
              data={series}
              goodDirection="down"
              label={`${item.origin === 'sentry' ? 'Sentry' : 'App'} events, last 24h`}
              width={56}
              height={18}
              showEndDot={false}
              className="shrink-0"
            />
          ) : null}
          <CopyReportButton
            variant="icon"
            report={item.report}
            label={`Copy incident report: ${item.title}`}
          />
          {item.origin === 'app' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => resolve(item)}
              leftIcon={<CheckCheck size={13} aria-hidden />}
            >
              Resolve
            </Button>
          ) : (
            <>
              <Button asChild variant="secondary" size="sm">
                <a href={item.permalink ?? '#'} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} aria-hidden /> Open in Sentry
                </a>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => resolveSentry(item)}
                leftIcon={<CheckCheck size={13} aria-hidden />}
              >
                Resolve
              </Button>
            </>
          )}
        </li>
        );
      })}
    </ul>
  );
}
