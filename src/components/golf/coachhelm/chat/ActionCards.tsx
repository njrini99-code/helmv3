'use client';

/**
 * ============================================================================
 * CoachHelm · chat · action cards — the proposal and the receipt
 * ----------------------------------------------------------------------------
 * Two cards, and between them sits the only path from the model to the
 * database.
 *
 * The PROPOSAL is what a coach approves. It is built server-side by the same
 * code that will execute — so the eight dates on the card are the eight dates
 * that get created, not a rendering of what the model said it would do. The
 * design rule is that nothing on it should be able to surprise anyone
 * afterwards: every occurrence, the timezone, the recipient count, and each
 * notification that will fire is stated before the button.
 *
 * The RECEIPT is what happened. It survives reload because it is persisted as a
 * message part, which matters more than it sounds: "did that actually send?" a
 * day later is a real question, and scrolling back to find out is the answer.
 *
 * Neither card shows a raw id. A coach reads names and counts and follows links.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { Check, X, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

export interface ActionProposalCardProps {
  proposal: ActionProposal;
  /** Null once the coach has decided — the card then shows the outcome. */
  onApprove?: () => void;
  onDeny?: () => void;
  decision?: 'approved' | 'denied' | null;
  busy?: boolean;
}

export function ActionProposalCard({
  proposal,
  onApprove,
  onDeny,
  decision,
  busy,
}: ActionProposalCardProps) {
  const decided = decision === 'approved' || decision === 'denied';
  const destructive = Boolean(proposal.impact);

  return (
    <section
      aria-label={proposal.action}
      className={cn(
        'rounded-card border bg-surface',
        destructive ? 'border-border-strong' : 'border-accent-200',
      )}
    >
      <header className="flex items-start gap-3 border-b border-border-subtle px-4 py-3">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 h-2 w-2 shrink-0 rounded-full',
            destructive ? 'bg-text-tertiary' : 'bg-accent-600',
          )}
        />
        <div className="min-w-0">
          <h3 className="font-fw-sans text-body-sm font-semibold text-text-primary">
            {proposal.action}
          </h3>
          <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">{proposal.summary}</p>
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        {proposal.facts.map((f) => (
          <React.Fragment key={f.label}>
            <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary sm:pt-0.5">
              {f.label}
            </dt>
            <dd
              className={cn(
                'font-fw-sans text-body-sm',
                f.missing ? 'text-text-tertiary' : 'text-text-primary',
              )}
            >
              {f.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>

      {proposal.notifications.length > 0 && (
        <div className="border-t border-border-subtle px-4 py-3">
          <p className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
            Will send
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {proposal.notifications.map((n) => (
              <li key={n} className="font-fw-sans text-body-sm text-text-secondary">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposal.impact && (
        <div className="flex items-start gap-2 border-t border-border-subtle px-4 py-3">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
          <p className="font-fw-sans text-body-sm text-text-primary">{proposal.impact}</p>
        </div>
      )}

      {proposal.missing.length > 0 && !decided && (
        <p className="border-t border-border-subtle px-4 py-2.5 font-fw-sans text-caption text-text-tertiary">
          {proposal.missing.join(', ')} not set — this will be created without{' '}
          {proposal.missing.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      <footer className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
        {decided ? (
          <p className="font-fw-sans text-body-sm text-text-secondary">
            {decision === 'approved' ? 'Confirmed.' : 'Cancelled — nothing was created.'}
          </p>
        ) : (
          <>
            {/* eslint-disable-next-line helm/no-raw-button -- primary confirm on an approval card — sized to the card, not the global pill */}
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-fw-md bg-accent-700 px-4 font-fw-sans text-body-sm font-medium text-text-on-accent',
                'transition-colors hover:bg-accent-800 disabled:opacity-60',
                'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              )}
            >
              <Check aria-hidden className="h-4 w-4" />
              Confirm
            </button>
            {/* eslint-disable-next-line helm/no-raw-button -- paired cancel on an approval card — must match the confirm above it */}
            <button
              type="button"
              onClick={onDeny}
              disabled={busy}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-fw-md border border-border-subtle px-4 font-fw-sans text-body-sm text-text-secondary',
                'transition-colors hover:bg-surface-sunken disabled:opacity-60',
                'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              )}
            >
              <X aria-hidden className="h-4 w-4" />
              Cancel
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export function ActionReceiptCard({
  receipt,
  onRetry,
}: {
  receipt: ActionReceipt;
  onRetry?: () => void;
}) {
  const failed = receipt.status === 'failed';
  const partial = receipt.status === 'partial';

  return (
    <section
      aria-label={`${receipt.action} — ${receipt.status}`}
      className="rounded-card border border-border-subtle bg-surface"
    >
      <header className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden
          className={cn(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            failed ? 'bg-text-tertiary' : partial ? 'bg-accent-300' : 'bg-accent-600',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
            {failed ? `${receipt.action} — not completed` : receipt.action}
          </p>
          <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">
            {receipt.error ?? receipt.summary}
          </p>
        </div>
      </header>

      {receipt.created.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pb-3">
          {receipt.created.map((c, i) =>
            c.href ? (
              <li key={i}>
                <Link
                  href={c.href}
                  className={cn(
                    'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-sunken px-3',
                    'font-fw-sans text-caption text-text-primary transition-colors hover:border-accent-300',
                    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  )}
                >
                  {c.count} {c.kind}
                  {c.count === 1 ? '' : 's'}
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-text-tertiary" />
                </Link>
              </li>
            ) : (
              <li
                key={i}
                className="inline-flex items-center rounded-full border border-border-subtle px-3 py-1.5 font-fw-sans text-caption text-text-secondary"
              >
                {c.count} {c.kind}
                {c.count === 1 ? '' : 's'}
              </li>
            ),
          )}
        </ul>
      )}

      {receipt.notifications.length > 0 && (
        <p className="border-t border-border-subtle px-4 py-2.5 font-fw-sans text-caption text-text-tertiary">
          {receipt.notifications
            .map((n) => `${n.channel} ${n.status} to ${n.recipients}`)
            .join(' · ')}
        </p>
      )}

      {receipt.partial_failures.length > 0 && (
        <ul className="border-t border-border-subtle px-4 py-2.5">
          {receipt.partial_failures.map((f) => (
            <li key={f} className="font-fw-sans text-caption text-text-secondary">
              {f}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border-subtle px-4 py-2 font-fw-sans text-caption text-text-tertiary">
        {new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(receipt.at))}
      </p>

      {failed && receipt.retryable && onRetry && (
        <div className="border-t border-border-subtle px-4 py-3">
          {/* eslint-disable-next-line helm/no-raw-button -- inline retry inside a receipt card */}
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] rounded-fw-md border border-border-subtle px-4 font-fw-sans text-body-sm text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
