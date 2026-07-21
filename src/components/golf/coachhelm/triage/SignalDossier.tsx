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
import { ArrowLeft } from 'lucide-react';
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
}

export function SignalDossier({ entry, coachId, pending, onReview, onDismiss, onPromoted, onBack }: SignalDossierProps) {
  if (!entry) {
    return (
      <div className="rounded-fw-lg border border-border-subtle bg-surface p-6">
        <EmptyState
          variant="subtle"
          title="Select a signal"
          description="Pick a row from the queue to see the full evidence and act on it."
        />
      </div>
    );
  }

  const { signal, group } = entry;

  return (
    <div className="flex flex-col gap-4 rounded-fw-lg border border-border-subtle bg-surface p-5 sm:p-6">
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
    </div>
  );
}
