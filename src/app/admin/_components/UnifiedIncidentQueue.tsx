'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveTriageEvents } from '@/app/admin/actions/triage';
import { resolveSentryIssueAction } from '@/app/admin/actions/sentry-resolve';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import { PanelAllClear, PanelNoData } from './PanelStates';
import { UnifiedIncidentCard } from './UnifiedIncidentCard';

/**
 * The canonical incident list.
 *
 * Structurally the same optimistic-resolve machine as `TriageQueue` — hide on
 * click, reconcile on refresh, RESTORE and surface the failure if the action
 * rejects, because an admin must never believe an incident was resolved when
 * it was not. What changed is the row it renders and, more importantly, what
 * it is allowed to say when it is empty.
 *
 * THE EMPTY STATE IS THE POINT. `TriageQueue` renders an unconditional
 * all-clear on zero rows. That is correct only when every source could be
 * read: a queue that is empty because Sentry returned a 500 is not an
 * all-clear, it is a partial count, and rendering the two identically converts
 * a broken read into a green screen — the single most damaging thing a
 * monitoring surface can do. `canClaimAllClear` decides that upstream, and
 * this component takes the answer as a prop rather than guessing.
 *
 * Grouping is by SEVERITY, not by lifecycle. Severity is what an operator
 * triages on — nobody scans a column looking for "everything in AWAITING
 * PROOF" — and lifecycle is already on every card as a chip.
 */

const SEVERITY_ORDER = ['critical', 'error', 'warning', 'info'] as const;

const SEVERITY_HEADING: Readonly<Record<(typeof SEVERITY_ORDER)[number], string>> = {
  critical: 'Critical',
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
};

export function UnifiedIncidentQueue({
  incidents,
  eventIdsByIncident,
  seriesByIncident = {},
  /**
   * Whether an empty list is entitled to read as an all-clear. False whenever
   * any source is blind — see `canClaimAllClear` in
   * `@/lib/admin/incidents/sources`.
   */
  canClaimAllClear,
  /** Named when `canClaimAllClear` is false, so the empty state can say WHY. */
  blindnessNote = null,
  checkedAt,
  grouped = true,
  onResolve = resolveTriageEvents,
  onResolveSentry = resolveSentryIssueAction,
}: {
  incidents: readonly UnifiedIncident[];
  eventIdsByIncident: Record<string, string[]>;
  seriesByIncident?: Record<string, number[]>;
  canClaimAllClear: boolean;
  blindnessNote?: string | null;
  checkedAt: string;
  grouped?: boolean;
  onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>;
  onResolveSentry?: (issueId: string) => Promise<{ ok: boolean; error?: string; unconfigured?: boolean }>;
}) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [, startTransition] = useTransition();

  const visible = incidents.filter((incident) => !hiddenIds.has(incident.id));

  if (visible.length === 0) {
    return canClaimAllClear ? (
      <PanelAllClear label="Nothing in the queue — no unresolved incidents" checkedAt={checkedAt} />
    ) : (
      <PanelNoData
        label="No incidents found in readable sources"
        description={
          blindnessNote ??
          'At least one source could not be read this refresh, so this is a partial count rather than an all-clear.'
        }
      />
    );
  }

  function clearError(id: string) {
    setErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function restore(id: string, message: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setErrors((prev) => new Map(prev).set(id, message));
  }

  /**
   * One incident can have BOTH app rows and a Sentry issue, because that is
   * what correlation is for. Resolving it therefore means resolving every
   * source that holds it open — a resolve that closed the app rows and left
   * the Sentry issue unresolved would bring the incident straight back on the
   * next refresh, which reads as "resolve did nothing".
   */
  function resolve(incident: UnifiedIncident) {
    const eventIds = eventIdsByIncident[incident.id] ?? [];
    const issueIds = incident.sentryIssueIds;
    if (eventIds.length === 0 && issueIds.length === 0) {
      setErrors((prev) =>
        new Map(prev).set(
          incident.id,
          'Nothing to resolve — this incident has no app rows and no Sentry issue behind it.',
        ),
      );
      return;
    }

    clearError(incident.id);
    setHiddenIds((prev) => new Set([...prev, incident.id]));

    startTransition(() => {
      const work: Array<Promise<unknown>> = [];
      if (eventIds.length > 0) work.push(onResolve(eventIds));
      for (const issueId of issueIds) {
        work.push(
          onResolveSentry(issueId).then((result) => {
            if (!result.ok) {
              throw new Error(result.error ?? 'Failed to resolve in Sentry — try again');
            }
          }),
        );
      }
      void Promise.all(work)
        .then(() => {
          router.refresh();
        })
        .catch((err: unknown) => {
          restore(incident.id, err instanceof Error ? err.message : 'Failed to resolve — try again');
        });
    });
  }

  /**
   * Never a series shorter than two finite points: `Sparkline`'s own honesty
   * contract draws a fixed-size "not enough data" box otherwise, which is
   * noise on every row lacking history in a dense queue.
   */
  function series(incident: UnifiedIncident): number[] | null {
    const s = seriesByIncident[incident.id];
    return s && s.length >= 2 ? s : null;
  }

  function card(incident: UnifiedIncident) {
    return (
      <UnifiedIncidentCard
        key={incident.id}
        incident={incident}
        series={series(incident)}
        onResolve={resolve}
        error={errors.get(incident.id)}
      />
    );
  }

  if (!grouped) {
    return <ul className="divide-y divide-warm-200/60">{visible.map(card)}</ul>;
  }

  // An empty severity never renders a heading. An always-present "Critical 0"
  // band is exactly the chrome that made the previous queue hard to read.
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
