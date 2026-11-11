'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskProposalView } from '../../../../data/coachhelm-chat-thread';
import { haptic } from '../../../../lib/haptics';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { Badge } from '../../../../ui/Badge';
import { Button } from '../../../../ui/Button';
import { announceLanding } from '../../../../shell/quick-chat/landing';
import { flyDraftHome } from '../ask-flight';
import { CardBody, cardCopy, drawsSubject, isWithdrawn, type CardDensity, type CardPerson, type CardPhase } from '../cards';
import { landsLine, phaseOfReceipt, Receipt, type ReceiptPhase } from './ConfirmCard';

export interface TaskCardProps {
  view: AskProposalView;
  /** Ask draws full; quick chat draws compact. */
  density?: CardDensity;
  /** The card arrived in this visit: it rises out of the answer, whole (MOTION MO-7-1). A stored card draws still. */
  fresh?: boolean;
  /** A request is in flight. */
  busy?: boolean;
  roster?: readonly CardPerson[];
  team?: string;
  /** Opens the reads behind this draft, when it has any. */
  evidence?: { open: boolean; onOpen: () => void };
  /** Both receive the APPROVAL id (`part.approval.id`). */
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onSend?: (text: string) => boolean | void;
  /** Where the write stands, as it changes: what the page behind a quick chat lands from. Undo is the card's own state and is in no message. */
  onPhase?: (key: string, phase: ReceiptPhase, receipt: ActionReceipt | null) => void;
}

/**
 * The task card's shell (chat v3, SPEC Moment 7): the frame, the head, the button row, the countdown and the receipt, and every
 * motion. What a coach checks before Confirm is the capability's own body (`cards/`), drawn whole from the stored plan; the
 * words of the head, the button and the badge come from the same catalogue as the body, so they cannot drift apart.
 *
 * The look is direction A's pin sheet: the same paper leaf as an answer, a running head that says what it will become, the
 * thing itself, and one quiet line for where it appears (who is told is the body's first line). No icon tile, and no
 * "On confirm" row repeating what the body already says.
 */
export function TaskCard({ view, density = 'full', fresh = false, busy = false, roster = [], team, evidence, onApprove, onDeny, onSend, onPhase }: TaskCardProps) {
  const { proposal: p, status } = view;
  const copy = cardCopy(view.tool, p);
  const receipt = view.receipt;
  const reduced = useChReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const [pressed, setPressed] = useState<'confirm' | 'cancel' | null>(null);
  const [arriving] = useState(fresh && !receipt && (status === 'live' || status === 'preparing'));
  // Where the write stands, from the receipt row: held (not saved yet), saved, undone or failed. Null before there is a receipt.
  const [write, setWrite] = useState<ReceiptPhase | null>(receipt ? phaseOfReceipt(receipt) : null);
  const report = useRef(onPhase);
  useEffect(() => {
    report.current = onPhase;
  });
  const latest = useRef(receipt);
  useEffect(() => {
    latest.current = receipt;
  });
  // MO-7-9: the save landed in this visit, so the draft goes to its row and the one success haptic fires. A stored receipt draws still.
  const wasSaved = useRef(write === 'saved');
  const [landing, setLanding] = useState(false);
  useEffect(() => {
    if (write) report.current?.(view.key, write, latest.current);
    if (write !== 'saved' || wasSaved.current) return;
    wasSaved.current = true;
    const card = cardRef.current;
    const draft = card?.querySelector<HTMLElement>('.ch-ak-task__body');
    const slot = card?.querySelector<HTMLElement>('[data-ch-lands]');
    setLanding(true);
    haptic('success');
    if (card && draft && slot) void flyDraftHome(card, draft, slot, reduced);
  }, [write, reduced, view.key]);
  // A Confirm or Cancel whose response was lost: the buttons come back, and the turn's notice offers Try again (the same decision).
  useEffect(() => {
    if (!busy && (status === 'live' || status === 'preparing')) setPressed(null);
  }, [busy, status]);

  const undecided = status === 'live' || status === 'preparing';
  const phase: CardPhase =
    write === 'saved'
      ? receipt?.status === 'partial'
        ? 'partial'
        : 'saved'
      : write === 'undone'
        ? 'undone'
        : write === 'failed'
          ? 'failed'
          : write === 'held'
            ? 'held'
            : status === 'cancelled'
              ? 'cancelled'
              : status === 'abandoned'
                ? 'superseded'
                : status === 'confirmed' || pressed === 'confirm'
                  ? 'confirming'
                  : 'proposed';
  const answer = (ok: boolean) => {
    if (pressed || !view.approvalId) return;
    setPressed(ok ? 'confirm' : 'cancel');
    (ok ? onApprove : onDeny)(view.approvalId);
  };
  const badge =
    phase === 'saved' || phase === 'partial' ? copy.badge : phase === 'undone' ? 'Undone' : phase === 'held' ? 'Holding' : phase === 'failed' ? 'Not saved' : phase === 'cancelled' || phase === 'superseded' ? 'Set aside' : 'Draft';
  const sends = p.notifications.length > 0 && !p.notifications.every((n) => /^(nobody|nothing)/i.test(n));
  const lands = landsLine(view.tool, p.visual);
  return (
    <section ref={cardRef} className={'conf ch-ak-task' + (density === 'compact' ? ' is-compact' : '') + (landing && phase === 'saved' ? ' flash' : '') + (arriving ? ' is-arriving' : '')} aria-label={p.action} data-phase={phase} data-ch-code="CH-13951">
      <div className="hd">
        <span className="tt">
          <b>{copy.head}</b>
        </span>
        <span className={'dchip' + (landing && phase === 'saved' ? ' is-pop' : '')}>
          <Badge tone={phase === 'saved' ? 'positive' : phase === 'failed' || phase === 'partial' ? 'warning' : 'neutral'}>{badge}</Badge>
        </span>
      </div>
      {/* A task whose body draws its own subject needs no second title; one that does not is named by the plan's summary. */}
      {!drawsSubject(view.tool) && <p className="ch-ak-task__sum">{p.summary}</p>}
      {/* What a coach checks, whole at first paint. A withdrawn draft steps back; it is not removed (it is the record of what was offered). */}
      <div className={'ch-ak-task__body' + (isWithdrawn(phase) && phase !== 'failed' ? ' is-dim' : '')}>
        <CardBody tool={view.tool} proposal={p} receipt={receipt} phase={phase} density={density} roster={roster} team={team} onAsk={undecided && !pressed && onSend ? (text) => void onSend(text) : undefined} />
      </div>
      {/* The one quiet line: where it appears. Who is told is the body's first line, said once. */}
      {undecided && (lands || !sends) && <p className="oncf">{[sends ? null : 'Nothing is sent.', lands].filter(Boolean).join(' ')}</p>}
      {undecided && evidence && (
        <button type="button" className="ch-ak-evlink" aria-expanded={evidence.open} onClick={evidence.onOpen}>
          See what this is based on
        </button>
      )}
      {undecided && p.missing.length > 0 && <p className="ch-ak-needs">Needs {p.missing.join(', ').toLowerCase()} before it can be confirmed.</p>}
      {(undecided || (status === 'confirmed' && !receipt)) && (
        <div className="btns">
          {/* Cancel leaves on Confirm but keeps its box, so the working button keeps its place (MO-7-4). */}
          <span className={'cx' + (phase === 'confirming' ? ' is-gone' : '')}>
            <Button variant="ghost" size="lg" disabled={!!pressed || !view.approvalId || !undecided} onClick={() => answer(false)} data={{ 'data-ch-ask-cancel': '' }}>
              Cancel
            </Button>
          </span>
          {phase === 'confirming' ? (
            <span className="p cap" role="status">
              {copy.busy}
            </span>
          ) : (
            <Button variant="primary" size="lg" disabled={!!pressed || !view.approvalId || p.missing.length > 0} onClick={() => answer(true)} data={{ 'data-ch-ask-confirm': '' }}>
              {copy.primary}
            </Button>
          )}
        </div>
      )}
      {phase === 'cancelled' && <p className="cxl">Cancelled. Nothing was created.</p>}
      {phase === 'superseded' && <p className="cxl">Set aside when you asked something else. Nothing was created.</p>}
      {receipt && (
        <Receipt
          receipt={receipt}
          idempotencyKey={view.key}
          undoneLine={copy.undone}
          failedLine={copy.untouched}
          holdLine={(seconds) => copy.hold(seconds)}
          telling={sends}
          coins={p.affects.filter((a) => a.kind === 'player').map((a) => a.label)}
          onPhase={setWrite}
          watched={fresh}
          onRetry={onSend ? () => void onSend(`Try that again: ${p.action}, ${p.summary}`) : undefined}
          onOpen={(r) => announceLanding({ key: view.key, tool: view.tool, label: p.summary, id: (r.created[0] as { id?: string } | undefined)?.id ?? null })}
        />
      )}
    </section>
  );
}
