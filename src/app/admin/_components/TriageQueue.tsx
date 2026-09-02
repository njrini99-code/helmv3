'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
import { resolveTriageEvents } from '@/app/admin/actions/triage';
import { resolveSentryIssueAction } from '@/app/admin/actions/sentry-resolve';
import { PanelAllClear, PanelNoData } from './PanelStates';
import { IncidentCard } from './IncidentCard';

const SENTRY_KEY_PREFIX = 'sentry:';
const APP_KEY_PREFIX = 'app:';

/** Re-exported so `__tests__/affected-users-label.test.ts` and any other
 *  caller importing it from here keep working — the implementation moved to
 *  IncidentCard with the markup it belongs to. */
export { affectedUsersLabel } from './IncidentCard';

/** Worst first. An operator reads this column top-down and should never have
 *  to scan past a warning to find a critical. */
const SEVERITY_ORDER: readonly TriageSeverity[] = ['critical', 'error', 'warning', 'info'];

const SEVERITY_HEADING: Record<TriageSeverity, string> = {
  critical: 'Critical',
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
};

export function TriageQueue({
  items,
  onResolve = resolveTriageEvents,
  onResolveSentry = resolveSentryIssueAction,
  appHourlyBuckets = {},
  sentryStats24h = {},
  grouped = true,
  canClaimAllClear = true,
}: {
  items: TriageItem[];
  onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>;
  onResolveSentry?: (issueId: string) => Promise<{ ok: boolean; error?: string; unconfigured?: boolean }>;
  /** fingerprint (or `row:<id>`) → rolling 24h hourly histogram — see
   *  @/lib/admin/data/errors's computeAppHourlyBuckets. Omitted simply
   *  renders no sparkline for app rows. */
  appHourlyBuckets?: Record<string, number[]>;
  /** Sentry issue id → that issue's own baked-in 24h stats. */
  sentryStats24h?: Record<string, ReadonlyArray<readonly [number, number]>>;
  /**
   * Group the list under severity headings with counts. On by default: a flat
   * list of twenty same-looking cards is the thing that made this queue
   * unreadable, and severity is the axis an operator triages on. Pass false
   * for a short, already-homogeneous list (the Overview's "Regressed" panel,
   * where every row is the same kind of thing and a heading is pure chrome).
   */
  grouped?: boolean;
  /**
   * Whether an empty list is entitled to read as an all-clear. Defaults to
   * true so existing call sites keep their behaviour; the Overview passes the
   * Sentry pull's status, because this feed's only external witness is
   * Sentry and an empty queue under a failed or unconfigured pull is a
   * partial count — the rule `UnifiedIncidentQueue` already takes from
   * `canClaimAllClear`, applied to the surface that never got it.
   */
  canClaimAllClear?: boolean;
}) {
  const router = useRouter();
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [, startTransition] = useTransition();

  const visible = items.filter((i) => !hiddenKeys.has(i.key));

  if (visible.length === 0) {
    return canClaimAllClear ? (
      <PanelAllClear
        label="Nothing in the queue — no unresolved incidents"
        checkedAt={new Date().toISOString()}
      />
    ) : (
      <PanelNoData
        label="No incidents found in readable sources"
        description="At least one source could not be read this refresh, so this is a partial count rather than an all-clear."
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
    // rejects the row is restored and the failure surfaced — an admin must
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

  /** Sentry-origin counterpart to `resolve` — same optimistic-hide /
   *  restore-on-failure shape. `unconfigured` and an ordinary failure render
   *  identically (both are "the Bridge can't do this yet" from an operator's
   *  chair) via the same inline error text. */
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

  /** Per-row 24h series, or `null` to render none. Never a series shorter
   *  than 2 finite points — Sparkline's own honesty contract would otherwise
   *  draw a fixed-size "not enough data" box on every row lacking history,
   *  which is noise in a dense queue. */
  function rowSparkline(item: TriageItem): number[] | null {
    const series =
      item.origin === 'sentry'
        ? sentryStats24h[item.key.slice(SENTRY_KEY_PREFIX.length)]?.map(([, count]) => count)
        : appHourlyBuckets[item.key.slice(APP_KEY_PREFIX.length)];
    return series && series.length >= 2 ? series : null;
  }

  function card(item: TriageItem) {
    return (
      <IncidentCard
        key={item.key}
        item={item}
        series={rowSparkline(item)}
        onResolve={resolve}
        onResolveSentry={resolveSentry}
        error={errors.get(item.key)}
      />
    );
  }

  if (!grouped) {
    return <ul className="divide-y divide-warm-200/60">{visible.map(card)}</ul>;
  }

  // Empty severities never render a heading — an "Critical 0" band is exactly
  // the kind of always-there chrome that made the old queue hard to read.
  const buckets = SEVERITY_ORDER.map((severity) => ({
    severity,
    rows: visible.filter((i) => i.severity === severity),
  })).filter((b) => b.rows.length > 0);

  return (
    <div className="divide-y divide-warm-200">
      {buckets.map(({ severity, rows }) => (
        <section key={severity} className="py-1 first:pt-0 last:pb-0">
          <h3 className="sticky top-0 z-10 flex items-baseline gap-2 bg-warm-50/95 py-1.5 text-eyebrow uppercase tracking-widest text-warm-500 backdrop-blur">
            {SEVERITY_HEADING[severity]}
            <span className="font-fw-mono tabular-nums text-warm-400">{rows.length}</span>
          </h3>
          <ul className="divide-y divide-warm-200/60">{rows.map(card)}</ul>
        </section>
      ))}
    </div>
  );
}
