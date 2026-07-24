'use client';

/**
 * ============================================================================
 * SignalDossier — the triage detail pane (Triage Desk spec §3)
 * ----------------------------------------------------------------------------
 * Claim headline, severity + category chips, an evidence block, stroke
 * impact in mono, then a WORKING action row: Mark reviewed, Dismiss,
 * Prescribe (`PromoteToFocusAreaButton`), and a "View stats" deep link to the
 * player's stats. Never dead-ends: every action is wired to
 * `reviewSignal`/`dismissSignal`/`createFocusAreaFromInsight` with an
 * optimistic update owned by `TriageDesk`, this component only renders state
 * + fires callbacks.
 * ========================================================================== */

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Layers3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState, PressTarget } from '@/components/fairway';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { formatAgeDays, formatCategoryLabel } from './buildTriageViewModel';
import { SeverityChip } from './SignalRow';
import { PromoteToFocusAreaButton } from './PromoteToFocusAreaButton';

export interface SignalDossierEntry {
  signal: GroupedSignal;
  group: SignalGroup;
}

export interface SignalDossierProps {
  entry: SignalDossierEntry | null;
  coachId: string;
  pending: boolean;
  onReview: (signal: GroupedSignal) => void;
  onDismiss: (signal: GroupedSignal) => void;
  onPromoted: (signal: GroupedSignal) => void;
  onBack: () => void;
  signalHref: (signalId: string) => string;
  onSelectSignal: (signalId: string) => void;
}

export function SignalDossier({
  entry,
  coachId,
  pending,
  onReview,
  onDismiss,
  onPromoted,
  onBack,
  signalHref,
  onSelectSignal,
}: SignalDossierProps) {
  if (!entry) {
    return (
      <div className="h-full rounded-fw-lg border border-border-subtle bg-surface p-6">
        <EmptyState
          variant="subtle"
          title="Select a signal"
          description="Pick a row from the queue to see the full evidence and act on it."
        />
      </div>
    );
  }

  const { signal, group } = entry;
  const relatedSignals = group.signals.filter((candidate) => candidate.id !== signal.id).slice(0, 4);
  const severityWeight = signal.severity === 'urgent' ? 100 : signal.severity === 'high' ? 78 : signal.severity === 'medium' ? 54 : 30;
  const recencyWeight = Math.max(8, 100 - Math.min(signal.ageDays, 45) * 2);
  const repeatWeight = Math.min(100, (signal.supersededCount + 1) * 22);

  return (
    <div className="flex flex-col gap-4 rounded-fw-lg border border-border-subtle bg-surface p-5 sm:p-6 min-[940px]:h-full min-[940px]:overflow-y-auto">
      <PressTarget
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-3 py-1.5 text-caption font-bold text-accent-700 transition-colors [transition-duration:150ms] hover:bg-accent-100 min-[940px]:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to queue
      </PressTarget>

      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={signal.severity} />
        <Badge tone="neutral" size="sm">
          {formatCategoryLabel(signal.category)}
        </Badge>
        {group.playerId ? (
          <Badge tone="accent" size="sm">
            {group.playerName}
          </Badge>
        ) : null}
        <span className="ml-auto font-fw-mono text-caption tabular-nums text-text-tertiary">
          {formatAgeDays(signal.ageDays)}
        </span>
      </div>

      <h3 className="font-fw-display text-h3 font-semibold text-text-primary">{signal.title}</h3>

      <div className="flex flex-col gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-text-tertiary">Evidence</p>
        <p className="font-fw-sans text-body-sm text-text-secondary">{signal.claim || 'No further detail recorded.'}</p>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
          <span>
            Status <span className="text-text-secondary">{signal.status}</span>
          </span>
          {signal.supersededCount > 0 ? (
            <span>
              Occurrences <span className="text-text-secondary">{signal.supersededCount + 1}</span>
            </span>
          ) : null}
        </div>
      </div>

      {signal.strokeImpact !== null ? (
        <p className="font-fw-mono text-body-lg font-semibold tabular-nums text-text-primary">
          {signal.strokeImpact > 0 ? '+' : ''}
          {signal.strokeImpact.toFixed(2)} strokes
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="secondary" size="sm" busy={pending} disabled={pending} onClick={() => onReview(signal)}>
          Mark reviewed
        </Button>
        <Button variant="ghost" size="sm" busy={pending} disabled={pending} onClick={() => onDismiss(signal)}>
          Dismiss
        </Button>
        <PromoteToFocusAreaButton signal={signal} coachId={coachId} onPromoted={() => onPromoted(signal)} />
        {group.playerId ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/golf/dashboard/stats?player=${group.playerId}`}>View stats</Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-auto grid gap-4 border-t border-border-subtle pt-5">
        <div>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-text-tertiary">Signal anatomy</p>
              <p className="mt-1 text-caption text-text-secondary">Why this item sits where it does in the queue.</p>
            </div>
            <Layers3 className="h-4 w-4 text-accent-700" aria-hidden />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SignalFactor label="Severity" value={signal.severity} strength={severityWeight} tone={signal.severity === 'urgent' || signal.severity === 'high' ? 'warning' : 'accent'} />
            <SignalFactor label="Recency" value={formatAgeDays(signal.ageDays)} strength={recencyWeight} tone="accent" />
            <SignalFactor label="Evidence" value={`${signal.supersededCount + 1}×`} strength={repeatWeight} tone="accent" />
          </div>
        </div>

        {relatedSignals.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-text-tertiary">Also shaping {group.playerName}</p>
              <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">{group.signals.length - 1} related</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {relatedSignals.map((related) => (
                <Link
                  key={related.id}
                  href={signalHref(related.id)}
                  replace
                  scroll={false}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) return;
                    event.preventDefault();
                    onSelectSignal(related.id);
                  }}
                  className="group flex min-h-14 items-center gap-2 rounded-fw-md border border-border-subtle bg-surface-raised px-3 py-2.5 outline-none transition-[border-color,box-shadow] hover:border-accent-200 hover:[box-shadow:var(--fw-shadow-soft)] focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2"
                >
                  <span className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    related.severity === 'urgent' ? 'bg-[var(--fw-color-danger)]' :
                    related.severity === 'high' ? 'bg-[var(--fw-color-warning)]' : 'bg-accent-500',
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption font-semibold text-text-primary">{formatCategoryLabel(related.category)}</p>
                    <p className="truncate text-eyebrow text-text-tertiary">{related.title}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SignalFactor({
  label,
  value,
  strength,
  tone,
}: {
  label: string;
  value: string;
  strength: number;
  tone: 'accent' | 'warning';
}) {
  return (
    <div className="rounded-fw-md border border-border-subtle bg-surface-sunken/55 p-3">
      <p className="truncate text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 truncate font-fw-mono text-body-sm font-semibold capitalize tabular-nums text-text-primary">{value}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className={cn('block h-full rounded-full', tone === 'warning' ? 'bg-[var(--fw-color-warning)]' : 'bg-accent-500')}
          style={{ width: `${strength}%` }}
        />
      </div>
    </div>
  );
}
