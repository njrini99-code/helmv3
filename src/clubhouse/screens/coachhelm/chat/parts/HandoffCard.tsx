'use client';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, ListChecks, MessageCircle, type LucideIcon } from 'lucide-react';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { useToast } from '../../../../ui/Toast';
import { messagesPrefillHref } from '../../../messages/prefill';
import type { AskHandoffData } from '../../../../data/coachhelm-chat-thread';
import { captureBoard } from '../board-image';
import { formatWith } from '../../../../lib/dates';

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
export function HandoffCard({ handoff, tiles }: { handoff: AskHandoffData; tiles?: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const board = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const head = HEAD[handoff.kind] ?? HEAD.message;
  const { poll } = handoff;

  const open = async () => {
    setBusy(true);
    let files: File[] | undefined;
    if (handoff.kind === 'board' && tiles && board.current) {
      const picture = await captureBoard(board.current).catch(() => null);
      if (picture) files = [picture];
      else toast({ tone: 'error', title: 'Couldn’t draw the board', body: 'Your note is in the message. Nothing was sent.', code: 'CH-7001' });
    }
    setBusy(false);
    const href = messagesPrefillHref({ players: handoff.players, draft: handoff.draft, conversationId: handoff.conversationId, returnTo: 'ask', ...(poll ? { poll } : {}), ...(files ? { files } : {}) });
    if (href) router.push(href);
  };

  return (
    <section className="conf ch-ak-handoff">
      <div className="hd">
        <span className="ico">
          <Icon icon={head.icon} size={17} />
        </span>
        <span className="tt">
          <b>{handoff.title}</b>
          <span>{head.lede}</span>
        </span>
      </div>
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
            {poll.options.map((o) => (
              <li key={o} className="pr">
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
      <p className="oncf">{head.on}</p>
      <div className="btns">
        <Button variant="primary" busy={busy} onClick={() => void open()}>
          Open in Messages
        </Button>
      </div>
    </section>
  );
}
