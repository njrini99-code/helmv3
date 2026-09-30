'use client';

import { ClipboardList, Megaphone, Plane, Plus, User, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChHubRsvp, ChHubTask, ChRsvp, ChTeamHub } from '../../data/hub';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { normalise, useAction, type ServerResult } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { tabListKeys } from '../../lib/tabs';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { Announcement, Documents, NewAnnouncementLine, Rsvps, Tasks, TripPass, Updates } from './parts';
import { AssignSheet, ComposeSheet, ConfirmDelete, TripSheet, type ChAnnouncementEdit } from './sheets';
import { LIVE_HUB_WRITES, type ChHubWrites } from './writes';
import '../../styles/hub.css';

export type ChHubTab = 'home' | 'ann' | 'travel' | 'docs' | 'tasks';
const TABS: Record<ChTeamHub['role'], Array<[ChHubTab, string]>> = {
  player: [
    ['home', 'Home'],
    ['ann', 'Announcements'],
    ['travel', 'Travel'],
    ['docs', 'Documents'],
  ],
  coach: [
    ['home', 'Home'],
    ['ann', 'Announcements'],
    ['travel', 'Travel'],
    ['docs', 'Documents'],
    ['tasks', 'Tasks'],
  ],
};

/** `?tab=` for a deep link: a known tab for the role, else Home. */
export function parseHubTab(v: string | undefined, role: ChTeamHub['role']): ChHubTab {
  return TABS[role].find(([k]) => k === v)?.[0] ?? 'home';
}

type Pending = { kind: 'ann'; a: ChHubAnnouncement } | { kind: 'task'; t: ChHubTask } | { kind: 'file'; f: ChHubFile } | null;

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
export function TeamHub({ data, writes = LIVE_HUB_WRITES, initialTab, viewerName }: { data: ChTeamHub; writes?: ChHubWrites; initialTab?: ChHubTab; viewerName: string }) {
  const router = useRouter();
  const phone = useChPhone();
  const backFromMore = useBackFromMore();
  const coach = data.role === 'coach';
  const [tab, setTab] = useState<ChHubTab>(initialTab ?? 'home');
  const [replies, setReplies] = useState(() => new Map<string, ChRsvp>());
  const [acked, setAcked] = useState(() => new Set<string>());
  const [done, setDone] = useState(() => new Set<string>());
  // Tasks the player unticked this visit, over what the page loaded as completed.
  const [undone, setUndone] = useState(() => new Set<string>());
  const [gone, setGone] = useState(() => new Set<string>());
  const [compose, setCompose] = useState(false);
  // The post open in the edit sheet, and the edits that have landed (shown at once; the page's read follows).
  const [editing, setEditing] = useState<ChHubAnnouncement | null>(null);
  const [edited, setEdited] = useState(() => new Map<string, ChAnnouncementEdit>());
  const [tripOpen, setTripOpen] = useState(false);
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
  const reply = useAction(
    'hub.reply',
    (r: ChHubRsvp, s: Exclude<ChRsvp, 'pending'>) =>
      optimistic(
        () => setReplies((m) => new Map(m).set(r.eventId, s)),
        () =>
          setReplies((m) => {
            const next = new Map(m);
            const was = confirmedReply.current.get(r.eventId);
            if (was) next.set(r.eventId, was);
            else next.delete(r.eventId);
            return next;
          }),
        async () => {
          const res = await writes.reply(r.eventId, s);
          if (normalise(res).success) confirmedReply.current.set(r.eventId, s);
          return res;
        },
      ),
    (r, s) => ({
      done: s === 'accepted' ? `You're going to ${r.title}` : s === 'tentative' ? `Marked maybe for ${r.title}` : `Your coach knows you can't make ${r.title}`,
      failed: `Couldn't send your reply for ${r.title}`,
      code: 'CH-10001',
    }),
  );
  const ack = useAction(
    'hub.acknowledge',
    (a: ChHubAnnouncement) =>
      optimistic(
        () => setAcked(withId(a.id)),
        () => setAcked(withoutId(a.id)),
        () => writes.acknowledge(a.id),
      ),
    (a) => ({ done: '', failed: `Couldn't acknowledge "${a.title}"`, code: 'CH-10002' }),
  );
  const complete = useAction(
    'hub.completeTask',
    (t: ChHubTask) =>
      optimistic(
        () => {
          setDone(withId(t.id));
          setUndone(withoutId(t.id));
        },
        () => setDone(withoutId(t.id)),
        () => writes.completeTask(t.id),
      ),
    (t) => ({ done: `${t.title} done`, failed: `Couldn't mark ${t.title} done`, code: 'CH-10003' }),
  );
  const uncomplete = useAction(
    'hub.uncompleteTask',
    (t: ChHubTask) =>
      optimistic(
        // `undone` wins over `done` and the loaded status, so taking it back off restores exactly what was there.
        () => setUndone(withId(t.id)),
        () => setUndone(withoutId(t.id)),
        () => writes.uncompleteTask(t.id),
      ),
    (t) => ({ done: `${t.title} is open again`, failed: `Couldn't reopen ${t.title}`, code: 'CH-10011' }),
  );
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
    (f) => ({ done: '', failed: `Couldn't open ${f.title}`, hint: 'The file may have been removed. Try again, or ask your coach to share it again.', code: 'CH-10004' }),
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
      const res = await (p.kind === 'ann' ? writes.deleteAnnouncement(p.a.id) : p.kind === 'task' ? writes.deleteTask(p.t.id) : writes.deleteDocument(p.f.id));
      if (normalise(res).success) {
        setGone(withId(p.kind === 'ann' ? p.a.id : p.kind === 'task' ? p.t.id : p.f.id));
        setConfirm(null);
        refresh();
      }
      return res;
    },
    (p) => {
      const name = p.kind === 'ann' ? `"${p.a.title}"` : p.kind === 'task' ? p.t.title : p.f.title;
      return { done: `Deleted ${name}`, failed: `Couldn’t delete ${name}`, code: 'CH-10009' };
    },
  );

  const onReply = (r: ChHubRsvp, s: Exclude<ChRsvp, 'pending'>) => {
    haptic('select');
    void reply.run(r, s);
  };
  const onAck = (a: ChHubAnnouncement) => void ack.run(a);
  // A tick marks it done; a tick on a done task (an accidental one) opens it again.
  const onToggle = (t: ChHubTask) => void (taskDone(t) ? uncomplete.run(t) : complete.run(t));
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

  const anns = useMemo(
    () => data.announcements.rows.filter((a) => !gone.has(a.id)).map((a) => (edited.has(a.id) ? { ...a, ...edited.get(a.id) } : a)),
    [data.announcements.rows, gone, edited],
  );
  const tasks = useMemo(() => ({ ...data.tasks, rows: data.tasks.rows.filter((t) => !gone.has(t.id)) }), [data.tasks, gone]);
  const docs = useMemo(() => ({ ...data.documents, folders: data.documents.folders.map((f) => ({ ...f, files: f.files.filter((d) => !gone.has(d.id)) })).filter((f) => f.files.length) }), [data.documents, gone]);
  const isAcked = (a: ChHubAnnouncement) => a.acked || acked.has(a.id);
  // The Home card: the newest post still waiting on this player, else the newest (no pinned posts yet, Q-70).
  const featured = anns.find((a) => !coach && a.needAck && !isAcked(a)) ?? anns[0] ?? null;
  const upcoming = data.trips.rows.filter((t) => t.upcoming);
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
    !data.trips.rows.length &&
    !tasks.rows.length &&
    !docs.folders.length &&
    !data.updates.rows.length;

  // CH-10701: a tab, a reply or a chip ticks; the current one is silent.
  const pick = (t: ChHubTab) => {
    if (t === tab) return;
    haptic('select');
    chTrail(`hub tab ${t}`);
    setTab(t);
  };
  const tabKeys = tabListKeys(
    TABS[data.role].map(([k]) => k),
    tab,
    pick,
    (k) => `ch-hb-tab-${k}`,
  );
  const openCompose = () => {
    setTab('ann');
    setCompose(true);
  };

  return (
    <main className={'ch-hb' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hb-title">
      {phone && !coach && <PhoneTop start title="Team Hub" />}
      {phone && coach && <PhoneTop title="Team Hub" back={{ label: 'More', onBack: backFromMore }} />}
      <header className="ch-hb-h">
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
        {coach && (
          <Button variant="primary" leftIcon={Plus} onClick={openCompose}>
            New announcement
          </Button>
        )}
      </header>

      {/* CH-10801: real tabs, each controlling its panel. */}
      <div className="ch-hb-tabs" role="tablist" aria-label="Team Hub sections">
        {TABS[data.role].map(([k, l]) => (
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
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`ch-hb-panel-${tab}`} aria-labelledby={`ch-hb-tab-${tab}`} className="ch-hb-panel">
        {tab === 'home' &&
          (nothing && data.rsvps.rows.length === 0 && !data.rsvps.error ? (
            <EmptyState
              size="page"
              code={coach ? 'CH-10305' : 'CH-10306'}
              icon={coach ? Megaphone : UsersRound}
              title={coach ? 'Nothing posted yet' : 'No team updates yet'}
              body={coach ? 'Post an announcement, plan a trip or share a document. Everything you post shows up in your players’ Team Hub.' : 'Announcements, trips and documents from your coaches will show up here.'}
              action={
                coach ? (
                  <Button variant="primary" leftIcon={Megaphone} onClick={openCompose}>
                    New announcement
                  </Button>
                ) : undefined
              }
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
                  <Rsvps role={data.role} data={data.rsvps} replies={replies} onReply={onReply} />
                </SectionBoundary>
                <SectionBoundary surface="hub.announcement" label="The latest announcement" code="CH-10205">
                  {data.announcements.error ? (
                    <RefreshNotice code="CH-10206" title="Announcements didn't load." body="Nothing was lost. Try again; the error has been reported." />
                  ) : featured ? (
                    <Announcement a={featured} role={data.role} featured acked={isAcked(featured)} onAck={onAck} onEdit={setEditing} onDelete={(a) => askDelete({ kind: 'ann', a })} />
                  ) : null}
                </SectionBoundary>
                <SectionBoundary surface="hub.trip" label="The next trip" code="CH-10205">
                  {data.trips.error ? (
                    <RefreshNotice code="CH-10207" title="Travel didn't load." body="Trips are safe. Try again; the error has been reported." />
                  ) : nextTrip ? (
                    <TripPass t={nextTrip} role={data.role} />
                  ) : null}
                </SectionBoundary>
              </div>
              <div className="ch-hb-col">
                <SectionBoundary surface="hub.updates" label="Updates" code="CH-10205">
                  <Updates data={data.updates} />
                </SectionBoundary>
                {!coach && (
                  <SectionBoundary surface="hub.tasks" label="Your tasks" code="CH-10205">
                    <Tasks role={data.role} data={tasks} isDone={taskDone} onToggle={onToggle} />
                  </SectionBoundary>
                )}
              </div>
            </div>
          ))}

        {tab === 'ann' && (
          <SectionBoundary surface="hub.announcements" label="Announcements" code="CH-10205">
            <div className="ch-hb-list">
              {coach && <NewAnnouncementLine name={viewerName} onOpen={() => setCompose(true)} />}
              {data.announcements.error ? (
                <RefreshNotice code="CH-10206" title="Announcements didn't load." body="Nothing was lost. Try again; the error has been reported." />
              ) : !anns.length ? (
                <div className="ch-hb-card">
                  <EmptyState compact code="CH-10307" icon={Megaphone} title="No announcements yet." body={coach ? 'Post one and see who has read it.' : 'Posts from your coaches show here.'} />
                </div>
              ) : (
                anns.map((a) => <Announcement key={a.id} a={a} role={data.role} acked={isAcked(a)} onAck={onAck} onEdit={setEditing} onDelete={(x) => askDelete({ kind: 'ann', a: x })} />)
              )}
            </div>
          </SectionBoundary>
        )}

        {tab === 'travel' && (
          <SectionBoundary surface="hub.travel" label="Travel" code="CH-10205">
            <div className="ch-hb-travel">
              {coach && (
                <Button leftIcon={Plane} onClick={() => setTripOpen(true)} className="ch-hb-travel__plan">
                  Plan a trip
                </Button>
              )}
              {data.trips.error ? (
                <RefreshNotice code="CH-10207" title="Travel didn't load." body="Trips are safe. Try again; the error has been reported." />
              ) : !data.trips.rows.length ? (
                <div className="ch-hb-card">
                  <EmptyState compact code="CH-10308" icon={Plane} title="No trips planned." body={coach ? 'Plan a trip and players see the itinerary here.' : 'Trips your coaches plan show here with the bus time and hotel.'} />
                </div>
              ) : (
                <>
                  {nextTrip && <TripPass t={nextTrip} big role={data.role} />}
                  {data.trips.rows
                    .filter((t) => t !== nextTrip)
                    .map((t) => (
                      <TripPass key={t.id} t={t} role={data.role} />
                    ))}
                </>
              )}
            </div>
          </SectionBoundary>
        )}

        {tab === 'docs' && (
          <SectionBoundary surface="hub.documents" label="Documents" code="CH-10205">
            <Documents role={data.role} data={docs} opening={opening} uploading={uploading || upload.pending} onOpen={onOpen} onUpload={onUpload} onDelete={(f) => askDelete({ kind: 'file', f })} />
          </SectionBoundary>
        )}

        {tab === 'tasks' && coach && (
          <SectionBoundary surface="hub.tasks" label="Tasks" code="CH-10205">
            <div className="ch-hb-list">
              <Tasks role={data.role} data={tasks} isDone={taskDone} onToggle={onToggle} onAssign={() => setAssign(true)} onDelete={(t) => askDelete({ kind: 'task', t })} />
            </div>
          </SectionBoundary>
        )}
      </div>

      {coach && (
        <>
          <ComposeSheet open={compose} onClose={() => setCompose(false)} players={data.players} playersError={data.playersError} documents={docs} write={writes.postAnnouncement} onDone={refresh} />
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
          <TripSheet open={tripOpen} onClose={() => setTripOpen(false)} teamId={data.teamId} write={writes.planTrip} onDone={refresh} />
          <AssignSheet open={assign} onClose={() => setAssign(false)} teamId={data.teamId} players={data.players} playersError={data.playersError} write={writes.assignTask} onDone={refresh} />
          <ConfirmDelete
            open={!!confirm}
            what={confirm?.kind === 'ann' ? 'this announcement' : confirm?.kind === 'task' ? 'this task' : 'this file'}
            body={
              confirm?.kind === 'ann'
                ? 'Players stop seeing it, and its acknowledgements go with it.'
                : confirm?.kind === 'task'
                  ? 'It leaves every player’s list, done or not.'
                  : 'Players can no longer open it. This can’t be undone.'
            }
            code={confirm?.kind === 'ann' ? 'CH-10501' : confirm?.kind === 'task' ? 'CH-10502' : 'CH-10503'}
            pending={remove.pending}
            onCancel={() => setConfirm(null)}
            onConfirm={onConfirmDelete}
          />
        </>
      )}
    </main>
  );
}
