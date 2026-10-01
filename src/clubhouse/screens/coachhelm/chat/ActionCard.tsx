'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CircleAlert, ClipboardCheck, Info } from 'lucide-react';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { focusForProposal, type AskProposalView, type EvidenceFocus } from '../../../data/coachhelm-chat-thread';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { playerStatsHref } from './Prose';

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/**
 * The proposal a coach approves: what will be written, who is told, and what is not set, stated
 * before the button. Nothing runs until Confirm. Confirm answers the approval by `approval.id`
 * (the tool-call id matches nothing). Both buttons are locked after the first tap (and stop tapping: no
 * second haptic), so a double tap sends one answer.
 */
export function AskActionCard({
  view,
  messageId,
  phone,
  hasEvidence,
  evidenceOpen,
  onApprove,
  onDeny,
  onOpenEvidence,
}: {
  view: AskProposalView;
  messageId: string;
  phone: boolean;
  hasEvidence: boolean;
  evidenceOpen: boolean;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  onOpenEvidence: (focus: EvidenceFocus) => void;
}) {
  const { proposal, status } = view;
  const [deciding, setDeciding] = useState(false);
  const waiting = status === 'live' || status === 'preparing';
  const focus = focusForProposal(messageId, view);
  const who = proposal.affects.find((a) => a.kind === 'player');
  const statsHref = who ? playerStatsHref(who.id) : null;
  const answer = (approve: boolean) => {
    if (deciding || !view.approvalId) return;
    setDeciding(true);
    (approve ? onApprove : onDeny)(view.approvalId);
  };
  const subtitle = { live: 'Needs your OK', preparing: 'Getting it ready', confirmed: 'Confirmed', cancelled: 'Cancelled', abandoned: 'No decision made' }[status];
  // A player already named in a fact row does not need a second pill.
  const pills = proposal.affects.filter((a) => !proposal.facts.some((f) => f.value.includes(a.label)));

  const evidenceControl = !focus ? null : hasEvidence ? (
    <button type="button" className="ch-btn ch-btn--secondary ch-btn--sm ch-th-act__ev" aria-pressed={evidenceOpen} data-ch-code="CH-13851" onClick={() => onOpenEvidence(focus)}>
      <span>{phone ? `See ${firstName(who?.label ?? '')}'s numbers` : 'Evidence'}</span>
      {phone && <Icon icon={ArrowRight} size={14} />}
    </button>
  ) : statsHref ? (
    <Button variant="secondary" size="sm" href={statsHref} className="ch-th-act__ev">
      {`See ${firstName(who?.label ?? '')}'s stats`}
    </Button>
  ) : null;

  return (
    <div className="ch-th-actwrap">
      <section className="ch-th-act" aria-label={proposal.action} data-status={status} data-ch-code={status === 'abandoned' ? 'CH-13254' : undefined}>
        <div className="ch-th-act__head">
          <span className="ch-th-act__icon" aria-hidden="true">
            <Icon icon={ClipboardCheck} size={17} />
          </span>
          <span className="ch-th-act__title">
            <b>{proposal.action}</b>
            <span>{subtitle}</span>
          </span>
          {!phone && evidenceControl}
        </div>
        {proposal.facts.length > 0 ? (
          <dl className="ch-th-act__facts">
            {proposal.facts.map((f, i) => (
              <div key={`${f.label}-${i}`} data-missing={f.missing ? 'true' : undefined}>
                <dt>{f.label}</dt>
                <dd>{f.missing && !f.value ? 'Not set' : f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="ch-th-act__sum">{proposal.summary}</p>
        )}
        {pills.length > 0 && (
          <ul className="ch-th-act__for" aria-label="Affects">
            {pills.map((a) => (
              <li key={`${a.kind}-${a.id}`}>{a.kind === 'player' ? `@${a.label}` : a.label}</li>
            ))}
          </ul>
        )}
        <div className="ch-th-act__note">
          <Icon icon={Info} size={15} />
          <span>
            {proposal.notifications.length > 0 ? (
              <>
                <b>Will send.</b> {proposal.notifications.join(' ')}
              </>
            ) : (
              <b>Nothing is sent.</b>
            )}
          </span>
        </div>
        {proposal.impact && (
          <div className="ch-th-act__note ch-th-act__impact">
            <Icon icon={CircleAlert} size={15} />
            <span>{proposal.impact}</span>
          </div>
        )}
        {proposal.missing.length > 0 && waiting && (
          <p className="ch-th-act__missing">
            {proposal.missing.join(', ')} not set. This will be created without {proposal.missing.length === 1 ? 'it' : 'them'}.
          </p>
        )}
        <div className="ch-th-act__foot" aria-live="polite">
          {waiting ? (
            <>
              <Button variant="ghost" disabled={status === 'preparing' || deciding} onClick={() => answer(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={status === 'preparing' || deciding} onClick={() => answer(true)}>
                Confirm
              </Button>
            </>
          ) : status === 'confirmed' ? (
            <p data-ch-code={view.receipt ? 'CH-13951' : 'CH-13450'}>{view.receipt ? 'Confirmed.' : 'Confirmed. Working on it.'}</p>
          ) : status === 'cancelled' ? (
            <p data-ch-code="CH-13952">Cancelled. Nothing was created.</p>
          ) : (
            <p>No decision was made. Nothing was created.</p>
          )}
        </div>
      </section>
      {phone && evidenceControl && <div className="ch-th-act__link">{evidenceControl}</div>}
    </div>
  );
}

/**
 * What happened. It is durable, so a reload shows it, and a failed write says what failed and
 * what is safe to do next. "Ask again" asks CoachHelm to propose the action again: there is no
 * client path to re-run a failed run itself (see the report on the retry finding).
 */
export function AskReceiptCard({ receipt, onAskAgain }: { receipt: ActionReceipt; onAskAgain: (text: string) => void }) {
  const failed = receipt.status === 'failed';
  const partial = receipt.status === 'partial';
  const reason = receipt.error ?? receipt.summary;
  return (
    <section className="ch-th-receipt" aria-label={`${receipt.action}, ${receipt.status}`} data-status={receipt.status} data-ch-code={failed || partial ? 'CH-13253' : 'CH-13953'}>
      <div className="ch-th-receipt__head">
        <span className="ch-th-receipt__dot" aria-hidden="true" />
        <div>
          <p className="ch-th-receipt__title">{failed ? `${receipt.action}, not completed` : partial ? `${receipt.action}, partly done` : receipt.action}</p>
          <p className="ch-th-receipt__body">{failed ? reason : receipt.summary}</p>
        </div>
      </div>
      {receipt.created.length > 0 && (
        <ul className="ch-th-receipt__chips">
          {receipt.created.map((c, i) => {
            const text = `${c.count} ${c.kind}${c.count === 1 ? '' : 's'}`;
            // A chip is a link only when the screen it opens is rebuilt.
            const href = c.href ? rebuiltHref(c.href) : null;
            return (
              <li key={i}>
                {href ? (
                  <Link href={href} className="ch-th-chip">
                    {text}
                    <Icon icon={ArrowRight} size={13} />
                  </Link>
                ) : (
                  <span className="ch-th-chip">{text}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {receipt.notifications.length > 0 && <p className="ch-th-receipt__meta">{receipt.notifications.map((n) => `${n.channel} ${n.status} to ${n.recipients}`).join(' · ')}</p>}
      {receipt.partial_failures.length > 0 && (
        <ul className="ch-th-receipt__fail">
          {receipt.partial_failures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {partial && <p className="ch-th-receipt__meta">Check what was created before you ask again.</p>}
      {failed && receipt.retryable && (
        <div className="ch-th-receipt__foot">
          <Button variant="secondary" size="sm" onClick={() => onAskAgain(`Try that again: ${receipt.action}`)}>
            Ask again
          </Button>
        </div>
      )}
    </section>
  );
}
