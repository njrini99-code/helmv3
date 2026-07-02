'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, CheckCheck } from 'lucide-react';
import { StatusPill } from '@/components/fairway';
import type { TriageItem, TriageSeverity } from '@/lib/admin/data/triage';
import { resolveTriageEvents } from '@/app/admin/actions/triage';
import { SportBadge } from './SportBadge';
import { PanelAllClear } from './PanelStates';

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
    // (resolve_admin_event only touches resolved=false rows).
    setHiddenKeys((prev) => new Set([...prev, item.key]));
    startTransition(() => {
      void onResolve(item.eventIds).then(() => router.refresh());
    });
  }

  return (
    <ul className="divide-y divide-warm-200/60">
      {visible.map((item) => (
        <li key={item.key} className="flex items-center gap-3 py-3">
          <StatusPill tone={SEVERITY_TONE[item.severity]} dot size="sm">
            {item.severity}
          </StatusPill>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-warm-900">{item.title}</p>
            <p className="font-fw-mono text-xs tabular-nums text-warm-500">
              {item.affectedUsers} users · {item.occurrences} events · last{' '}
              {new Date(item.lastSeen).toLocaleTimeString()}
              {item.substatus === 'regressed' ? ' · REGRESSED' : ''}
            </p>
          </div>
          <SportBadge sport={item.sport} />
          <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[10px] uppercase text-warm-600">
            {item.origin === 'sentry' ? 'Sentry' : 'App'}
          </span>
          {item.origin === 'app' ? (
            <button
              type="button"
              onClick={() => resolve(item)}
              className="inline-flex items-center gap-1 rounded-lg border border-warm-300 px-2.5 py-1 text-xs font-medium text-warm-700 hover:bg-warm-100"
            >
              <CheckCheck size={13} aria-hidden /> Resolve
            </button>
          ) : (
            <a
              href={item.permalink ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-warm-300 px-2.5 py-1 text-xs font-medium text-warm-700 hover:bg-warm-100"
            >
              <ExternalLink size={13} aria-hidden /> Open in Sentry
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
