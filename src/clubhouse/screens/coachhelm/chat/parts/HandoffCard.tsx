'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, ListChecks, MessageCircle, type LucideIcon } from 'lucide-react';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { useToast } from '../../../../ui/Toast';
import { messagesPrefillHref } from '../../../messages/prefill';
import type { AskHandoffData } from '../../../../data/coachhelm-chat-thread';
import { captureBoard } from '../board-image';
import { formatWith } from '../../../../lib/dates';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { flyDraftHome } from '../ask-flight';

const HEAD: Record<AskHandoffData['kind'], { icon: LucideIcon; on: string; lede: string }> = {
  board: { icon: LayoutGrid, on: 'Nothing is sent until you tap Send.', lede: 'You send it from Messages' },
  message: { icon: MessageCircle, on: 'Nothing is sent until you tap Send.', lede: 'You send it from Messages' },
  poll: { icon: ListChecks, on: 'Nothing is posted until you tap Send.', lede: 'You post it from the thread' },
};

function closes(iso: string | undefined): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return 'Stays open';
  return `Closes ${formatWith(at, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * A draft that opens Messages: words, a poll in its sheet or a board as a picture, from a fresh prefill on each tap
 * (TASK_FIELDS 5.4, 5.5, 5.7). This card writes nothing; the coach sends from there.
 */
export function HandoffCard({ handoff, tiles, fresh = false }: { handoff: AskHandoffData; tiles?: ReactNode; fresh?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const board = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const draft = useRef<HTMLDivElement>(null);
  const destination = useRef<HTMLSpanElement>(null);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const reduced = useChReducedMotion();
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState(false);
  const head = HEAD[handoff.kind] ?? HEAD.message;
  const { poll } = handoff;
  useEffect(() => () => controller.current?.abort(), []);

  const open = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let files: File[] | undefined;
    if (handoff.kind === 'board' && tiles && board.current) {
      const picture = await captureBoard(board.current).catch(() => null);
      if (picture) files = [picture];
      else {
        toast({ tone: 'error', title: 'Couldn’t draw the board', body: 'Nothing was sent. Your board is still here; try again.', code: 'CH-7001' });
        inFlight.current = false;
        setBusy(false);
        return;
      }
    }
    const href = messagesPrefillHref({ players: handoff.players, draft: handoff.draft, conversationId: handoff.conversationId, returnTo: 'ask', ...(poll ? { poll } : {}), ...(files ? { files } : {}) });
    if (!href) {
      toast({ tone: 'error', title: 'Choose a conversation first', body: 'Nothing was sent. Ask who this draft is for.', code: 'CH-7001' });
      inFlight.current = false;
      setBusy(false);
      return;
    }
    const signal = new AbortController();
    controller.current = signal;
    if (card.current && draft.current && destination.current) await flyDraftHome(card.current, draft.current, destination.current, reduced, { signal: signal.signal }).catch(() => undefined);
    if (signal.signal.aborted) return;
    setLanded(true);
    router.push(href);
    inFlight.current = false;
    setBusy(false);
  };

  return (
    <section ref={card} className={'conf ch-ak-handoff ch-ak-action' + (fresh ? ' is-fresh' : '') + (landed ? ' has-handoff' : '')}>
      <div className="hd">
        <span className="ico">
          <Icon icon={head.icon} size={17} />
        </span>
        <span className="tt">
          <b>{handoff.title}</b>
          <span>{head.lede}</span>
        </span>
      </div>
      <div ref={draft} className="ch-ak-handoff-body">
      {handoff.kind === 'board' && tiles && (
        <div ref={board} className="ch-ak-board" data-ch-board="">
          {handoff.draft && <p className="bnote">{handoff.draft}</p>}
          <div className="btiles">{tiles}</div>
          <small className="bft">Made in CoachHelm</small>
        </div>
      )}
      {handoff.kind === 'message' && handoff.draft && <p className="ch-ak-draftwords">{handoff.draft}</p>}
      {poll && (
        <div className="ch-ak-pollp">
          <b className="pq">{poll.question}</b>
          <ul className="po">
            {poll.options.map((o, i) => (
              <li key={o} className="pr" style={{ ['--ch-i' as string]: i }}>
                <span className="pt">{o}</span>
                <span className="pb" aria-hidden="true" />
                <span className="pn ch-num">0</span>
              </li>
            ))}
          </ul>
          <small className="pf">
            {closes(poll.closes)} · names show on votes{poll.multi ? ' · more than one answer' : ''}
          </small>
        </div>
      )}
      </div>
      <div className="ch-ak-message-home" aria-label="Where the draft opens">
        <small>Messages · draft composer</small>
        <b>{handoff.title}</b>
        <div className="ch-ak-message-composer"><span ref={destination} className="ch-ak-message-attachment" aria-hidden="true"><Icon icon={head.icon} size={18} /></span><span>{handoff.kind === 'board' ? 'Board attachment' : poll ? 'Poll draft' : 'Message draft'}</span></div>
      </div>
      <p className="oncf">{head.on}</p>
      <div className="btns">
        <Button variant="primary" busy={busy} onClick={() => void open()}>
          Open in Messages
        </Button>
      </div>
    </section>
  );
}
