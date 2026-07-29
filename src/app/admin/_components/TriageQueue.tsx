'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, CheckCheck } from 'lucide-react';
import { Button, StatusPill } from '@/components/fairway';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
import { INCIDENT_CLASS_LABEL } from '@/lib/admin/incident-classification';
import { resolveTriageEvents } from '@/app/admin/actions/triage';
import { SportBadge } from './SportBadge';
import { PanelAllClear } from './PanelStates';
import { LocalTime } from './LocalTime';
import { CopyReportButton } from './CopyReportButton';

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
  if (item.origin === 'app' && item.affectedUsers === 0 && item.occurrences > 0) {
    return 'unknown user';
  }
  const n = item.affectedUsers;
  return `${n} user${n === 1 ? '' : 's'}`;
}

export function TriageQueue({
  items,
  onResolve = resolveTriageEvents,
}: {
  items: TriageItem[];
  onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>;
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

  function resolve(item: TriageItem) {
    // Optimistic: hide now; refresh reconciles. Resolution is idempotent
    // (resolve_admin_event only touches resolved=false rows). If the action
    // rejects (e.g. requireSuperAdmin() throws on a dead session, or the RPC
    // errors) the row is restored and the failure surfaced — an admin must
    // never believe an incident was resolved when it wasn't.
    setErrors((prev) => {
      if (!prev.has(item.key)) return prev;
      const next = new Map(prev);
      next.delete(item.key);
      return next;
    });
    setHiddenKeys((prev) => new Set([...prev, item.key]));
    startTransition(() => {
      void onResolve(item.eventIds)
        .then(() => {
          router.refresh();
        })
        .catch((err: unknown) => {
          setHiddenKeys((prev) => {
            const next = new Set(prev);
            next.delete(item.key);
            return next;
          });
          setErrors((prev) => {
            const next = new Map(prev);
            next.set(
              item.key,
              err instanceof Error ? err.message : 'Failed to resolve — try again',
            );
            return next;
          });
        });
    });
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
      {visible.map((item) => (
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
            <Button asChild variant="secondary" size="sm">
              <a href={item.permalink ?? '#'} target="_blank" rel="noreferrer">
                <ExternalLink size={13} aria-hidden /> Open in Sentry
              </a>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
