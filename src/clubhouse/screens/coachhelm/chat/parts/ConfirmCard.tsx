'use client';

import { Button } from '../../../../ui/Button';

import { CircleAlert, ClipboardCheck, ArrowUpRight, Flag, Lock, Megaphone, CalendarPlus, StickyNote, Truck, Trophy, Target, Users, type LucideIcon } from 'lucide-react';
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
import { haptic } from '../../../../lib/haptics';
import { plural } from '../../../../lib/plural';
import { flyDraftHome } from '../ask-flight';
import { isOutOfDate } from '../cards/truth';
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
/** Where a confirmed draft appears, as the card's one quiet line ("It appears in Home, under Focus."); null where the app has no one place for it. */
export function landsLine(tool: string, visual: ActionProposal['visual']): string | null {
  const l = LANDS[tool];
  if (!l) return null;
  const where = landsWhere(tool, visual);
  return where ? `It appears in ${l.app}, under ${where}.` : `It appears in ${l.app}.`;
}
/** The same, with the place's own name, so the card's one quiet line can tell when its words already name it. */
export function landsOf(tool: string, visual: ActionProposal['visual']): { app: string; line: string } | null {
  const line = landsLine(tool, visual);
  return line ? { app: LANDS[tool]!.app, line } : null;
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
export function ConfirmCard({ view, inlineReceipt, onApprove, onDeny, onSend, fresh = false, busy = false, roster = [], team, evidence }: { view: AskProposalView; inlineReceipt: ActionReceipt | null; onApprove: (id: string) => void; onDeny: (id: string) => void; onSend?: (text: string) => void; /** The card arrived in this visit: it rises out of the answer, whole (MOTION MO-7-1). A stored card draws still. */ fresh?: boolean; /** A request is in flight. */ busy?: boolean; roster?: ReadonlyArray<{ name: string }>; team?: string; /** Opens the reads behind this draft, when it has any. */ evidence?: { open: boolean; onOpen: () => void } }) {
  const { proposal: p, status } = view;
  const flow = FLOWS[view.tool];
  const kind = KIND[view.tool] ?? (flow ? { icon: ClipboardCheck, verb: () => flow.verb, busy: flow.busy, chip: flow.chip } : { ...fallback, verb: () => p.action });
  const [pressed, setPressed] = useState(false);
  const receipt = inlineReceipt ?? view.receipt;
  const reduced = useChReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  // The plan arrives whole, so the card arrives whole: no field is staged (the old fill held the Confirm button back by over a second).
  const [arriving] = useState(fresh && !receipt && (status === 'live' || status === 'preparing'));
  // Where the write stands, from the receipt row: held (not saved yet), saved, undone or failed. Null before there is a receipt.
  const [phase, setPhase] = useState<ReceiptPhase | null>(receipt ? phaseOfReceipt(receipt) : null);
  const undone = phase === 'undone';
  // MO-7-9: the save landed in this visit, so the draft goes to its row. A stored receipt draws still.
  const wasSaved = useRef(phase === 'saved');
  const [landing, setLanding] = useState(false);
  useEffect(() => {
    if (phase !== 'saved' || wasSaved.current) return;
    wasSaved.current = true;
    const card = cardRef.current;
    const draft = card?.querySelector<HTMLElement>('.ls');
    const slot = card?.querySelector<HTMLElement>('.ch-ak-hs .hsr.nw, .ch-ak-wk .slot');
    setLanding(true);
    haptic('success');
    if (card && draft && slot) void flyDraftHome(card, draft, slot, reduced);
  }, [phase, reduced]);
  const landed = phase === 'saved';
  const holding = phase === 'held';
  // A Confirm or Cancel whose response was lost: the buttons come back, and the turn's notice offers Try again (the same decision).
  useEffect(() => {
    if (!busy && (status === 'live' || status === 'preparing')) setPressed(false);
  }, [busy, status]);
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
    <section ref={cardRef} className={'conf' + (p.publish ? ' is-pub' : '') + (landing && landed ? ' flash' : '') + (arriving ? ' is-arriving' : '')} aria-label={p.action} data-phase={phase ?? status}>
      <div className="hd">
        <span className="ico">
          <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={17} />
        </span>
        <span className="tt">
          <b>{p.publish ? p.publish.heading : (HEAD[view.tool]?.title ?? p.action)}</b>
          {!(p.publish && receipt) && <span>{p.summary}</span>}
        </span>
        {!(p.publish && !landed) && <span className={'dchip' + (landing && landed ? ' is-pop' : '')}><Badge tone={landed ? 'positive' : phase === 'failed' ? 'warning' : 'neutral'}>{landed ? kind.chip : undone ? 'Undone' : holding ? 'Holding' : phase === 'failed' ? 'Not saved' : cancelled ? 'Set aside' : 'Draft'}</Badge></span>}
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
          <div className={'hsr nw' + (landed ? ' is-in' : holding ? ' is-pending' : '')}>
            <span className="ri">
              <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={15} />
            </span>
            <span className="rx">
              <b>{p.summary}</b>
              <small>{landed ? 'Just now' : holding ? 'Not saved yet' : 'Draft'}</small>
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
          {/* Cancel leaves on Confirm but keeps its box, so the primary keeps its place (MO-7-4). */}
          <span className={'cx' + (pressed ? ' is-gone' : '')}>
            <Button variant="ghost" disabled={pressed || !view.approvalId} onClick={() => answer(false)} data={{ 'data-ch-ask-cancel': '' }}>
              Cancel
            </Button>
          </span>
          {pressed ? (
            <span className="p cap" role="status">
              {kind.busy}
            </span>
          ) : (
            <Button variant="primary" disabled={pressed || !view.approvalId || p.missing.length > 0} onClick={() => answer(true)} data={{ 'data-ch-ask-confirm': '' }}>
              {p.publish ? p.action : kind.verb(count)}
            </Button>
          )}
        </div>
      )}
      {status === 'confirmed' && !receipt && (
        <div className="btns">
          <span className="p cap">{kind.busy}</span>
        </div>
      )}
      {undecided && p.missing.length > 0 && <p className="ch-ak-needs">Needs {p.missing.join(', ').toLowerCase()} before it can be confirmed.</p>}
      {status === 'cancelled' && <p className="cxl">Cancelled. Nothing was created.</p>}
      {status === 'abandoned' && <p className="cxl">Set aside when you asked something else. Nothing was created.</p>}
      {receipt && <Receipt failedLine={view.tool === 'publish_practice_plan' ? 'Nothing was sent.' : undefined} onRetry={onSend ? () => onSend(`Try that again: ${p.action}, ${p.summary}`) : undefined} receipt={receipt} idempotencyKey={view.key} undoneLine={UNDONE[view.tool]} telling={p.notifications.length > 0 && !p.notifications.every((n) => /^(nobody|nothing)/i.test(n))} coins={coinNames(p, roster)} onPhase={setPhase} watched={fresh} />}
    </section>
  );
}

/** Where a write stands, as the card's head and its landing row need to know it. */
export type ReceiptPhase = 'held' | 'saved' | 'undone' | 'failed';

/** A stored receipt's phase. `cancelled` is the coach's Undo, recorded by the server: nothing was written, so it is never "saved". */
export function phaseOfReceipt(receipt: ActionReceipt): ReceiptPhase {
  if (receipt.status === 'held') return 'held';
  if (receipt.status === 'failed') return 'failed';
  return receipt.status === 'cancelled' ? 'undone' : 'saved';
}

type Phase = { kind: 'held' } | { kind: 'undoing' } | { kind: 'undone' } | { kind: 'done'; receipt: ActionReceipt };

/** The whole seconds left until `until`, ticking. A clock: the number changes at once each second (no count-up, no count-down animation). */
function useSecondsLeft(until: string | null, running: boolean): number {
  const [secs, setSecs] = useState(() => (until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000)) : 0));
  useEffect(() => {
    if (!until || !running) return;
    const t = setInterval(() => setSecs(Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000))), 200);
    return () => clearInterval(t);
  }, [until, running]);
  return secs;
}

/**
 * The receipt row (chat v3, SPEC Moment 7; MOTION MO-7-5 to MO-7-11). While the server holds the write: the countdown ring with
 * the seconds left inside it, "Not saved yet", and Undo. The 8 seconds are the server's (`held_until`): the ring is drawn from
 * the time left when the row arrives. When the server says it is saved the ring's place takes the check; Undo freezes the ring
 * where it was. A stored receipt past its window draws the outcome with no ring.
 */
export function Receipt({ receipt, idempotencyKey, undoneLine = UNDONE_DEFAULT, telling = false, coins = [], onPhase, watched = false, failedLine = 'Nothing was saved.', onRetry, onAskAgain, holdLine, onOpen, onOpenNow, undoSignal = 0 }: { /** The sentence beside the ring, from the capability's own copy. */ holdLine?: (seconds: number) => string; /** Called as Open is pressed, before it navigates. */ onOpen?: (receipt: ActionReceipt) => void; /** "Save now and open": the write is in, and the shell goes to `href` its own way (quick chat keeps its landing by pushing, never loading the page). Absent: the page is loaded at `href`. */ onOpenNow?: (receipt: ActionReceipt, href: string) => void; /** Rises by one when several cards are undone together: this row presses its own Undo. */ undoSignal?: number; failedLine?: string; onRetry?: () => void; /** The card is no longer true (`card_out_of_date`): the one way on is to ask again. */ onAskAgain?: () => void; receipt: ActionReceipt; idempotencyKey: string; undoneLine?: string; /** Someone hears about this once the window closes. */ telling?: boolean; /** Who was told, where the card knows. */ coins?: readonly string[]; onPhase?: (phase: ReceiptPhase) => void; /** This visit saw the write happen: its check draws and "Told" follows. A stored one draws still. */ watched?: boolean }) {
  const held = receipt.status === 'held' && receipt.held_until ? receipt.held_until : null;
  const [phase, setPhase] = useState<Phase>(held ? { kind: 'held' } : receipt.status === 'cancelled' ? { kind: 'undone' } : { kind: 'done', receipt });
  // The hold this row began with, kept after the server's final receipt replaces the held one (the ring's clock must not restart).
  const [heldUntil] = useState(held);
  // The final receipt arrives on the Confirm's own stream when the hold ends (engine E15): the row follows it. `cancelled` is the
  // server's record of Undo.
  useEffect(() => {
    if (receipt.status === 'held') return;
    setPhase((now) => (now.kind === 'undone' ? now : receipt.status === 'cancelled' ? { kind: 'undone' } : { kind: 'done', receipt }));
  }, [receipt]);
  // Late: the server said the window had closed (409). A refused or dropped Undo is its own line and can be pressed again.
  const [late, setLate] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const [left] = useState(() => (held ? Math.max(0, Date.parse(held) - Date.now()) : 0));
  // At the ring's end the control takes no presses, whatever the server has said yet.
  const [closed, setClosed] = useState(!!held && left === 0);
  // The result is taking a moment after the ring ended (MO-7-8): said only once the wait is real.
  const [saving, setSaving] = useState(false);
  const undoing = useRef(false);
  const line = useRef<HTMLDivElement>(null);
  // The coach just pressed Confirm: the countdown that follows must be on screen, so the row is brought into view if it is not.
  const holdRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (held) holdRow.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [held]);
  const secs = useSecondsLeft(held, phase.kind === 'held' && !closed);
  const report = useRef(onPhase);
  useEffect(() => {
    report.current = onPhase;
  });
  useEffect(() => {
    report.current?.(phase.kind === 'undone' ? 'undone' : phase.kind === 'done' ? (phase.receipt.status === 'failed' ? 'failed' : phase.receipt.status === 'held' ? 'held' : 'saved') : 'held');
  }, [phase]);
  useEffect(() => {
    if (!held || phase.kind !== 'held' || closed) return;
    const t = setTimeout(() => setClosed(true), Math.max(0, Date.parse(held) - Date.now()));
    return () => clearTimeout(t);
  }, [held, phase.kind, closed]);
  useEffect(() => {
    if (!closed || phase.kind !== 'held') return;
    const t = setTimeout(() => setSaving(true), 300);
    return () => clearTimeout(t);
  }, [closed, phase.kind]);
  useEffect(() => {
    if (phase.kind === 'undone') line.current?.focus();
  }, [phase.kind]);
  useEffect(() => {
    if (!held || phase.kind !== 'held') return;
    let alive = true;
    const end = setTimeout(async () => {
      // A fallback: the stream delivers the outcome when the hold ends. This asks only if it has not (a lost connection), a few times.
      for (let i = 0; i < 5 && alive; i++) {
        const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}`).catch(() => null);
        const row = (await res?.json().catch(() => null)) as { receipt?: ActionReceipt | null } | null;
        if (row?.receipt) {
          if (alive) setPhase({ kind: 'done', receipt: row.receipt });
          return;
        }
        await new Promise((r) => setTimeout(r, 900));
      }
    }, Math.max(0, Date.parse(held) - Date.now()) + 1500);
    return () => {
      alive = false;
      clearTimeout(end);
    };
  }, [held, phase.kind, idempotencyKey]);
  const undo = async () => {
    if (undoing.current) return;
    undoing.current = true;
    setUndoFailed(false);
    haptic('warning');
    setPhase({ kind: 'undoing' });
    const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}`, { method: 'DELETE' }).catch(() => null);
    undoing.current = false;
    if (res?.ok) {
      setPhase({ kind: 'undone' });
    } else {
      if (res?.status === 409) setLate(true);
      else setUndoFailed(true);
      setPhase({ kind: 'held' });
    }
  };
  const saveNow = async () => {
    const res = await fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(idempotencyKey)}?now=1`, { method: 'POST' }).catch(() => null);
    const row = (await res?.json().catch(() => null)) as { receipt?: ActionReceipt | null } | null;
    const href = row?.receipt?.created.find((c) => c.href)?.href ?? receipt.created.find((c) => c.href)?.href;
    if (!href) return;
    const to = askLinkHref(href) ?? href;
    if (onOpenNow) onOpenNow(row?.receipt ?? receipt, to);
    else window.location.assign(to);
  };
  // Several cards undone together (the batch bar's one Undo): each row takes it back through its own Undo, so each says what it did.
  const undoRef = useRef(undo);
  useEffect(() => {
    undoRef.current = undo;
  });
  const undoSeen = useRef(undoSignal);
  const canUndo = phase.kind === 'held' && !closed && !late;
  useEffect(() => {
    if (undoSignal === undoSeen.current) return;
    undoSeen.current = undoSignal;
    if (canUndo) void undoRef.current();
  }, [undoSignal, canUndo]);
  if (phase.kind === 'undone')
    return (
      <div ref={line} className="receipt undone" role="status" tabIndex={-1}>
        <div>
          <b>{undoneLine}</b>
        </div>
      </div>
    );
  if (phase.kind === 'held' || phase.kind === 'undoing') {
    const frozen = phase.kind === 'undoing' || closed;
    const when = plural(secs, 'second');
    return (
      <div ref={holdRow} className="receipt is-hold" role="status" aria-label={`${receipt.action}. Not saved yet. Undo is available for ${Math.round(left / 1000)} seconds.`}>
        {/* The countdown: what happens if the coach does nothing, drawn as time. Linear, because it is a clock. Its place becomes the check. */}
        <span className={'cd' + (frozen ? ' is-frozen' : '')} aria-hidden="true">
          <svg viewBox="0 0 28 28" fill="none">
            <circle className="trk" cx="14" cy="14" r="12" />
            <circle className="drn" cx="14" cy="14" r="12" pathLength="100" suppressHydrationWarning style={{ animationDuration: `${left}ms`, ['--ch-rm-animation' as string]: `${left}ms` }} />
          </svg>
          {!closed && <span className="n ch-num">{secs}</span>}
        </span>
        <div>
          <b>{receipt.summary}</b>
          <span className="sub" aria-hidden="true">
            {late ? 'Too late to undo. It’s saved. Open it to change it.' : undoFailed ? 'Couldn’t undo that. Try again.' : phase.kind === 'undoing' ? 'Undoing…' : closed ? (saving ? 'Saving…' : 'Not saved yet.') : holdLine ? holdLine(secs) : telling ? `Not saved yet. Saves in ${when}, then players are told.` : `Not saved yet. Saves in ${when}.`}
          </span>
          {!closed && phase.kind === 'held' && (
            <button type="button" className="lk now" onClick={() => void saveNow()}>
              Save now and open
              <Icon icon={ArrowUpRight} size={14} />
            </button>
          )}
        </div>
        {!late && !closed && (
          <Button variant="secondary" size="sm" disabled={phase.kind === 'undoing'} onClick={() => void undo()} aria={{ label: `Undo, ${when} left` }} data={{ 'data-ch-ask-undo': '' }}>
            Undo
          </Button>
        )}
      </div>
    );
  }
  const r = phase.receipt;
  if (r.status === 'failed') {
    // Out of date: repeating the same card can never work, so there is no Try again. Asking again plans it from what is true now.
    const stale = isOutOfDate(r);
    return (
      <div className="receipt is-fail" role="alert" data-stale={stale ? '' : undefined}>
        <span className="ck warn">
          <Icon icon={CircleAlert} size={15} />
        </span>
        <div>
          {/* The server's own sentence says what changed; the bold line is short so the row reads at a glance. */}
          <b>{stale ? 'This card is out of date' : r.summary}</b>
          <span className="sub">{stale ? r.summary || 'Things changed since this card was made. Ask again and it is prepared from what is true now.' : failedLine}</span>
        </div>
        {stale
          ? onAskAgain && (
              <Button variant="secondary" size="sm" onClick={onAskAgain} data={{ 'data-ch-ask-again': '' }}>
                Ask again
              </Button>
            )
          : onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
      </div>
    );
  }
  const link = r.created.find((c) => c.href);
  const delivered = r.notifications.filter((n) => n.status !== 'failed');
  // The check draws, and "Told" follows it, only for a save this visit watched (it arrived live, or its hold was on screen).
  const live = watched || !!heldUntil;
  return (
    <>
      <div className={'receipt in' + (live ? ' is-live' : '')} role="status">
        <span className="ck">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 7.5 5.6 10.5 11.5 3.8" pathLength="24" />
          </svg>
        </span>
        <div>
          <b>{r.summary}</b>
          {r.status === 'partial' && <span className="sub">{r.partial_failures.join(' ')} Check what was created before you try again.</span>}
        </div>
        {link?.href && (
          <a className="lk" href={askLinkHref(link.href) ?? link.href} onClick={() => onOpen?.(r)}>
            Open
            <Icon icon={ArrowUpRight} size={14} />
          </a>
        )}
      </div>
      {delivered.length > 0 && (
        <p className={'told' + (live ? ' is-live' : '')}>
          {/* Coins say who, so they show only when they're everyone the count says was told. */}
          {coins.length > 0 && delivered.some((n) => n.recipients === coins.length) && (
            <span className="coins" aria-hidden="true">
              {coins.slice(0, 4).map((name) => (
                <span key={name} className="coin">
                  <Avatar name={name} size="xs" />
                </span>
              ))}
              {coins.length > 4 && <span className="coin more ch-num">+{coins.length - 4}</span>}
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
