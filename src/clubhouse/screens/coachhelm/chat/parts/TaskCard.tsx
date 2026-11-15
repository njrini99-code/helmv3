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
import { CardBody, cardCopy, drawsSubject, isOutOfDate, isWithdrawn, type CardDensity, type CardPerson, type CardPhase } from '../cards';
import { landsOf, phaseOfReceipt, Receipt, type ReceiptPhase } from './ConfirmCard';

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
  /**
   * Edit mode (CAPABILITIES 0.8): the coach changed fields on the waiting card. Receives the APPROVAL id and only the fields that
   * changed; the server plans the card again and the new one replaces this. Absent: the card offers no Edit, whatever the plan declares.
   */
  onEdit?: (id: string, patch: Record<string, unknown>) => void;
  /** The server's word on the last edit of this card, while the thread is live (`data-card-revision`). */
  revision?: { accepted: boolean; reason?: string } | null;
  /** The card's edit form opened or closed: what is on screen is not what would be confirmed, so nothing may confirm it meanwhile. */
  onEditOpen?: (key: string, open: boolean) => void;
  /**
   * "Save now and open": the write is in and the coach goes to the thing. The shell navigates its own way (quick chat pushes, so
   * its landing survives). Absent: the page is loaded at the address.
   */
  onOpenReceipt?: (view: AskProposalView, receipt: ActionReceipt, href: string) => void;
  /** Rises by one when this card is undone together with others (the batch bar's Undo). */
  undoSignal?: number;
}

/**
 * The task card's shell (chat v3, SPEC Moment 7): the frame, the head, the button row, the countdown and the receipt, and every
 * motion. What a coach checks before Confirm is the capability's own body (`cards/`), drawn whole from the stored plan; the
 * words of the head, the button and the badge come from the same catalogue as the body, so they cannot drift apart.
 *
 * The look is direction A's pin sheet: the same paper leaf as an answer, a running head that says what it will become and
 * that it is not saved, then the thing itself. Who is told and where it appears is the body's one quiet line under its
 * rule (the shell hands it the place). No icon tile, and no "On confirm" row repeating what the body already says.
 */
export function TaskCard({ view, density = 'full', fresh = false, busy = false, roster = [], team, evidence, onApprove, onDeny, onSend, onPhase, onEdit, revision = null, onEditOpen, onOpenReceipt, undoSignal = 0 }: TaskCardProps) {
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

  // Edit mode. The form is the body's; the shell sends the change, says when it is with the server, and holds Confirm while the
  // form is open (what is on screen is not what would be confirmed). A refusal is shown for the edit that was just sent only.
  const [editOpen, setEditOpen] = useState(false);
  const [editSent, setEditSent] = useState(false);
  const [editTried, setEditTried] = useState(false);
  useEffect(() => {
    if (!busy) setEditSent(false);
  }, [busy]);
  const editing = editSent && busy;
  const editError = !editing && editTried && revision && !revision.accepted ? (revision.reason ?? 'That change could not be made. The card is as it was.') : null;
  const tellEdit = useRef(onEditOpen);
  useEffect(() => {
    tellEdit.current = onEditOpen;
  });
  const openEdit = (open: boolean) => {
    setEditOpen(open);
    if (open) setEditTried(false);
    tellEdit.current?.(view.key, open);
  };

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
    phase === 'saved' || phase === 'partial' ? copy.badge : phase === 'undone' ? 'Undone' : phase === 'held' ? 'Holding' : phase === 'failed' ? (isOutOfDate(receipt) ? 'Out of date' : 'Failed') : phase === 'cancelled' || phase === 'superseded' ? 'Set aside' : 'Not saved';
  const sends = p.notifications.length > 0 && !p.notifications.every((n) => /^(nobody|nothing)/i.test(n));
  const lands = landsOf(view.tool, p.visual);
  return (
    <section ref={cardRef} className={'conf ch-ak-task' + (density === 'compact' ? ' is-compact' : '') + (landing && phase === 'saved' ? ' flash' : '') + (arriving ? ' is-arriving' : '')} aria-label={p.action} data-phase={phase} data-ch-code="CH-13951">
      <div className="hd">
        <span className="tt">
          <b>{copy.head}</b>
        </span>
        <span className={'dchip' + (landing && phase === 'saved' ? ' is-pop' : '')}>
          <Badge tone={phase === 'saved' ? 'positive' : phase === 'failed' || phase === 'partial' || phase === 'held' ? 'warning' : 'neutral'}>{badge}</Badge>
        </span>
      </div>
      {/* What a coach checks, whole at first paint. A withdrawn draft steps back; it is not removed (it is the record of what was offered). */}
      <div className={'ch-ak-task__body' + (isWithdrawn(phase) && phase !== 'failed' ? ' is-dim' : '')}>
        {/* A task whose body draws its own subject needs no second title; one that does not is named by the plan's summary, on the body's own inset. */}
        {!drawsSubject(view.tool) && <p className="ch-akc-sum">{p.summary}</p>}
        <CardBody tool={view.tool} proposal={p} receipt={receipt} phase={phase} density={density} roster={roster} team={team} lands={lands} onAsk={undecided && !pressed && onSend ? (text) => void onSend(text) : undefined}
          onEdit={
            undecided && !pressed && onEdit && view.approvalId
              ? (patch) => {
                  setEditSent(true);
                  setEditTried(true);
                  onEdit(view.approvalId!, patch);
                }
              : undefined
          }
          editing={editing}
          editError={editError}
          onEditOpen={openEdit}
        />
      </div>
      {undecided && evidence && (
        <button type="button" className="ch-ak-evlink" aria-expanded={evidence.open} onClick={evidence.onOpen}>
          See what this is based on
        </button>
      )}
      {undecided && p.missing.length > 0 && <p className="ch-ak-needs">Needs {p.missing.join(', ').toLowerCase()} before it can be confirmed.</p>}
      {undecided && editOpen && p.missing.length === 0 && <p className="ch-ak-needs">{editing ? 'Updating the card…' : 'Update or discard your changes first.'}</p>}
      {(undecided || (status === 'confirmed' && !receipt)) && (
        <div className="btns">
          {/* The quiet key ("Not now", or the catalogue's own word where Cancel is the action itself) leaves on Confirm but keeps its box, so the working button keeps its place (MO-7-4). */}
          <span className={'cx' + (phase === 'confirming' ? ' is-gone' : '')}>
            <Button variant="ghost" size="lg" disabled={!!pressed || !view.approvalId || !undecided} onClick={() => answer(false)} data={{ 'data-ch-ask-cancel': '' }}>
              {copy.dismiss}
            </Button>
          </span>
          {phase === 'confirming' ? (
            <span className="p cap" role="status">
              {copy.busy}
            </span>
          ) : (
            <Button variant="primary" size="lg" disabled={!!pressed || !view.approvalId || p.missing.length > 0 || editOpen} onClick={() => answer(true)} data={{ 'data-ch-ask-confirm': '' }}>
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
          onAskAgain={onSend ? () => void onSend(`Prepare this again from what is true now: ${p.summary}`) : undefined}
          onOpen={(r) => announceLanding({ key: view.key, tool: view.tool, label: p.summary, id: (r.created[0] as { id?: string } | undefined)?.id ?? null })}
          onOpenNow={(r, href) => {
            // The shell goes there its own way and marks the landing with what it knows. With no shell listening, the page loads there.
            if (onOpenReceipt) return onOpenReceipt(view, r, href);
            announceLanding({ key: view.key, tool: view.tool, label: p.summary, id: (r.created[0] as { id?: string } | undefined)?.id ?? null });
            window.location.assign(href);
          }}
          undoSignal={undoSignal}
        />
      )}
    </section>
  );
}
