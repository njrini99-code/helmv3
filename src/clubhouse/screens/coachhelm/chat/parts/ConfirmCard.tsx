'use client';

import { Receipt } from './Receipt';
export { Receipt } from './Receipt';

import { Button } from '../../../../ui/Button';

import { Bus, CircleDot, ClipboardCheck, ArrowUpRight, Flag, FolderClosed, House, Lock, Megaphone, MessageCircle, CalendarPlus, StickyNote, Truck, Trophy, Target, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { formatWith } from '../../../../lib/dates';
import type { AskProposalView } from '../../../../data/coachhelm-chat-thread';
import { CoachMark } from '../CoachMark';
import { Avatar } from '../../../../ui/Avatar';
import { Badge } from '../../../../ui/Badge';
import { Icon } from '../../../../ui/Icon';
import { Switch } from '../../../../ui/Switch';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { flyDraftCopies, flyDraftHome } from '../ask-flight';
import { FocusHome, PublishDraft } from './ActionHomes';
import { DateTile, DraftVisual, draftDate, LockPreview, WeekDraft } from './DraftVisual';
import { calendarNote, confirmSentence, spokenLine, speakFact } from './fact-speech';

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
FLOWS.send_message = { verb: 'Send', busy: 'Sending…', chip: 'Sent' };
FLOWS.publish_practice_plan = { verb: 'Publish', busy: 'Publishing…', chip: 'Published' };
/** Where a confirmed draft lands (the page's `hs`): the screen and section, with this row on top. Its neighbours would need a read per screen, so only the new row draws. */
const APP_ICON: Record<string, LucideIcon> = { Calendar: CalendarPlus, Messages: Megaphone, Hub: Bus, Qualifiers: Trophy, Tournaments: Users, Tasks: ClipboardCheck, Stats: Target, Home: House, Rounds: StickyNote, Practice: CircleDot, Documents: FolderClosed };
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
  send_message: { app: 'Messages', where: 'Thread' },
};
/** The section it lands in; an event's is its own day. */
export function landsWhere(tool: string, visual: ActionProposal['visual']): string {
  if (tool === 'create_event' && visual?.kind === 'cal' && visual.date) return formatWith(new Date(`${visual.date}T12:00:00`), { weekday: 'short', month: 'short', day: 'numeric' });
  if (tool === 'send_message' && visual?.kind === 'msg') return visual.thread;
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
  create_drill: { icon: CircleDot, title: 'New drill' },
  send_message: { icon: MessageCircle, title: 'New message' },
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
  send_message: 'Undone. The message was not sent.',
};

/** The Told row's coins, only where the card knows who: named players, or the whole roster when the count is the roster's. */
function coinNames(p: AskProposalView['proposal'], roster: ReadonlyArray<{ name: string }>): string[] {
  if (p.publish?.coins.length) return p.publish.coins.map((c) => c.name);
  const named = p.affects.filter((a) => a.kind === 'player').map((a) => a.label);
  if (named.length) return named;
  return p.affects.some((a) => a.kind === 'team') ? roster.map((r) => r.name) : [];
}

function CalendarConfirm({ date, facts, cancelled }: { date: string; facts: ReadonlyArray<{ label: string; value: string }>; cancelled: boolean }) {
  const value = (label: string) => facts.find((f) => f.label === label)?.value;
  const where = value('Where');
  return (
    <div className={'evd has-dt ch-ak-confirm' + (cancelled ? ' dim' : '')}>
      <DateTile date={date} />
      <div className="ch-ak-confirm-copy">
        <p className="ch-ak-confirm-time">{speakFact('When', value('When') ?? '', true)}</p>
        <p className="ch-ak-confirm-line">
          <span className="ch-ak-confirm-type">{speakFact('Type', value('Type') ?? 'Event', true)}</span>
          {where && where !== 'Not set' && <span className="ch-ak-confirm-where">{where}</span>}
        </p>
        <p className="ch-ak-confirm-quiet">{calendarNote(value('Invited'), value('Replies'))}</p>
      </div>
    </div>
  );
}

/** Kit ② to ⑤: the draft as what it will become, who hears about it, then the capsule, the receipt with 8 seconds of Undo, and the Told row. Nothing is written before the named button. */
export function ConfirmCard({ view, inlineReceipt, onDeny, onSettled, onSend, busy = false, fresh = false, roster = [], team, evidence }: { view: AskProposalView; inlineReceipt: ActionReceipt | null; /** Kept so older callers still type-check. Confirm does not use it: that resubmits the thread. */ onApprove?: (id: string) => void; onDeny: (id: string) => void; /** The confirm request returned a receipt. Record it on the message. Does not resubmit the thread. */ onSettled?: (key: string, approvalId: string, receipt: ActionReceipt) => void; onSend?: (text: string) => void; /** Unused. Confirm retries the same POST; it does not resubmit the thread. */ onResume?: () => void; /** The approval stream is still open. */ busy?: boolean; /** The card arrived in this visit: its fields fill one at a time (M-ASK-42). A reloaded card draws still. */ fresh?: boolean; roster?: ReadonlyArray<{ name: string }>; team?: string; /** Opens the reads behind this draft, when it has any. */ evidence?: { open: boolean; onOpen: () => void } }) {
  const { proposal: p, status } = view;
  const flow = FLOWS[view.tool];
  const kind = KIND[view.tool] ?? (flow ? { icon: ClipboardCheck, verb: () => flow.verb, busy: flow.busy, chip: flow.chip } : { ...fallback, verb: () => p.action });
  const [pressed, setPressed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [resolvedReceipt, setResolvedReceipt] = useState<ActionReceipt | null>(null);
  const receipt = resolvedReceipt ?? inlineReceipt ?? view.receipt;
  const reduced = useChReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const [filling] = useState(fresh && !receipt && (status === 'live' || status === 'preparing'));
  const [undone, setUndone] = useState(false);
  // M-ASK-45: the write answered in this visit, so the draft flies home. A reloaded receipt draws still.
  const hadReceipt = useRef(!!receipt);
  const [landing, setLanding] = useState(false);
  const [arrived, setArrived] = useState(!!receipt);
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  useEffect(() => {
    if (reduced && flight.current) {
      flight.current.abort();
      setLanding(false);
      setArrived(true);
    }
  }, [reduced]);
  useEffect(() => {
    if (hadReceipt.current || !receipt) return;
    hadReceipt.current = true;
    if (receipt.status === 'failed') return;
    const card = cardRef.current;
    const draft = card?.querySelector<HTMLElement>(p.publish ? '.ch-ak-publish-paper' : '.evd');
    const slot = card?.querySelector<HTMLElement>('.ch-ak-hs .hsr.nw, .ch-ak-dv-slot');
    // The event takes the slot as the copy arrives; the flash and the chip's pop belong to this one landing.
    setLanding(true);
    setArrived(false);
    const controller = new AbortController();
    flight.current = controller;
    const copies = card ? [...card.querySelectorAll<HTMLElement>('[data-ch-publish-slot]')] : [];
    const travel = card && draft ? p.publish ? flyDraftCopies(card, draft, copies, reduced, controller.signal) : slot ? flyDraftHome(card, draft, slot, reduced, { signal: controller.signal }) : Promise.resolve() : Promise.resolve();
    void travel.catch(() => undefined).finally(() => {
      if (controller.signal.aborted) return;
      setArrived(true);
      setLanding(false);
    });
  }, [receipt, reduced, p.publish]);
  const landed = !!receipt && receipt.status !== 'failed' && !undone;
  const players = p.affects.filter((a) => a.kind === 'player').length;
  const wholeTeam = p.affects.some((a) => a.kind === 'team');
  const count = players || (wholeTeam ? Number(p.facts.find((f) => /player|recipient/i.test(f.label))?.value.match(/\d+/)?.[0] ?? 0) : 0);
  const cancelled = status === 'cancelled' || status === 'abandoned';
  const undecided = status === 'live' || status === 'preparing';
  const confirmWrite = () => {
    setSaving(true);
    setSaveFailed(false);
    // This POST is the write. Do not also approve through the chat stream: that resubmits the same
    // message, the tool loses the claim, and the model says the draft failed.
    void fetch(`/api/coachhelm/v3/chat/actions/${encodeURIComponent(view.key)}?confirm=1`, { method: 'POST' })
      .then(async (res) => {
        const row = res.ok ? await res.json().catch(() => null) as { receipt?: ActionReceipt } | null : null;
        if (!row?.receipt || !view.approvalId) {
          setSaveFailed(true);
          setPressed(false);
          return;
        }
        setResolvedReceipt(row.receipt);
        onSettled?.(view.key, view.approvalId, row.receipt);
      })
      .catch(() => { setSaveFailed(true); setPressed(false); })
      .finally(() => setSaving(false));
  };
  const answer = (ok: boolean) => {
    if (pressed || !view.approvalId) return;
    setPressed(true);
    if (ok) confirmWrite();
    else onDeny(view.approvalId);
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
  const draftState = undone || cancelled ? 'gone' : !landed ? 'draft' : landing ? 'landing' : 'landed';
  const date = p.publish ? null : draftDate(visual);
  const announcement = view.tool === 'create_team_announcement' || view.tool === 'create_announcement';
  return (
    <section ref={cardRef} className={'conf ch-ak-action' + (p.publish ? ' is-pub' : '') + (landing && landed ? ' flash is-landing' : '') + (landed && arrived ? ' has-arrived' : '') + (filling ? ' is-fill' : '') + (cancelled ? ' is-cancelled' : '') + (undone ? ' is-undone' : '')} data-ch-action-state={undone ? 'undone' : cancelled ? 'cancelled' : receipt?.status ?? status} style={filling ? { ['--ch-n' as string]: facts.length } : undefined} aria-label={p.action}>
      <div className="hd">
        <span className="ico">
          <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={17} />
        </span>
        <span className="tt">
          <b>{p.publish ? p.publish.heading : (HEAD[view.tool]?.title ?? p.action)}</b>
          {!(p.publish && receipt) && !announcement && <span>{p.summary}</span>}
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
      {p.publish && !cancelled && <PublishDraft proposal={p} landed={landed && arrived} />}
      {!cancelled && announcement && <LockPreview proposal={p} team={team} fresh={filling} state={draftState} />}
      {!cancelled && visual?.kind !== 'cal' && <DraftVisual visual={visual} fresh={filling} state={draftState} />}
      {visual?.kind === 'cal' && date ? (
        <CalendarConfirm date={date} facts={facts} cancelled={cancelled} />
      ) : announcement ? (
        <p className={'ch-ak-meta' + (cancelled ? ' dim' : '')}>{facts.filter((f) => f.label !== 'Title' && f.label !== 'Message' && !f.missing).map((f) => spokenLine(f.label, f.value, false)).join(' · ')}</p>
      ) : (
      <div className={'evd is-said' + (cancelled ? ' dim' : '') + (date ? ' has-dt' : '')}>
        {date && <DateTile date={date} />}
        <div className="ls">
          {facts.filter((f) => f.value !== 'Not set' && !(announcement && (f.label === 'Title' || f.label === 'Message'))).map((f, i) =>
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
            <div key={f.label} className={'f' + (f.label === 'Title' ? ' t' : '') + (f.label === 'When' ? ' is-when' : '')} style={{ ['--ch-i' as string]: i }}>
              {f.missing ? <span className="ns">Not set</span> : <span className="v">{spokenLine(f.label, f.value, !!date)}</span>}
            </div>
            ),
          )}
        </div>
      </div>
      )}
      {!cancelled && visual?.kind === 'cal' && <WeekDraft visual={visual} fresh={filling} state={draftState} />}
      {!cancelled && view.tool === 'create_focus_area' && <FocusHome proposal={p} landed={landed && arrived} moving={landing} />}
      {!cancelled && visual?.kind !== 'cal' && view.tool !== 'create_focus_area' && !p.publish && LANDS[view.tool] && (
        <div className="ch-ak-hs">
          <div className="hs-h">
            <span className="hi">
              <Icon icon={APP_ICON[LANDS[view.tool]!.app] ?? ArrowUpRight} size={15} />
            </span>
            <b>{LANDS[view.tool]!.app}</b>
            <span>{landsWhere(view.tool, visual)}</span>
            <small>Where it lands</small>
          </div>
          <div className={'hsr nw' + (landed && arrived ? ' is-in' : '')}>
            <span className="ri">
              <Icon icon={HEAD[view.tool]?.icon ?? kind.icon} size={15} />
            </span>
            <span className="rx">
              <b>{p.summary}</b>
              <small>{receipt?.status === 'held' ? 'Waiting for Undo to close' : landed ? 'Just now' : 'Draft'}</small>
            </span>
            <span className="rt acc">New</span>
          </div>
          {p.neighbours?.filter((n) => n.sub !== 'Invalid Date' && !/\d{2}:\d{2}:\d{2}|\bQA\b|MOMENTIC/i.test(n.title)).map((n) => (
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
          <b>On confirm:</b> {confirmSentence(view.tool, p.notifications)}
        </p>
      )}
      {undecided && evidence && (
        <button type="button" className="ch-ak-evlink" aria-expanded={evidence.open} onClick={evidence.onOpen}>
          See what this is based on
        </button>
      )}
      {undecided && !receipt && (saving || (pressed && !saveFailed)) && (
        <div className="btns">
          <span className="p cap">{kind.busy}</span>
        </div>
      )}
      {undecided && !saving && saveFailed && (
        <div className="ch-ak-confirm-failed">
          <p>That didn’t save. Nothing was added.</p>
          <Button variant="primary" onClick={() => { setPressed(true); confirmWrite(); }}>Try again</Button>
        </div>
      )}
      {undecided && !saving && !saveFailed && !pressed && (
        <div className="btns">
          <Button variant="ghost" disabled={pressed || !view.approvalId} onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pressed || !view.approvalId || p.missing.length > 0} onClick={() => answer(true)}>{p.publish ? p.action : kind.verb(count)}</Button>
        </div>
      )}
      {status === 'confirmed' && !receipt && (
        busy || saving ? (
          <div className="btns">
            <span className="p cap">{kind.busy}</span>
          </div>
        ) : (
          <div className="ch-ak-confirm-failed">
            <p>That didn’t save. Nothing was added.</p>
            <Button variant="primary" onClick={() => { setPressed(true); confirmWrite(); }}>Try again</Button>
          </div>
        )
      )}
      {cancelled && <p className="cxl">Cancelled. Nothing was created.</p>}
      {receipt && <Receipt failedLine={view.tool === 'publish_practice_plan' ? 'Nothing was sent.' : undefined} onRetry={onSend ? () => onSend(`Try that again: ${p.action}, ${p.summary}`) : undefined} receipt={receipt} idempotencyKey={view.key} undoneLine={UNDONE[view.tool]} telling={p.notifications.length > 0 && !p.notifications.every((n) => /^(nobody|nothing)/i.test(n))} coins={coinNames(p, roster)} onResolved={setResolvedReceipt} onUndone={() => setUndone(true)} />}
      {view.tool === 'set_lineup' && receipt?.status === 'completed' && !undone && onSend && <div className="ch-ak-lock-next"><Icon icon={Lock} size={18} /><span><b>The lineup is set. It isn’t locked.</b><small>Review the lock separately. Locking cannot be undone.</small></span><Button variant="secondary" size="sm" onClick={() => onSend(`Review locking the lineup for ${p.summary}`)}>Review lock</Button></div>}
    </section>
  );
}

