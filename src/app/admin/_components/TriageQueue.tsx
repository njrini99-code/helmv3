'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, CheckCheck } from 'lucide-react';
import { Button, StatusPill } from '@/components/fairway';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
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
              {item.affectedUsers} users · {item.occurrences} events · last{' '}
              <LocalTime iso={item.lastSeen} />
              {item.substatus === 'regressed' ? ' · REGRESSED' : ''}
            </p>
            {errors.has(item.key) ? (
              <p className="text-xs text-fw-danger">
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
