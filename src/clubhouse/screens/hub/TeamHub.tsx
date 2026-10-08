'use client';

import { ClipboardList, Megaphone, Plane, Plus, User, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { m } from 'motion/react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChHubRsvp, ChHubTask, ChHubTrip, ChRsvp, ChTeamHub } from '../../data/hub';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { PageRefreshNotice, RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Swap } from '../../ui/Swap';
import { chSpring } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { normalise, useAction, type ServerResult } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { tabListKeys } from '../../lib/tabs';
import { HUB_TABS, type ChHubTab } from '../../lib/hub-tabs';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { Announcement, Documents, NewAnnouncementLine, Rsvps, Tasks, TripPass, Updates } from './parts';
import { AssignSheet, ComposeSheet, ConfirmDelete, TripSheet, type ChAnnouncementEdit } from './sheets';
import { TripEditSheet } from './trip-edit';
import { LIVE_HUB_WRITES, type ChHubWrites } from './writes';
import '../../styles/hub.css';

// The tabs and their `?tab=` parser live in a plain module so the server route can call the parser.
export { parseHubTab, type ChHubTab } from '../../lib/hub-tabs';

type Pending = { kind: 'ann'; a: ChHubAnnouncement } | { kind: 'task'; t: ChHubTask } | { kind: 'file'; f: ChHubFile } | { kind: 'trip'; t: ChHubTrip } | null;

const withId = (id: string) => (s: Set<string>) => new Set(s).add(id);
const withoutId = (id: string) => (s: Set<string>) => {
  const next = new Set(s);
  next.delete(id);
  return next;
};

/**
 * An optimistic change that lives inside its action, so the error toast's Retry (which re-runs the action, not the
 * handler that called it) shows the change again: `apply` shows it at once, `undo` puts things back when the write is
 * refused or throws. useAction turns a throw into a failure, so undo runs before the throw goes on.
 */
async function optimistic<T>(apply: () => void, undo: () => void, write: () => Promise<ServerResult<T>>): Promise<ServerResult<T>> {
  apply();
  try {
    const res = await write();
    if (!normalise(res).success) undo();
    return res;
  } catch (err) {
    undo();
    throw err;
  }
}

/**
 * Team Hub (design/handoff/hub.jsx; spec docs/clubhouse/phone/team-hub.md):
 * one page for both roles. A player replies to events, acknowledges posts,
 * checks off tasks and opens the team's files and trips; a coach posts, plans
 * trips, assigns tasks and shares files, and sees who has replied, read and
 * done each. Every change is optimistic where it can be undone by a failure,
 * and every failure keeps what was typed (useAction's toasts, D-69).
 */
/**
 * P010-A3: the Announcements tab's right margin on desktop, for the coach: the post in view and how many have read it,
 * held in place while the page scrolls. Only what the page already has (the count and the recipients); the names are
 * in Messages' announcement pane.
 */
function ReadMargin({ anns }: { anns: ChHubAnnouncement[] }) {
  const [id, setId] = useState(anns[0]!.id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).dataset.ann!, e.isIntersecting ? e.intersectionRatio : 0);
        const best = [...seen].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) setId(best[0]);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of document.querySelectorAll<HTMLElement>('.ch-hb-list [data-ann]')) io.observe(el);
    return () => io.disconnect();
  }, [anns]);
  const a = anns.find((x) => x.id === id) ?? anns[0]!;
  const left = Math.max(0, a.recipients - a.ackCount);
  const pct = a.recipients ? Math.round((a.ackCount / a.recipients) * 100) : 0;
  return (
    <aside className="ch-hb-margin" aria-label="Who has read it" aria-live="polite">
      <span className="ch-hb-margin__k">{a.needAck ? 'Acknowledged' : 'Read'}</span>
      <b className="ch-hb-margin__t">{a.title}</b>
      <span className="ch-hb-reads ch-num">
        <span className="ch-hb-reads__t" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        {a.ackCount} of {a.recipients}
      </span>
      <span className="ch-hb-margin__n ch-num">{left === 0 ? 'Everyone has.' : `${left} ${left === 1 ? 'hasn’t' : 'haven’t'} yet.`}</span>
    </aside>
  );
}

export function TeamHub({ data, writes = LIVE_HUB_WRITES, initialTab, viewerName }: { data: ChTeamHub; writes?: ChHubWrites; initialTab?: ChHubTab; viewerName: string }) {
  const router = useRouter();
  const phone = useChPhone();
  const backFromMore = useBackFromMore();
  const coach = data.role === 'coach';
  const [tab, setTab] = useState<ChHubTab>(initialTab ?? 'home');
  // The underline moves on the press (CH-10602); the panel renders just behind it.
  const shownTab = useDeferredValue(tab);
  const reduced = useChReducedMotion();
  const [replies, setReplies] = useState(() => new Map<string, ChRsvp>());
  const [acked, setAcked] = useState(() => new Set<string>());
  const [pendingWrites, setPendingWrites] = useState(() => new Set<string>());
  const [done, setDone] = useState(() => new Set<string>());
  // Tasks the player unticked this visit, over what the page loaded as completed.
  const [undone, setUndone] = useState(() => new Set<string>());
  const [gone, setGone] = useState(() => new Set<string>());
  const [compose, setCompose] = useState(false);
  // The post open in the edit sheet, and the edits that have landed (shown at once; the page's read follows).
  const [editing, setEditing] = useState<ChHubAnnouncement | null>(null);
  const [edited, setEdited] = useState(() => new Map<string, ChAnnouncementEdit>());
  const [tripOpen, setTripOpen] = useState(false);
  // The trip open in the edit sheet.
  const [editingTrip, setEditingTrip] = useState<ChHubTrip | null>(null);
  const [assign, setAssign] = useState(false);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = () => router.refresh();

  // Every follow-up to a write (the optimistic tick and its undo, the tab that opens, the refresh, the row that leaves,
  // the dialog that closes) lives inside the action. The error toast's Retry re-runs the action and nothing else, so
  // whatever sat after `await x.run()` in a handler was skipped when a Retry landed. The sheets (sheets.tsx) do the same.

  // ── Player writes (optimistic; a failure puts the state back) ──
  // The reply the server last confirmed, per event: the way back after a refusal. A toast's Retry runs an earlier
  // render's action, so the way back can't be read from that render's state.
  const confirmedReply = useRef(new Map<string, ChRsvp>());
  // Gates live with the Hub, rather than a tab's rows: remounts and older toast Retries share the same lock.
  const inFlight = useRef(new Set<string>());
  const guarded = async (key: string, write: () => Promise<ServerResult>): Promise<ServerResult> => {
    if (inFlight.current.has(key)) return { success: false, error: 'busy' };
    inFlight.current.add(key);
    setPendingWrites(withId(key));
    try {
      return await write();
    } finally {
      inFlight.current.delete(key);
      setPendingWrites(withoutId(key));
    }
  };
  const replyPending = (r: ChHubRsvp) => pendingWrites.has(`reply:${r.eventId}`);
  const ackPending = (a: ChHubAnnouncement) => pendingWrites.has(`ack:${a.id}`);
  const taskPending = (t: ChHubTask) => pendingWrites.has(`task:${t.id}`);
  const reply = (r: ChHubRsvp, answer: Exclude<ChRsvp, 'pending'>) =>
    guarded(`reply:${r.eventId}`, () => optimistic(
      () => setReplies((m) => new Map(m).set(r.eventId, answer)),
      () => setReplies((m) => {
        const next = new Map(m);
        const was = confirmedReply.current.get(r.eventId);
        if (was) next.set(r.eventId, was);
        else next.delete(r.eventId);
        return next;
      }),
      async () => {
        const res = await writes.reply(r.eventId, answer);
        if (normalise(res).success) confirmedReply.current.set(r.eventId, answer);
        return res;
      },
    ));
  const confirmedAck = useRef(new Set<string>());
  const ack = (a: ChHubAnnouncement) => guarded(`ack:${a.id}`, () => optimistic(
    () => setAcked(withId(a.id)),
    () => setAcked(confirmedAck.current.has(a.id) ? withId(a.id) : withoutId(a.id)),
    async () => {
      const res = await writes.acknowledge(a.id);
      if (normalise(res).success) confirmedAck.current.add(a.id);
      return res;
    },
  ));
  const confirmedTask = useRef(new Map<string, boolean>());
  const toggle = (t: ChHubTask, nextDone: boolean) => guarded(`task:${t.id}`, () => optimistic(
    () => {
      setDone(nextDone ? withId(t.id) : withoutId(t.id));
      setUndone(nextDone ? withoutId(t.id) : withId(t.id));
    },
    () => {
      // Restore the last confirmed state, including a task reopened earlier in this visit.
      const wasDone = confirmedTask.current.get(t.id) ?? t.status === 'completed';
      setDone(wasDone ? withId(t.id) : withoutId(t.id));
      setUndone(wasDone ? withoutId(t.id) : withId(t.id));
    },
    async () => {
      const res = await (nextDone ? writes.completeTask(t.id) : writes.uncompleteTask(t.id));
      if (normalise(res).success) confirmedTask.current.set(t.id, nextDone);
      return res;
    },
  ));
  // The next trip whose travelers are known: the "<trip> travelers" audience in New announcement.
  // A trip deleted this visit leaves at once; the page's read follows.
  const tripRows = useMemo(() => data.trips.rows.filter((t) => !gone.has(t.id)), [data.trips.rows, gone]);
  const travelTrip = tripRows.find((t) => t.upcoming && t.travelerIds && t.travelerIds.length > 0);
  const travelAudience = travelTrip?.travelerIds ? { label: `${travelTrip.name} travelers`, ids: travelTrip.travelerIds } : undefined;
  const taskDone = (t: ChHubTask) => (t.status === 'completed' || done.has(t.id)) && !undone.has(t.id);
  const open = useAction(
    'hub.openDocument',
    async (f: ChHubFile) => {
      // The tab has to open inside the tap or Safari blocks it, so it opens first and the signed link fills it in. That
      // holds because useAction calls this straight from the tap (a toast's Retry is a tap too) before its first await;
      // while offline it never gets here, so no blank tab flashes.
      const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
      setOpening(f.id);
      try {
        const res = await writes.openDocument(f.id);
        const landed = normalise(res);
        if (landed.success && landed.data) {
          if (win) win.location.href = landed.data.url;
          else window.location.assign(landed.data.url);
        } else win?.close();
        return res;
      } catch (err) {
        win?.close();
        throw err;
      } finally {
        setOpening(null);
      }
    },
    (f) => ({ done: '', failed: `Couldn’t open ${f.title}`, hint: 'The file may have been removed. Try again, or ask your coach to share it again.', code: 'CH-10004' }),
  );

  // ── Coach writes (the three forms are in sheets.tsx, each with its own action) ──
  const upload = useAction(
    'hub.uploadDocument',
    async (f: File) => {
      const res = await writes.uploadDocument({ teamId: data.teamId, file: f, folder: null });
      if (normalise(res).success) refresh();
      return res;
    },
    (f) => ({ done: `${f.name} shared with the team`, failed: `Couldn’t upload ${f.name}`, hint: 'Check the file is under 50 MB and try again.', code: 'CH-10008' }),
  );
  const remove = useAction(
    'hub.delete',
    async (p: NonNullable<Pending>) => {
      const res = await (p.kind === 'ann'
        ? writes.deleteAnnouncement(p.a.id)
        : p.kind === 'task'
          ? writes.deleteTask(p.t.id)
          : p.kind === 'trip'
            ? writes.deleteTrip(p.t.id)
            : writes.deleteDocument(p.f.id));
      if (normalise(res).success) {
        setGone(withId(p.kind === 'ann' ? p.a.id : p.kind === 'task' || p.kind === 'trip' ? p.t.id : p.f.id));
        setConfirm(null);
        refresh();
      }
      return res;
    },
    (p) => {
      const name = p.kind === 'ann' ? `“${p.a.title}”` : p.kind === 'task' ? p.t.title : p.kind === 'trip' ? p.t.name : p.f.title;
      return { done: `Deleted ${name}`, failed: `Couldn’t delete ${name}`, code: 'CH-10009' };
    },
  );

  const onReply = reply;
  const onAck = ack;
  const onToggle = toggle;
  const onOpen = (f: ChHubFile) => void open.run(f);
  const onUpload = async (files: File[]) => {
    setUploading(true);
    try {
      for (const f of files) await upload.run(f);
    } finally {
      setUploading(false);
    }
  };
  const onConfirmDelete = () => {
    if (confirm) void remove.run(confirm);
  };
  // CH-10702: the warning comes before the question.
  const askDelete = (p: NonNullable<Pending>) => {
    haptic('warning');
    setConfirm(p);
  };

  // A coach's Edit and Delete on a trip.
  const tripActions = coach ? { onEdit: setEditingTrip, onDelete: (t: ChHubTrip) => askDelete({ kind: 'trip', t }) } : {};

  const anns = useMemo(
    () => data.announcements.rows.filter((a) => !gone.has(a.id)).map((a) => (edited.has(a.id) ? { ...a, ...edited.get(a.id) } : a)),
    [data.announcements.rows, gone, edited],
  );
  const tasks = useMemo(() => ({ ...data.tasks, rows: data.tasks.rows.filter((t) => !gone.has(t.id)) }), [data.tasks, gone]);
  const docs = useMemo(() => ({ ...data.documents, folders: data.documents.folders.map((f) => ({ ...f, files: f.files.filter((d) => !gone.has(d.id)) })).filter((f) => f.files.length) }), [data.documents, gone]);
  const isAcked = (a: ChHubAnnouncement) => a.acked || acked.has(a.id);
  // The Home card: the newest post still waiting on this player, else the newest (no pinned posts yet, Q-70).
  const featured = anns.find((a) => !coach && a.needAck && (ackPending(a) || !isAcked(a))) ?? anns[0] ?? null;
  const upcoming = tripRows.filter((t) => t.upcoming);
  const nextTrip = upcoming[0] ?? null;
  // The page is empty only when every read answered and every one was empty: a failed read (updates included) shows its
  // own notice, and an update to read is something to show.
  const nothing =
    !data.announcements.error &&
    !data.trips.error &&
    !data.tasks.error &&
    !data.documents.error &&
    !data.updates.error &&
    !anns.length &&
    !tripRows.length &&
    !tasks.rows.length &&
    !docs.folders.length &&
    !data.updates.rows.length;
  // More than one read failed: the page says so once under its head, with one Try again for all of them (CH-1209), and
  // each failed section keeps its heading with a covered notice marking the gap. One failure keeps its own notice.
  const failedParts = [
    data.rsvps.error && (coach ? 'this week’s replies' : 'your events'),
    data.announcements.error && 'announcements',
    data.trips.error && 'travel',
    data.updates.error && 'updates',
    data.tasks.error && (coach ? 'tasks' : 'your tasks'),
    data.documents.error && 'documents',
  ].filter((part): part is string => !!part);
  const covered = failedParts.length > 1;

  // CH-10701: a tab, a reply or a chip ticks; the current one is silent.
  const pick = (t: ChHubTab) => {
    if (t === tab) return;
    haptic('select');
    chTrail(`hub tab ${t}`);
    setTab(t);
  };
  // P010 D2: the tab is in the URL (?tab=), so a reload, Back from a page it opened and a shared link land on it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === 'home') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [tab]);
  const tabKeys = tabListKeys(
    HUB_TABS[data.role].map(([k]) => k),
    tab,
    pick,
    (k) => `ch-hb-tab-${k}`,
  );
  const openCompose = () => {
    setTab('ann');
    setCompose(true);
  };
  // P010 D6: the head's one primary follows the tab (Documents' own drop zone is its primary), and a tab whose read
  // failed offers none.
  const primary = !coach
    ? null
    : (tab === 'home' || tab === 'ann') && !data.announcements.error
      ? { label: 'New announcement', icon: Plus, run: openCompose }
      : tab === 'travel' && !data.trips.error
        ? { label: 'Plan a trip', icon: Plane, run: () => setTripOpen(true) }
        : tab === 'tasks' && !data.tasks.error
          ? { label: 'Assign a task', icon: Plus, run: () => setAssign(true) }
          : null;

  return (
    <main className={'ch-hb' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hb-title" data-canopy={phone ? undefined : ''}>
      {phone && !coach && <PhoneTop start title="Team Hub" />}
      {phone && coach && <PhoneTop title="Team Hub" back={{ label: 'More', onBack: backFromMore }} />}
      <header className="ch-hb-h" data-canopy-head="">
        <div>
          <span className="ch-hb-role">
            <Icon icon={coach ? ClipboardList : User} size={12} />
            {coach ? 'Coach view' : 'Player view'}
          </span>
          <h1 id="ch-hb-title" className={phone ? 'ch-sr-only' : undefined}>
            Team Hub
          </h1>
          <span className="ch-hb-muted">{[data.teamName, data.season].filter(Boolean).join(' · ')}</span>
        </div>
        {primary && (
          <Button variant="primary" leftIcon={primary.icon} onClick={primary.run}>
            {primary.label}
          </Button>
        )}
      </header>

      <PageRefreshNotice parts={failedParts} />

      {/* CH-10801: real tabs, each controlling its panel. */}
      <div className="ch-hb-tabs" role="tablist" aria-label="Team Hub sections">
        {HUB_TABS[data.role].map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`ch-hb-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`ch-hb-panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => pick(k)}
            onKeyDown={tabKeys}
          >
            {l}
            {tab === k && <m.span className="ch-hb-tabs__bar" layoutId={reduced ? undefined : 'hb-tab'} transition={chSpring('smooth', reduced)} aria-hidden="true" />}
          </button>
        ))}
      </div>

      {/* The tab's panel swaps behind the underline that already moved (CH-10603). */}
      <Swap swapKey={shownTab}>
        <div role="tabpanel" id={`ch-hb-panel-${shownTab}`} aria-labelledby={`ch-hb-tab-${shownTab}`} className="ch-hb-panel">
          {shownTab === 'home' &&
            (nothing && data.rsvps.rows.length === 0 && !data.rsvps.error ? (
              <EmptyState
                size="page"
                code={coach ? 'CH-10305' : 'CH-10306'}
                icon={coach ? Megaphone : UsersRound}
                title={coach ? 'Nothing posted yet' : 'No team updates yet'}
                body={coach ? 'Post an announcement, plan a trip or share a document. Everything you post shows up in your players’ Team Hub.' : 'Announcements, trips and documents from your coaches will show up here.'}
                // The head's New announcement is the page's one primary action on every tab (states audit b9): the empty
                // offers the other way to start, not a second copy of it.
                secondaryAction={
                  coach ? (
                    <Button
                      leftIcon={Plane}
                      onClick={() => {
                        setTab('travel');
                        setTripOpen(true);
                      }}
                    >
                      Plan a trip
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="ch-hb-home">
                <div className="ch-hb-col">
                  <SectionBoundary surface="hub.rsvps" label="RSVPs" code="CH-10205">
                    <Rsvps role={data.role} data={data.rsvps} replies={replies} isPending={replyPending} onReply={onReply} compact={phone} covered={covered} />
                  </SectionBoundary>
                  <SectionBoundary surface="hub.announcement" label="The latest announcement" code="CH-10205">
                    {data.announcements.error ? (
                      // The latest post and the next trip have no heading of their own: a failed one stands on its own
                      // rule, so its line never reads as a part of the RSVPs above it.
                      <div className="ch-hb-part">
                        <RefreshNotice code="CH-10206" title="Announcements didn’t load." body="Nothing was lost. Try again; the error has been reported." covered={covered} />
                      </div>
                    ) : featured ? (
                      <Announcement key={featured.id} a={featured} role={data.role} featured acked={isAcked(featured)} pending={ackPending(featured)} onAck={onAck} onEdit={setEditing} onDelete={(a) => askDelete({ kind: 'ann', a })} />
                    ) : null}
                  </SectionBoundary>
                  <SectionBoundary surface="hub.trip" label="The next trip" code="CH-10205">
                    {data.trips.error ? (
                      <div className="ch-hb-part">
                        <RefreshNotice code="CH-10207" title="Travel didn’t load." body="Trips are safe. Try again; the error has been reported." covered={covered} />
                      </div>
                    ) : nextTrip ? (
                      <TripPass t={nextTrip} role={data.role} {...tripActions} />
                    ) : null}
                  </SectionBoundary>
                </div>
                <div className="ch-hb-col">
                  <SectionBoundary surface="hub.updates" label="Updates" code="CH-10205">
                    <Updates data={data.updates} covered={covered} />
                  </SectionBoundary>
                  {!coach && (
                    <SectionBoundary surface="hub.tasks" label="Your tasks" code="CH-10205">
                      <Tasks role={data.role} data={tasks} isDone={taskDone} isPending={taskPending} onToggle={onToggle} covered={covered} />
                    </SectionBoundary>
                  )}
                </div>
              </div>
            ))}

          {shownTab === 'ann' && (
            <SectionBoundary surface="hub.announcements" label="Announcements" code="CH-10205">
              <div className={'ch-hb-list' + (anns.length ? ' is-edited' : '') + (coach && !phone && anns.length ? ' has-margin' : '')}>
                {coach && <NewAnnouncementLine name={viewerName} onOpen={() => setCompose(true)} />}
                {data.announcements.error ? (
                  <RefreshNotice code="CH-10206" title="Announcements didn’t load." body="Nothing was lost. Try again; the error has been reported." covered={covered} />
                ) : !anns.length ? (
                  <EmptyState compact code="CH-10307" icon={Megaphone} title="No announcements yet" body={coach ? 'Post one and see who has read it.' : 'Posts from your coaches show here.'} />
                ) : (
                  anns.map((a, i) => <Announcement key={a.id} a={a} role={data.role} rank={i === 0 ? 'lead' : 'older'} acked={isAcked(a)} pending={ackPending(a)} onAck={onAck} onEdit={setEditing} onDelete={(x) => askDelete({ kind: 'ann', a: x })} />)
                )}
                {coach && !phone && anns.length > 0 && !data.announcements.error && <ReadMargin anns={anns} />}
              </div>
            </SectionBoundary>
          )}

          {shownTab === 'travel' && (
            <SectionBoundary surface="hub.travel" label="Travel" code="CH-10205">
              <div className="ch-hb-travel">
                {data.trips.error ? (
                  <RefreshNotice code="CH-10207" title="Travel didn’t load." body="Trips are safe. Try again; the error has been reported." covered={covered} />
                ) : !tripRows.length ? (
                  <EmptyState compact code="CH-10308" icon={Plane} title="No trips planned" body={coach ? 'Plan a trip and players see the itinerary here.' : 'Trips your coaches plan show here with the bus time and hotel.'} />
                ) : (
                  <>
                    {nextTrip && <TripPass t={nextTrip} big role={data.role} {...tripActions} />}
                    {tripRows
                      .filter((t) => t !== nextTrip)
                      .map((t) => (
                        <TripPass key={t.id} t={t} later role={data.role} {...tripActions} />
                      ))}
                  </>
                )}
              </div>
            </SectionBoundary>
          )}

          {shownTab === 'docs' && (
            <SectionBoundary surface="hub.documents" label="Documents" code="CH-10205">
              <Documents role={data.role} data={docs} opening={opening} uploading={uploading || upload.pending} onOpen={onOpen} onUpload={onUpload} onDelete={(f) => askDelete({ kind: 'file', f })} covered={covered} />
            </SectionBoundary>
          )}

          {shownTab === 'tasks' && coach && (
            <SectionBoundary surface="hub.tasks" label="Tasks" code="CH-10205">
              <div className="ch-hb-list">
                <Tasks role={data.role} data={tasks} isDone={taskDone} isPending={taskPending} onToggle={onToggle} onDelete={(t) => askDelete({ kind: 'task', t })} covered={covered} />
              </div>
            </SectionBoundary>
          )}
        </div>
      </Swap>

      {coach && (
        <>
          <ComposeSheet open={compose} onClose={() => setCompose(false)} players={data.players} playersError={data.playersError} documents={docs} travel={travelAudience} write={writes.postAnnouncement} onDone={refresh} />
          <ComposeSheet
            open={!!editing}
            onClose={() => setEditing(null)}
            players={data.players}
            playersError={data.playersError}
            documents={docs}
            write={writes.postAnnouncement}
            onDone={refresh}
            edit={{ announcement: editing, write: writes.editAnnouncement, onSaved: (id, change) => setEdited((m) => new Map(m).set(id, change)) }}
          />
          <TripSheet open={tripOpen} onClose={() => setTripOpen(false)} teamId={data.teamId} events={data.tripEvents} players={data.players} playersError={data.playersError} write={writes.planTrip} writeTravelers={writes.setTravelers} readClasses={writes.travelerClasses} onDone={refresh} />
          <TripEditSheet trip={editingTrip} onClose={() => setEditingTrip(null)} write={writes.editTrip} onDone={refresh} />
          <AssignSheet open={assign} onClose={() => setAssign(false)} teamId={data.teamId} players={data.players} playersError={data.playersError} write={writes.assignTask} onDone={refresh} />
          <ConfirmDelete
            open={!!confirm}
            what={confirm?.kind === 'ann' ? 'this announcement' : confirm?.kind === 'task' ? 'this task' : confirm?.kind === 'trip' ? 'this trip' : 'this file'}
            body={
              confirm?.kind === 'ann'
                ? 'Players stop seeing it, and its acknowledgements go with it.'
                : confirm?.kind === 'task'
                  ? 'It leaves every player’s list, done or not.'
                  : confirm?.kind === 'trip'
                    ? 'Players stop seeing the itinerary. Its expenses and budgets are deleted with it, and the calendar event stays. This can’t be undone.'
                    : 'Players can no longer open it. This can’t be undone.'
            }
            code={confirm?.kind === 'ann' ? 'CH-10501' : confirm?.kind === 'task' ? 'CH-10502' : confirm?.kind === 'trip' ? 'CH-10504' : 'CH-10503'}
            pending={remove.pending}
            onCancel={() => setConfirm(null)}
            onConfirm={onConfirmDelete}
          />
        </>
      )}
    </main>
  );
}
