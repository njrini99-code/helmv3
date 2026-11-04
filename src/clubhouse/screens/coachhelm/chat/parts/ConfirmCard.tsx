'use client';

import { Check, CircleAlert, ClipboardCheck, ArrowUpRight, Flag, Megaphone, CalendarPlus, Truck, Trophy, Target, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskProposalView } from '../../../../data/coachhelm-chat-thread';
import { askLinkHref } from '../../../../data/coachhelm-chat-links';
import { Icon } from '../../../../ui/Icon';
import { Switch } from '../../../../ui/Switch';

const KIND: Record<string, { icon: LucideIcon; verb: (n: number) => string; busy: string; chip: string }> = {
  create_recurring_practice: { icon: CalendarPlus, verb: () => 'Add to calendar', busy: 'Adding…', chip: 'Added' },
  create_focus_area: { icon: Flag, verb: () => 'Assign focus', busy: 'Assigning…', chip: 'Assigned' },
  create_task: { icon: ClipboardCheck, verb: () => 'Assign task', busy: 'Assigning…', chip: 'Assigned' },
  create_team_announcement: { icon: Megaphone, verb: (n) => (n > 0 ? `Post to ${n} players` : 'Post'), busy: 'Posting…', chip: 'Posted' },
};
const FLOWS: Record<string, { verb: string; busy: string; chip: string }> = {
  create_event: { verb: 'Add to calendar', busy: 'Adding…', chip: 'Added' },
  create_trip: { verb: 'Add the trip', busy: 'Adding…', chip: 'Added' },
  create_qualifier: { verb: 'Set qualifier', busy: 'Setting…', chip: 'Set' },
  create_goal: { verb: 'Set goal', busy: 'Setting…', chip: 'Set' },
  add_round_note: { verb: 'Add note', busy: 'Adding…', chip: 'Added' },
  set_lineup: { verb: 'Set lineup', busy: 'Setting…', chip: 'Set' },
  lock_lineup: { verb: 'Lock the lineup', busy: 'Locking…', chip: 'Locked' },
  add_blocked_time: { verb: 'Block time', busy: 'Blocking…', chip: 'Blocked' },
  add_team_break: { verb: 'Add break', busy: 'Adding…', chip: 'Added' },
  save_team_term: { verb: 'Save term', busy: 'Saving…', chip: 'Saved' },
  set_availability_note: { verb: 'Save note', busy: 'Saving…', chip: 'Saved' },
  create_recruit: { verb: 'Add recruit', busy: 'Adding…', chip: 'Added' },
};
FLOWS.publish_practice_plan = { verb: 'Publish', busy: 'Publishing…', chip: 'Published' };
/** Where a confirmed draft lands (the page's `hs`): the screen and section, with this row on top. Its neighbours would need a read per screen, so only the new row draws. */
const LANDS: Record<string, { app: string; where: string }> = {
  create_event: { app: 'Calendar', where: 'Wednesday' },
  create_recurring_practice: { app: 'Calendar', where: 'Practices' },
  create_team_announcement: { app: 'Messages', where: 'Announcements' },
  create_announcement: { app: 'Messages', where: 'Announcements' },
  create_trip: { app: 'Hub', where: 'Trips' },
  create_qualifier: { app: 'Qualifiers', where: 'This season' },
  set_lineup: { app: 'Tournaments', where: 'Lineup' },
  create_task: { app: 'Tasks', where: 'To do' },
  create_goal: { app: 'Stats', where: 'Goals' },
  create_focus_area: { app: 'Home', where: 'Focus' },
  add_round_note: { app: 'Rounds', where: 'Coach notes' },
};
/** The kit's head per flow (06 kit ②): what it will become, with its own mark. */
const HEAD: Record<string, { icon: LucideIcon; title: string }> = {
  create_event: { icon: CalendarPlus, title: 'New event' },
  create_trip: { icon: Truck, title: 'New trip' },
  create_qualifier: { icon: Trophy, title: 'New qualifier' },
  create_focus_area: { icon: Target, title: 'New focus' },
  create_team_announcement: { icon: Megaphone, title: 'New announcement' },
  create_announcement: { icon: Megaphone, title: 'New announcement' },
};
const fallback = { icon: ClipboardCheck, verb: () => 'Confirm', busy: 'Working…', chip: 'Done' };

/** Kit ② to ⑤: the draft as what it will become, who hears about it, then the capsule, the receipt with 8 seconds of Undo, and the Told row. Nothing is written before the named button. */
export function ConfirmCard({ view, inlineReceipt, onApprove, onDeny, onSend }: { view: AskProposalView; inlineReceipt: ActionReceipt | null; onApprove: (id: string) => void; onDeny: (id: string) => void; onSend?: (text: string) => void }) {
  const { proposal: p, status } = view;
  const flow = FLOWS[view.tool];
  const kind = KIND[view.tool] ?? (flow ? { icon: ClipboardCheck, verb: () => flow.verb, busy: flow.busy, chip: flow.chip } : { ...fallback, verb: () => p.action });
  const [pressed, setPressed] = useState(false);
  const receipt = inlineReceipt ?? view.receipt;
  const players = p.affects.filter((a) => a.kind === 'player').length;
  const team = p.affects.some((a) => a.kind === 'team');
  const count = players || (team ? Number(p.facts.find((f) => /player|recipient/i.test(f.label))?.value.match(/\d+/)?.[0] ?? 0) : 0);
  const cancelled = status === 'cancelled' || status === 'abandoned';
  const undecided = status === 'live' || status === 'preparing';
  const answer = (ok: boolean) => {
    if (pressed || !view.approvalId) return;
    setPressed(true);
    (ok ? onApprove : onDeny)(view.approvalId);
  };
  // A confirmed proposal is exactly what it said, so a change replaces it with a new one rather than editing this one.
  const replaceWith = (text: string) => {
    answer(false);
    onSend?.(text);
  };
  return (
    <section className={'conf' + (p.publish ? ' is-pub' : '') + (receipt?.status === 'completed' ? ' flash' : '')} aria-label={p.action}>
      <div className="hd">
        <span className="ico">
          <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={17} />
        </span>
        <span className="tt">
          <b>{p.publish ? p.publish.heading : (HEAD[view.tool]?.title ?? p.action)}</b>
          {!(p.publish && receipt) && <span>{p.summary}</span>}
        </span>
        {!(p.publish && receipt?.status !== 'completed') && <span className={'dchip' + (receipt?.status === 'completed' ? ' ok' : '')}>{receipt?.status === 'completed' ? kind.chip : 'Draft'}</span>}
      </div>
      <div className={'evd' + (cancelled ? ' dim' : '')}>
        <div className="ls">
          {(p.publish ? p.facts.filter((f) => f.label !== 'What they get') : p.facts).map((f) =>
            p.publish && f.label === 'Tells' ? (
              <div key={f.label} className="f ch-cpv-pub">
                <span className="k">Tells</span>
                <span className="v">
                  <span className="avs" aria-hidden="true">
                    {p.publish.coins.map((c, i) => (
                      <span key={i} className={`av t-${c.tone % 6}`}>
                        {c.initials}
                      </span>
                    ))}
                  </span>
                  <span className="tells">{p.publish.tellsLine}</span>
                  {undecided && onSend && (
                    <button type="button" className="chg" onClick={() => replaceWith(`Change who hears about ${p.summary}`)}>
                      Change
                    </button>
                  )}
                </span>
              </div>
            ) : (
            <div key={f.label} className="f">
              <span className="k">{f.label}</span>
              {f.missing ? <span className="ns">Not set</span> : <span className="v">{f.value}</span>}
              {f.source && <span className="inf">{f.source}</span>}
            </div>
            ),
          )}
        </div>
      </div>
      {!cancelled && LANDS[view.tool] && (
        <div className="ch-ak-hs">
          <div className="hs-h">
            <b>{LANDS[view.tool]!.app}</b>
            <span>{LANDS[view.tool]!.where}</span>
            <small>Where it lands</small>
          </div>
          <div className={'hsr nw' + (receipt ? ' is-in' : '')}>
            <b>{p.summary}</b>
            <span>{receipt ? 'Just now' : 'Draft'}</span>
          </div>
        </div>
      )}
      {undecided &&
        p.publish?.sample && (
          <div className="ch-cpv-sample">
            <small>What {p.publish.sample.player} gets (each player sees their own start)</small>
            <div className="preview">
              <span className="app" aria-hidden="true" />
              <span>
                <b>{p.publish.sample.title}</b>
                {p.publish.sample.body}
              </span>
            </div>
          </div>
        )}
      {undecided && p.publish?.teamChat !== undefined && onSend && (
        <div className="ch-cpv-chat">
          <span>Post the plan card in Team chat</span>
          <Switch
            hideLabel
            label="Post in Team chat"
            checked={p.publish.teamChat}
            onChange={() => replaceWith(p.publish?.teamChat ? `Publish ${p.summary} without the Team chat post` : `Publish ${p.summary} and post it in Team chat`)}
          />
        </div>
      )}
      {undecided && (
        <p className="oncf">
          <b>On confirm:</b> {p.notifications.length ? p.notifications.join(' ') : 'Nothing is sent.'}
        </p>
      )}
      {undecided && (
        <div className="btns">
          <button type="button" className="c" disabled={pressed || !view.approvalId} onClick={() => answer(false)}>
            Cancel
          </button>
          <button type="button" className={'p' + (pressed ? ' cap' : '')} data-ch-press="" disabled={pressed || !view.approvalId || p.missing.length > 0} onClick={() => answer(true)}>
            {pressed ? kind.busy : p.publish ? p.action : kind.verb(count)}
          </button>
        </div>
      )}
      {status === 'confirmed' && !receipt && (
        <div className="btns">
          <span className="p cap">{kind.busy}</span>
        </div>
      )}
      {cancelled && <p className="cxl">Cancelled. Nothing was created.</p>}
      {receipt && <Receipt receipt={receipt} idempotencyKey={view.key} />}
    </section>
  );
}

type Phase = { kind: 'held' } | { kind: 'undoing' } | { kind: 'undone' } | { kind: 'done'; receipt: ActionReceipt };

/** The receipt row. While held: the ring drains over the time left, and Undo cancels the run on the server. A reload past the window draws the durable receipt with no Undo. */
export function Receipt({ receipt, idempotencyKey }: { receipt: ActionReceipt; idempotencyKey: string }) {
  const held = receipt.status === 'held' && receipt.held_until ? receipt.held_until : null;
  const [phase, setPhase] = useState<Phase>(held ? { kind: 'held' } : { kind: 'done', receipt });
  const [late, setLate] = useState(false);
  const [left] = useState(() => (held ? Math.max(0, Date.parse(held) - Date.now()) : 0));
  const undoing = useRef(false);
  useEffect(() => {
    if (!held || phase.kind !== 'held') return;
    let alive = true;
    const end = setTimeout(async () => {
      // The server has until the function's end to finish it; ask until it says so, a few times.
      for (let i = 0; i < 5 && alive; i++) {
        const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}`).catch(() => null);
        const row = (await res?.json().catch(() => null)) as { receipt?: ActionReceipt | null } | null;
        if (row?.receipt) {
          if (alive) setPhase({ kind: 'done', receipt: row.receipt });
          return;
        }
        await new Promise((r) => setTimeout(r, 900));
      }
    }, left + 200);
    return () => {
      alive = false;
      clearTimeout(end);
    };
  }, [held, phase.kind, idempotencyKey, left]);
  const undo = async () => {
    if (undoing.current) return;
    undoing.current = true;
    setPhase({ kind: 'undoing' });
    const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}`, { method: 'DELETE' }).catch(() => null);
    undoing.current = false;
    if (res?.ok) setPhase({ kind: 'undone' });
    else {
      setLate(true);
      setPhase({ kind: 'held' });
    }
  };
  if (phase.kind === 'undone')
    return (
      <div className="receipt undone" role="status">
        <div>
          <b>Undone. Nothing was saved, and nobody was told.</b>
        </div>
      </div>
    );
  if (phase.kind === 'held' || phase.kind === 'undoing')
    return (
      <div className="receipt in" role="status">
        <span className="ck">
          <Icon icon={Check} size={13} />
        </span>
        <div>
          <b>{receipt.summary}</b>
          {late && <span className="sub">Too late to undo.</span>}
        </div>
        {!late && (
          <button type="button" className="lk undo" data-ch-ask-undo="" disabled={phase.kind === 'undoing'} onClick={() => void undo()}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden="true">
              <circle className="trk" cx="12" cy="12" r="10" />
              <circle className="drn" cx="12" cy="12" r="10" style={{ animationDuration: `${left}ms` }} />
            </svg>
            {phase.kind === 'undoing' ? 'Undoing' : 'Undo'}
          </button>
        )}
      </div>
    );
  const r = phase.receipt;
  if (r.status === 'failed')
    return (
      <div className="receipt is-fail" role="alert">
        <span className="ck warn">
          <Icon icon={CircleAlert} size={15} />
        </span>
        <div>
          <b>{r.summary}</b>
          <span className="sub">Nothing was saved.</span>
        </div>
      </div>
    );
  const link = r.created.find((c) => c.href);
  const delivered = r.notifications.filter((n) => n.status !== 'failed');
  return (
    <>
      <div className="receipt in" role="status">
        <span className="ck">
          <Icon icon={Check} size={13} />
        </span>
        <div>
          <b>{r.summary}</b>
          {r.status === 'partial' && <span className="sub">{r.partial_failures.join(' ')} Check what was created before you try again.</span>}
        </div>
        {link?.href && (
          <a className="lk" href={askLinkHref(link.href) ?? link.href}>
            Open
            <Icon icon={ArrowUpRight} size={14} />
          </a>
        )}
      </div>
      {delivered.length > 0 && (
        <p className="told">
          <span className="tx">
            Told{' '}
            {delivered.map((n, i) => (
              <span key={n.channel}>
                {i > 0 ? ', ' : ''}
                <b className="ch-num">{n.recipients}</b> by {n.channel}
              </span>
            ))}
          </span>
        </p>
      )}
    </>
  );
}
