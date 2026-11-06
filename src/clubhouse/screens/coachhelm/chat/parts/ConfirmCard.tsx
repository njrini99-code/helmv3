'use client';

import { Button } from '../../../../ui/Button';

import { Check, CircleAlert, ClipboardCheck, ArrowUpRight, Flag, Lock, Megaphone, CalendarPlus, StickyNote, Truck, Trophy, Target, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { formatWith } from '../../../../lib/dates';
import type { AskProposalView } from '../../../../data/coachhelm-chat-thread';
import { askLinkHref } from '../../../../data/coachhelm-chat-links';
import { CoachMark } from '../CoachMark';
import { Avatar } from '../../../../ui/Avatar';
import { Badge } from '../../../../ui/Badge';
import { Icon } from '../../../../ui/Icon';
import { Switch } from '../../../../ui/Switch';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { flyDraftHome } from '../ask-flight';
import { DateTile, GoalDraft, LineupDraft, NoteDraft, TaskDraft, TripDraft, draftDate, LockPreview, QualDraft, WeekDraft } from './DraftVisual';

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
FLOWS.create_drill = { verb: 'Add to drill bank', busy: 'Adding…', chip: 'Added' };
FLOWS.publish_practice_plan = { verb: 'Publish', busy: 'Publishing…', chip: 'Published' };
/** Where a confirmed draft lands (the page's `hs`): the screen and section, with this row on top. Its neighbours would need a read per screen, so only the new row draws. */
const APP_ICON: Record<string, LucideIcon> = { Calendar: CalendarPlus, Messages: Megaphone, Hub: Flag, Qualifiers: Flag, Tournaments: Flag, Tasks: ClipboardCheck, Stats: Flag, Home: Flag, Rounds: StickyNote, Practice: ClipboardCheck };
const LANDS: Record<string, { app: string; where: string }> = {
  create_event: { app: 'Calendar', where: 'Wednesday' },
  publish_practice_plan: { app: 'Documents', where: 'Practice plans' },
  create_recurring_practice: { app: 'Calendar', where: 'Practices' },
  create_team_announcement: { app: 'Messages', where: 'Announcements' },
  create_announcement: { app: 'Messages', where: 'Announcements' },
  create_trip: { app: 'Hub', where: 'Trips' },
  create_qualifier: { app: 'Qualifiers', where: 'This season' },
  set_lineup: { app: 'Tournaments', where: 'Lineup' },
  create_task: { app: 'Tasks', where: 'To do' },
  create_drill: { app: 'Practice', where: 'Drill bank' },
  create_goal: { app: 'Stats', where: 'Goals' },
  create_focus_area: { app: 'Home', where: 'Focus' },
  add_round_note: { app: 'Rounds', where: 'Coach notes' },
};
/** The section it lands in; an event's is its own day. */
export function landsWhere(tool: string, visual: ActionProposal['visual']): string {
  if (tool === 'create_event' && visual?.kind === 'cal' && visual.date) return formatWith(new Date(`${visual.date}T12:00:00`), { weekday: 'short', month: 'short', day: 'numeric' });
  return LANDS[tool]?.where ?? '';
}
/** The kit's head per flow (06 kit ②): what it will become, with its own mark. */
const HEAD: Record<string, { icon: LucideIcon; title: string }> = {
  create_event: { icon: CalendarPlus, title: 'New event' },
  create_trip: { icon: Truck, title: 'New trip' },
  create_qualifier: { icon: Trophy, title: 'New qualifier' },
  create_focus_area: { icon: Target, title: 'New focus' },
  create_goal: { icon: Target, title: 'New goal' },
  create_task: { icon: ClipboardCheck, title: 'New task' },
  add_round_note: { icon: StickyNote, title: 'New round note' },
  set_lineup: { icon: Users, title: 'New lineup' },
  lock_lineup: { icon: Lock, title: 'Lock the lineup' },
  create_team_announcement: { icon: Megaphone, title: 'New announcement' },
  create_announcement: { icon: Megaphone, title: 'New announcement' },
};
const fallback = { icon: ClipboardCheck, verb: () => 'Confirm', busy: 'Working…', chip: 'Done' };
/** S-ASK.*.undone: each flow's own line. A held run never wrote, so nothing is left behind whatever the words. */
const UNDONE: Record<string, string> = {
  create_event: 'Undone. The event was removed.',
  create_recurring_practice: 'Undone. The practices were removed.',
  create_team_announcement: 'Undone. Nothing was posted.',
  create_announcement: 'Undone. Nothing was posted.',
  create_trip: 'Undone. The trip was removed.',
  create_qualifier: 'Undone. The qualifier was removed.',
  create_task: 'Undone. The task was removed.',
  create_drill: 'Undone. The drill was removed.',
  create_goal: 'Undone. The goal was removed.',
  create_focus_area: 'Undone. The focus was removed.',
  add_round_note: 'Undone. Your earlier notes are back as they were.',
  set_lineup: 'Undone. The earlier lineup is back.',
};
const UNDONE_DEFAULT = 'Undone. Nothing was saved, and nobody was told.';

/** The Told row's coins, only where the card knows who: named players, or the whole roster when the count is the roster's. */
function coinNames(p: AskProposalView['proposal'], roster: ReadonlyArray<{ name: string }>): string[] {
  if (p.publish?.coins.length) return p.publish.coins.map((c) => c.name);
  const named = p.affects.filter((a) => a.kind === 'player').map((a) => a.label);
  if (named.length) return named;
  return p.affects.some((a) => a.kind === 'team') ? roster.map((r) => r.name) : [];
}

/** Kit ② to ⑤: the draft as what it will become, who hears about it, then the capsule, the receipt with 8 seconds of Undo, and the Told row. Nothing is written before the named button. */
export function ConfirmCard({ view, inlineReceipt, onApprove, onDeny, onSend, fresh = false, roster = [], team, evidence }: { view: AskProposalView; inlineReceipt: ActionReceipt | null; onApprove: (id: string) => void; onDeny: (id: string) => void; onSend?: (text: string) => void; /** The card arrived in this visit: its fields fill one at a time (M-ASK-42). A reloaded card draws still. */ fresh?: boolean; roster?: ReadonlyArray<{ name: string }>; team?: string; /** Opens the reads behind this draft, when it has any. */ evidence?: { open: boolean; onOpen: () => void } }) {
  const { proposal: p, status } = view;
  const flow = FLOWS[view.tool];
  const kind = KIND[view.tool] ?? (flow ? { icon: ClipboardCheck, verb: () => flow.verb, busy: flow.busy, chip: flow.chip } : { ...fallback, verb: () => p.action });
  const [pressed, setPressed] = useState(false);
  const receipt = inlineReceipt ?? view.receipt;
  const reduced = useChReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const [filling] = useState(fresh && !receipt && (status === 'live' || status === 'preparing'));
  const [undone, setUndone] = useState(false);
  // M-ASK-45: the write answered in this visit, so the draft flies home. A reloaded receipt draws still.
  const hadReceipt = useRef(!!receipt);
  const [landing, setLanding] = useState(false);
  useEffect(() => {
    if (hadReceipt.current || !receipt) return;
    hadReceipt.current = true;
    if (receipt.status === 'failed') return;
    const card = cardRef.current;
    const draft = card?.querySelector<HTMLElement>('.ls');
    const slot = card?.querySelector<HTMLElement>('.ch-ak-hs .hsr.nw, .ch-ak-wk .slot');
    // The event takes the slot as the copy arrives; the flash and the chip's pop belong to this one landing.
    setLanding(true);
    if (card && draft && slot) void flyDraftHome(card, draft, slot, reduced);
  }, [receipt, reduced]);
  const landed = !!receipt && receipt.status !== 'failed' && !undone;
  const players = p.affects.filter((a) => a.kind === 'player').length;
  const wholeTeam = p.affects.some((a) => a.kind === 'team');
  const count = players || (wholeTeam ? Number(p.facts.find((f) => /player|recipient/i.test(f.label))?.value.match(/\d+/)?.[0] ?? 0) : 0);
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
  const allFacts = p.publish ? p.facts.filter((f) => f.label !== 'What they get') : p.facts;
  const worked = p.publish ? [] : allFacts.filter((f) => f.source && !f.missing);
  // A worked-out value is said once, on its pill; the well keeps the rest (and everything, if every value was worked out).
  const rest = allFacts.filter((f) => !worked.includes(f));
  const facts = rest.length ? rest : allFacts;
  const visual = p.visual;
  const date = p.publish ? null : draftDate(visual);
  const announcement = view.tool === 'create_team_announcement' || view.tool === 'create_announcement';
  return (
    <section ref={cardRef} className={'conf' + (p.publish ? ' is-pub' : '') + (landing && landed ? ' flash' : '') + (filling ? ' is-fill' : '')} style={filling ? { ['--ch-n' as string]: facts.length } : undefined} aria-label={p.action}>
      <div className="hd">
        <span className="ico">
          <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={17} />
        </span>
        <span className="tt">
          <b>{p.publish ? p.publish.heading : (HEAD[view.tool]?.title ?? p.action)}</b>
          {!(p.publish && receipt) && <span>{p.summary}</span>}
        </span>
        {!(p.publish && !landed) && <span className={'dchip' + (landing && landed ? ' is-pop' : '')}><Badge tone={landed ? 'positive' : 'neutral'}>{landed ? kind.chip : undone ? 'Undone' : 'Draft'}</Badge></span>}
      </div>
      {worked.length > 0 && (
        <div className="ch-ak-worked">
          <small>Worked out</small>
          <div className="ipls">
            {worked.map((f, i) =>
              undecided && onSend ? (
                <button key={f.label} type="button" className="ipl" data-ch-press=".97" style={{ ['--ch-i' as string]: i }} onClick={() => replaceWith(`Change the ${f.label.toLowerCase()} on ${p.summary}`)}>
                  <b>{f.value}</b>
                  <span>{f.source}</span>
                </button>
              ) : (
                <span key={f.label} className="ipl" style={{ ['--ch-i' as string]: i }}>
                  <b>{f.value}</b>
                  <span>{f.source}</span>
                </span>
              ),
            )}
          </div>
        </div>
      )}
      {!cancelled && announcement && <LockPreview proposal={p} team={team} />}
      {!cancelled && visual?.kind === 'qual' && <QualDraft visual={visual} />}
      {!cancelled && visual?.kind === 'task' && <TaskDraft visual={visual} today={new Date().toISOString().slice(0, 10)} />}
      {!cancelled && visual?.kind === 'goal' && <GoalDraft visual={visual} />}
      {!cancelled && visual?.kind === 'note' && <NoteDraft visual={visual} />}
      {!cancelled && visual?.kind === 'trip' && <TripDraft visual={visual} />}
      {!cancelled && visual?.kind === 'lineup' && <LineupDraft visual={visual} />}
      <div className={'evd' + (cancelled ? ' dim' : '') + (date ? ' has-dt' : '')}>
        {date && <DateTile date={date} />}
        <div className="ls">
          {facts.map((f, i) =>
            p.publish && f.label === 'Tells' ? (
              <div key={f.label} className="f ch-cpv-pub">
                <span className="k">Tells</span>
                <span className="v">
                  <span className="avs" aria-hidden="true">
                    {p.publish.coins.map((c) => (
                      <Avatar key={c.name} name={c.name} size="xs" />
                    ))}
                    {!!p.publish.coinsMore && <span className="more ch-num">+{p.publish.coinsMore}</span>}
                  </span>
                  <span className="tells">{p.publish.tellsLine}</span>
                  {undecided && onSend && (
                    <Button variant="secondary" size="sm" className="chg" onClick={() => replaceWith(`Change who hears about ${p.summary}`)}>
                      Change
                    </Button>
                  )}
                </span>
              </div>
            ) : (
            <div key={f.label} className="f" style={{ ['--ch-i' as string]: i }}>
              <span className="k">{f.label}</span>
              {f.missing ? <span className="ns">Not set</span> : <span className="v">{f.value}</span>}
            </div>
            ),
          )}
        </div>
      </div>
      {!cancelled && visual?.kind === 'cal' && <WeekDraft visual={visual} state={undone ? 'gone' : !landed ? 'draft' : landing ? 'landing' : 'landed'} />}
      {!cancelled && visual?.kind !== 'cal' && LANDS[view.tool] && (
        <div className="ch-ak-hs">
          <div className="hs-h">
            <span className="hi">
              <Icon icon={APP_ICON[LANDS[view.tool]!.app] ?? ArrowUpRight} size={15} />
            </span>
            <b>{LANDS[view.tool]!.app}</b>
            <span>{landsWhere(view.tool, visual)}</span>
            <small>Where it lands</small>
          </div>
          <div className={'hsr nw' + (receipt ? ' is-in' : '')}>
            <span className="ri">
              <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={15} />
            </span>
            <span className="rx">
              <b>{p.summary}</b>
              <small>{receipt ? 'Just now' : 'Draft'}</small>
            </span>
            <span className="rt acc">New</span>
          </div>
          {p.neighbours?.map((n) => (
            <div key={n.title + n.sub} className="hsr">
              <span className="ri">
                <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={15} />
              </span>
              <span className="rx">
                <b>{n.title}</b>
                <small>{n.sub}</small>
              </span>
            </div>
          ))}
        </div>
      )}
      {undecided &&
        p.publish?.sample && (
          <div className="ch-cpv-sample">
            <small>What {p.publish.sample.player} gets (each player sees their own start)</small>
            <div className="preview">
              <span className="app" aria-hidden="true">
                <CoachMark />
              </span>
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
      {undecided && evidence && (
        <button type="button" className="ch-ak-evlink" aria-expanded={evidence.open} onClick={evidence.onOpen}>
          See what this is based on
        </button>
      )}
      {undecided && (
        <div className="btns">
          <Button variant="ghost" disabled={pressed || !view.approvalId} onClick={() => answer(false)}>
            Cancel
          </Button>
          {pressed ? <span className="p cap">{kind.busy}</span> : <Button variant="primary" disabled={pressed || !view.approvalId || p.missing.length > 0} onClick={() => answer(true)}>{p.publish ? p.action : kind.verb(count)}</Button>}
        </div>
      )}
      {status === 'confirmed' && !receipt && (
        <div className="btns">
          <span className="p cap">{kind.busy}</span>
        </div>
      )}
      {cancelled && <p className="cxl">Cancelled. Nothing was created.</p>}
      {receipt && <Receipt failedLine={view.tool === 'publish_practice_plan' ? 'Nothing was sent.' : undefined} onRetry={onSend ? () => onSend(`Try that again: ${p.action}, ${p.summary}`) : undefined} receipt={receipt} idempotencyKey={view.key} undoneLine={UNDONE[view.tool]} telling={p.notifications.length > 0 && !p.notifications.every((n) => /^(nobody|nothing)/i.test(n))} coins={coinNames(p, roster)} onUndone={() => setUndone(true)} />}
    </section>
  );
}

type Phase = { kind: 'held' } | { kind: 'undoing' } | { kind: 'undone' } | { kind: 'done'; receipt: ActionReceipt };

/** The receipt row. While held: the ring drains over the time left, and Undo cancels the run on the server. A reload past the window draws the durable receipt with no Undo. */
export function Receipt({ receipt, idempotencyKey, undoneLine = UNDONE_DEFAULT, telling = false, coins = [], onUndone, failedLine = 'Nothing was saved.', onRetry }: { failedLine?: string; onRetry?: () => void; receipt: ActionReceipt; idempotencyKey: string; undoneLine?: string; /** Someone hears about this once the window closes. */ telling?: boolean; /** Who was told, where the card knows. */ coins?: readonly string[]; onUndone?: () => void }) {
  const held = receipt.status === 'held' && receipt.held_until ? receipt.held_until : null;
  const [phase, setPhase] = useState<Phase>(held ? { kind: 'held' } : { kind: 'done', receipt });
  // Late: the server said the window had closed (409). A refused or dropped Undo is its own line and can be pressed again.
  const [late, setLate] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const [left] = useState(() => (held ? Math.max(0, Date.parse(held) - Date.now()) : 0));
  // M-ASK-51: at the ring's end the control fades and takes no presses, whatever the server has said yet.
  const [closed, setClosed] = useState(!!held && left === 0);
  const undoing = useRef(false);
  // The Told row's coins light only when it follows a window this visit watched; a reloaded one draws still.
  const watched = useRef(!!held);
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!held || phase.kind !== 'held' || closed) return;
    const t = setTimeout(() => setClosed(true), Math.max(0, Date.parse(held) - Date.now()));
    return () => clearTimeout(t);
  }, [held, phase.kind, closed]);
  useEffect(() => {
    if (phase.kind === 'undone') line.current?.focus();
  }, [phase.kind]);
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
    }, Math.max(0, Date.parse(held) - Date.now()) + 200);
    return () => {
      alive = false;
      clearTimeout(end);
    };
  }, [held, phase.kind, idempotencyKey]);
  const undo = async () => {
    if (undoing.current) return;
    undoing.current = true;
    setUndoFailed(false);
    setPhase({ kind: 'undoing' });
    const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}`, { method: 'DELETE' }).catch(() => null);
    undoing.current = false;
    if (res?.ok) {
      setPhase({ kind: 'undone' });
      onUndone?.();
    } else {
      if (res?.status === 409) setLate(true);
      else setUndoFailed(true);
      setPhase({ kind: 'held' });
    }
  };
  if (phase.kind === 'undone')
    return (
      <div ref={line} className="receipt undone" role="status" tabIndex={-1}>
        <div>
          <b>{undoneLine}</b>
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
          {late ? <span className="sub">Too late to undo. It’s done. Open it to change it.</span> : undoFailed ? <span className="sub">Couldn’t undo that. Try again.</span> : telling && !closed && <span className="sub">Players are told when Undo closes</span>}
        </div>
        <button
          type="button"
          className="lk"
          disabled={phase.kind === 'undoing'}
          onClick={async () => {
            const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}?now=1`, { method: 'POST' }).catch(() => null);
            const row = (await res?.json().catch(() => null)) as { receipt?: ActionReceipt | null } | null;
            const href = row?.receipt?.created.find((c) => c.href)?.href ?? receipt.created.find((c) => c.href)?.href;
            if (href) window.location.assign(askLinkHref(href) ?? href);
          }}
        >
          Open
          <Icon icon={ArrowUpRight} size={14} />
        </button>
        {!late && (
          <button type="button" className={'lk undo' + (closed ? ' gone' : '')} data-ch-ask-undo="" disabled={phase.kind === 'undoing' || closed} aria-label={closed ? 'Undo closed' : `Undo, ${Math.round(left / 1000)} seconds`} onClick={() => void undo()}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden="true">
              <circle className="trk" cx="12" cy="12" r="10" />
              <circle className="drn" cx="12" cy="12" r="10" suppressHydrationWarning style={{ animationDuration: `${left}ms` }} />
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
          <span className="sub">{failedLine}</span>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
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
        <p className={'told' + (watched.current ? ' is-live' : '')}>
          {coins.length > 0 && (
            <span className="coins" aria-hidden="true">
              {coins.slice(0, 4).map((name, i) => (
                <span key={name} className="coin" style={{ ['--ch-i' as string]: i }}>
                  <Avatar name={name} size="xs" />
                </span>
              ))}
              {coins.length > 4 && (
                <span className="coin more ch-num" style={{ ['--ch-i' as string]: 4 }}>
                  +{coins.length - 4}
                </span>
              )}
            </span>
          )}
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
