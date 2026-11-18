'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CircleAlert } from 'lucide-react';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { askLinkHref } from '../../../../data/coachhelm-chat-links';
import { Avatar } from '../../../../ui/Avatar';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';

type Phase = { kind: 'held' } | { kind: 'undoing' } | { kind: 'undone' } | { kind: 'done'; receipt: ActionReceipt };
interface Props {
  receipt: ActionReceipt;
  idempotencyKey: string;
  undoneLine?: string;
  telling?: boolean;
  coins?: readonly string[];
  onUndone?: () => void;
  onResolved?: (receipt: ActionReceipt) => void;
  failedLine?: string;
  onRetry?: () => void;
}

/** A receipt follows the durable ledger. A closed ring is never treated as proof that a write or a notification succeeded. */
export function Receipt({ receipt, idempotencyKey, undoneLine = 'Undone. Nothing was saved, and nobody was told.', telling = false, coins = [], onUndone, onResolved, failedLine = 'Nothing was saved.', onRetry }: Props) {
  const held = receipt.status === 'held';
  const deadline = held && receipt.held_until ? Date.parse(receipt.held_until) : null;
  const [phase, setPhase] = useState<Phase>(held ? { kind: 'held' } : { kind: 'done', receipt });
  const [left] = useState(() => deadline ? Math.max(0, deadline - Date.now()) : 0);
  const [closed, setClosed] = useState(held && left === 0);
  const [late, setLate] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const [openFailed, setOpenFailed] = useState(false);
  const watched = useRef(held);
  const undoing = useRef(false);
  const line = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onUndone, onResolved });
  callbacks.current = { onUndone, onResolved };
  const url = `/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}`;

  // A stream may replace its held receipt before the status request answers.
  useEffect(() => {
    if (receipt.status !== 'held') setPhase((p) => p.kind === 'done' && p.receipt === receipt ? p : { kind: 'done', receipt });
  }, [receipt]);
  useEffect(() => {
    if (!held || closed) return;
    const timer = setTimeout(() => setClosed(true), Math.max(0, (deadline ?? Date.now()) - Date.now()));
    return () => clearTimeout(timer);
  }, [held, deadline, closed]);
  useEffect(() => {
    if (phase.kind === 'undone') line.current?.focus();
  }, [phase.kind]);
  useEffect(() => {
    if (!held || phase.kind !== 'held') return;
    const controller = new AbortController();
    let alive = true;
    const timer = setTimeout(async () => {
      setChecking(true);
      setCheckFailed(false);
      for (let i = 0; i < 6 && alive; i++) {
        const res = await fetch(url, { signal: controller.signal }).catch(() => null);
        const row = res?.ok ? await res.json().catch(() => null) as { status?: string; receipt?: ActionReceipt | null } | null : null;
        if (!alive) return;
        if (row?.status === 'cancelled') {
          setPhase({ kind: 'undone' });
          callbacks.current.onUndone?.();
          setChecking(false);
          return;
        }
        if (row?.receipt && row.receipt.status !== 'held') {
          setPhase({ kind: 'done', receipt: row.receipt });
          callbacks.current.onResolved?.(row.receipt);
          setChecking(false);
          return;
        }
        if (i < 5) await new Promise((resolve) => setTimeout(resolve, 900));
      }
      if (alive) { setChecking(false); setCheckFailed(true); }
    }, checkVersion ? 0 : Math.max(0, (deadline ?? Date.now()) - Date.now()) + 200);
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, [held, deadline, phase.kind, url, checkVersion]);

  const undo = async () => {
    if (undoing.current || closed) return;
    undoing.current = true;
    setUndoFailed(false);
    setPhase({ kind: 'undoing' });
    const res = await fetch(url, { method: 'DELETE' }).catch(() => null);
    undoing.current = false;
    if (res?.ok) {
      setPhase({ kind: 'undone' });
      callbacks.current.onUndone?.();
    } else {
      if (res?.status === 409) { setLate(true); setClosed(true); }
      else setUndoFailed(true);
      setPhase({ kind: 'held' });
    }
  };

  if (phase.kind === 'undone') return <div ref={line} className="receipt undone" role="status" tabIndex={-1}><div><b>{undoneLine}</b><span className="sub">Nobody was notified.</span></div></div>;
  if (phase.kind === 'held' || phase.kind === 'undoing') return (
    <div className="receipt in" role="status" aria-busy={checking || phase.kind === 'undoing'}>
      <span className="ck"><Icon icon={Check} size={13} /></span>
      <div>
        <b>{receipt.summary}</b>
        {late ? <span className="sub">Too late to undo. It’s done. Open it to change it.</span> : undoFailed ? <span className="sub">Couldn’t undo that. Try again.</span> : checkFailed ? <span className="sub">The result hasn’t come through yet. Check its status before trying again.</span> : closed ? <span className="sub">Checking that it finished…</span> : telling && <span className="sub">Players are told when Undo closes</span>}
        {openFailed && <span className="sub">Couldn’t open that yet. Check its status.</span>}
      </div>
      {checkFailed ? <Button variant="secondary" size="sm" onClick={() => setCheckVersion((v) => v + 1)}>Check status</Button> : (
        <button type="button" className="lk" disabled={phase.kind === 'undoing'} onClick={async () => {
          setOpenFailed(false);
          const res = await fetch(`${url}?now=1`, { method: 'POST' }).catch(() => null);
          const row = res?.ok ? await res.json().catch(() => null) as { receipt?: ActionReceipt | null } | null : null;
          const next = row?.receipt;
          if (next && next.status !== 'held') { setPhase({ kind: 'done', receipt: next }); callbacks.current.onResolved?.(next); }
          const href = next?.created.find((c) => c.href)?.href;
          if (href) window.location.assign(askLinkHref(href) ?? href);
          else setOpenFailed(true);
        }}>Open<Icon icon={ArrowUpRight} size={14} /></button>
      )}
      {!late && <button type="button" className={'lk undo' + (closed ? ' gone' : '')} data-ch-ask-undo="" disabled={phase.kind === 'undoing' || closed} aria-label={closed ? 'Undo closed' : `Undo, ${Math.round(left / 1000)} seconds`} onClick={() => void undo()}>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden="true"><circle className="trk" cx="12" cy="12" r="10" /><circle className="drn" cx="12" cy="12" r="10" suppressHydrationWarning style={{ animationDuration: `${Math.max(left, 8000)}ms`, animationDelay: `${left - Math.max(left, 8000)}ms` }} /></svg>
        {phase.kind === 'undoing' ? 'Undoing' : 'Undo'}
      </button>}
    </div>
  );
  const r = phase.receipt;
  if (r.status === 'failed') return <div className="receipt is-fail" role="alert"><span className="ck warn"><Icon icon={CircleAlert} size={15} /></span><div><b>{r.summary}</b><span className="sub">{failedLine}</span></div>{onRetry && r.retryable && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}</div>;
  const link = r.created.find((c) => c.href);
  const sent = r.notifications.filter((n) => n.status === 'sent');
  const queued = r.notifications.filter((n) => n.status === 'queued');
  const failed = r.notifications.filter((n) => n.status === 'failed');
  return <>
    <div className="receipt in" role="status"><span className="ck"><Icon icon={Check} size={13} /></span><div><b>{r.summary}</b>{r.status === 'partial' && <span className="sub">{r.partial_failures.join(' ')} Check what was created before you try again.</span>}</div>{link?.href && <a className="lk" href={askLinkHref(link.href) ?? link.href}>Open<Icon icon={ArrowUpRight} size={14} /></a>}</div>
    {sent.length > 0 && <p className={'told' + (watched.current ? ' is-live' : '')}>
      {coins.length > 0 && sent.some((n) => n.recipients === coins.length) && <span className="coins" aria-hidden="true">{coins.slice(0, 7).map((name, i) => <span key={name} className="coin" style={{ ['--ch-i' as string]: i }}><Avatar name={name} size="xs" /></span>)}{coins.length > 7 && <span className="coin more ch-num" style={{ ['--ch-i' as string]: 7 }}>+{coins.length - 7}</span>}</span>}
      <span className="tx">Told {sent.map((n, i) => <span key={n.channel}>{i > 0 ? ', ' : ''}<b className="ch-num">{n.recipients}</b> by {n.channel}</span>)}</span>
    </p>}
    {queued.length > 0 && <p className="told"><span className="tx">Notifications queued {queued.map((n, i) => <span key={n.channel}>{i > 0 ? ', ' : ''}for <b className="ch-num">{n.recipients}</b> by {n.channel}</span>)}</span></p>}
    {failed.length > 0 && <p className="told is-warning"><span className="tx">Saved, but {failed.map((n) => n.channel).join(' and ')} notifications didn’t go through.</span></p>}
  </>;
}
