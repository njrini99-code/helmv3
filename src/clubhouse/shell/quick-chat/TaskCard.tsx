'use client';

import { useEffect, useRef, useState } from 'react';
import type { TaskVisual } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskProposalView } from '../../data/coachhelm-chat-thread';
import { EventVisual, MessageVisual, QualifierVisual } from './visuals/visuals';

const WORDS: Record<TaskVisual['kind'], { icon: string; sub: string; chip: string; busy: string; done: string; failTitle: string }> = {
  cal: { icon: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', sub: 'Team calendar', chip: 'Added', busy: 'Adding…', done: 'Added to calendar', failTitle: 'Couldn’t add the practice' },
  msg: { icon: 'M21 12a8 8 0 0 1-11.8 7L4 20l1-5A8 8 0 1 1 21 12z', sub: 'Messages', chip: 'Sent', busy: 'Sending…', done: 'Sent', failTitle: 'Couldn’t send that' },
  qual: { icon: 'M6 21V4m0 0h11l-2 4 2 4H6', sub: 'Qualifiers', chip: 'Set', busy: 'Setting…', done: 'Qualifier set', failTitle: 'Couldn’t set the qualifier' },
};
const svg = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

type Phase = { k: 'draft' } | { k: 'busy' } | { k: 'held'; until: string } | { k: 'done'; line: string; told: string | null; href: string | null } | { k: 'undone' } | { k: 'failed'; reason: string } | { k: 'cancelled' };

function phaseOf(view: AskProposalView): Phase {
  const r = view.receipt;
  if (view.status === 'cancelled' || view.status === 'abandoned') return { k: 'cancelled' };
  if (r?.status === 'held' && r.held_until) return { k: 'held', until: r.held_until };
  if (r?.status === 'failed') return { k: 'failed', reason: r.error ?? r.summary };
  if (r) return { k: 'done', line: r.summary, told: toldLine(r.notifications), href: r.created[0]?.href ?? null };
  return view.status === 'confirmed' ? { k: 'busy' } : { k: 'draft' };
}
const toldLine = (n: ReadonlyArray<{ channel: string; recipients: number; status: string }>): string | null => {
  const sent = n.filter((x) => x.status !== 'failed');
  if (!sent.length) return null;
  const most = Math.max(...sent.map((x) => x.recipients));
  return most ? `${most} ${most === 1 ? 'player' : 'players'} told.` : null;
};

/** S-TASK: the card, its visual, confirm, busy, receipt with the ring, told, undone, failed, cancelled. Every receipt value is the server's. */
export function TaskCard({ view, online, onSend, onApprove, onDeny, onOpen }: { view: AskProposalView; online: boolean; onSend: (t: string) => void; onApprove: (id: string) => void; onDeny: (id: string) => void; onOpen: (href: string) => void }) {
  const visual = view.proposal.visual ?? null;
  const w = visual ? WORDS[visual.kind] : { icon: 'M5 12l5 5 9-11', sub: 'CoachHelm', chip: 'Done', busy: 'Working…', done: 'Done', failTitle: 'That didn’t go through' };
  const [phase, setPhase] = useState<Phase>(() => phaseOf(view));
  const [late, setLate] = useState(false);
  const [locked, setLocked] = useState(false);
  const ring = useRef<SVGCircleElement>(null);
  const card = useRef<HTMLElement>(null);
  const key = view.key;

  // The server's receipt moves the phase on, except an Undo the coach already made.
  useEffect(() => {
    setPhase((p) => (p.k === 'undone' ? p : phaseOf(view)));
  }, [view]);

  // The ring is `held_until` minus now, so a reopened panel shows what's left (03 Undo time left).
  const held = phase.k === 'held' ? phase.until : null;
  useEffect(() => {
    if (!held) return;
    const left = Math.max(0, Date.parse(held) - Date.now());
    const a = ring.current?.animate([{ strokeDashoffset: 56.55 * (1 - left / 8000) }, { strokeDashoffset: 56.55 }], { duration: left, easing: 'linear', fill: 'forwards' });
    let alive = true;
    const end = setTimeout(async () => {
      for (let i = 0; i < 5 && alive; i++) {
        const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(key)}`).catch(() => null);
        const row = (await res?.json().catch(() => null)) as { receipt?: AskProposalView['receipt'] } | null;
        if (row?.receipt && row.receipt.status !== 'held') {
          if (alive) setPhase(phaseOf({ ...view, receipt: row.receipt }));
          return;
        }
        await new Promise((r) => setTimeout(r, 900));
      }
    }, left + 200);
    return () => {
      alive = false;
      a?.cancel();
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per held window
  }, [held, key]);

  const undo = async () => {
    const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setPhase({ k: 'undone' });
    else setLate(true);
  };
  const open = async () => {
    await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(key)}?now=1`, { method: 'POST' }).catch(() => null);
    const href = view.receipt?.created[0]?.href ?? (visual?.kind === 'msg' ? `/golf/dashboard/messages?conversation=${visual.conversationId}` : visual?.kind === 'qual' ? '/golf/dashboard/qualifiers' : '/golf/dashboard/calendar');
    onOpen(href);
  };

  const chip = phase.k === 'draft' || phase.k === 'busy' ? 'Draft' : phase.k === 'undone' ? 'Undone' : phase.k === 'failed' ? 'Not saved' : phase.k === 'cancelled' ? 'Cancelled' : w.chip;
  const chipClass = 'chip' + (phase.k === 'held' || phase.k === 'done' ? ' ok' : phase.k === 'failed' ? ' fail' : '');
  return (
    <article ref={card} className={'task' + (phase.k === 'held' ? ' won' : '') + (phase.k === 'cancelled' ? ' cancelled' : '')} data-kind={visual?.kind ?? 'generic'}>
      <div className="task__h">
        <span className="task__ic">{svg(w.icon)}</span>
        <span className="task__ttl">
          <b>{visual?.kind === 'cal' || visual?.kind === 'qual' ? visual.title : visual?.kind === 'msg' ? visual.thread : view.proposal.summary}</b>
          <span>{w.sub}</span>
        </span>
        <span className={chipClass}>{chip}</span>
      </div>
      <div className="task__b">
        {visual?.kind === 'cal' && <EventVisual visual={visual} landed={phase.k === 'held' || phase.k === 'done'} removed={phase.k === 'undone'} />}
        {visual?.kind === 'msg' && <MessageVisual visual={visual} sent={phase.k === 'held' || phase.k === 'done'} phase={phase.k} onTone={(t) => onSend(t === 'Plain' ? 'Make it plain' : t === 'Warmer' ? 'Make it warmer' : 'Make it shorter')} />}
        {visual?.kind === 'qual' && <QualifierVisual visual={visual} />}
        {!visual && (
          <dl className="facts">
            {view.proposal.facts.map((f) => (
              <div className="fact" key={f.label}>
                <dt>{f.label}</dt>
                <dd className={f.missing ? 'unset' : undefined}>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="task__f">
        {(phase.k === 'draft' || phase.k === 'busy') && (
          <>
            <div className="oncf">
              <span>
                <b>On confirm:</b> {view.proposal.notifications.join(' ') || 'Nobody is told.'}
              </span>
            </div>
            {!online && <p className="say quiet">You’re offline. Nothing was saved.</p>}
            <div className="btns">
              {phase.k === 'draft' && (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={locked || !view.approvalId}
                  onClick={() => {
                    setLocked(true);
                    if (view.approvalId) onDeny(view.approvalId);
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className={'btn primary' + (phase.k === 'busy' ? ' busy' : '')}
                disabled={locked || !view.approvalId || !online || phase.k === 'busy'}
                onClick={() => {
                  setLocked(true);
                  setPhase({ k: 'busy' });
                  if (view.approvalId) onApprove(view.approvalId);
                }}
              >
                <span className="lbl">{phase.k === 'busy' ? w.busy : view.proposal.action}</span>
                <span className="sweep" />
              </button>
            </div>
          </>
        )}
        {phase.k === 'held' && (
          <div className="rcpt">
            <span className="rcpt__g pop">{svg('M5 13l4 4L19 7')}</span>
            <span className="rcpt__t">
              <b>{w.done}</b>
              <span>{late ? 'Too late to undo. It’s done. Open it to change it.' : view.receipt?.summary}</span>
            </span>
            <span className="rcpt__a">
              {!late && (
                <button className="tbtn" type="button" data-a="undo" onClick={() => void undo()}>
                  <span className="undo-ring">
                    <svg viewBox="0 0 22 22">
                      <circle className="trk" cx="11" cy="11" r="9" />
                      <circle ref={ring} className="rem" cx="11" cy="11" r="9" />
                    </svg>
                  </span>
                  Undo
                </button>
              )}
              <button className="tbtn" type="button" data-a="open" onClick={() => void open()}>
                Open
              </button>
            </span>
          </div>
        )}
        {phase.k === 'done' && (
          <>
            <div className="rcpt">
              <span className="rcpt__g">{svg('M5 13l4 4L19 7')}</span>
              <span className="rcpt__t">
                <b>{w.done}</b>
                <span>{phase.line}</span>
              </span>
              <span className="rcpt__a">
                {phase.href && (
                  <button className="tbtn" type="button" data-a="open" onClick={() => onOpen(phase.href!)}>
                    Open
                  </button>
                )}
              </span>
            </div>
            {phase.told && (
              <div className="told">
                <span>{phase.told}</span>
              </div>
            )}
          </>
        )}
        {phase.k === 'undone' && (
          <div className="rcpt neutral">
            <span className="rcpt__g">{svg('M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')}</span>
            <span className="rcpt__t">
              <b>{visual?.kind === 'msg' ? 'Unsent' : 'Undone'}</b>
              <span>{visual?.kind === 'msg' ? 'Nobody saw it.' : 'Nothing was added and nobody was told.'}</span>
            </span>
          </div>
        )}
        {phase.k === 'cancelled' && (
          <div className="rcpt neutral">
            <span className="rcpt__g">{svg('M6 6l12 12M18 6L6 18')}</span>
            <span className="rcpt__t">
              <b>Cancelled</b>
              <span>Nothing was created.</span>
            </span>
          </div>
        )}
        {phase.k === 'failed' && (
          <div className="rcpt fail" role="alert">
            <span className="rcpt__g">{svg('M12 8v5M12 17h.01')}</span>
            <span className="rcpt__t">
              <b>{w.failTitle}</b>
              <span>{phase.reason}</span>
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
