'use client';

import { ClipboardList, Megaphone, Plane, Plus, User, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChHubRsvp, ChHubTask, ChRsvp, ChTeamHub } from '../../data/hub';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { Announcement, Documents, NewAnnouncementLine, Rsvps, Tasks, TripPass, Updates } from './parts';
import { AssignSheet, ComposeSheet, ConfirmDelete, TripSheet } from './sheets';
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
  const [gone, setGone] = useState(() => new Set<string>());
  const [compose, setCompose] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [assign, setAssign] = useState(false);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = () => router.refresh();

  // ── Player writes (optimistic; a failure puts the state back) ──
  const reply = useAction('hub.reply', (r: ChHubRsvp, s: Exclude<ChRsvp, 'pending'>) => writes.reply(r.eventId, s), (r, s) => ({
    done: s === 'accepted' ? `You're going to ${r.title}` : s === 'tentative' ? `Marked maybe for ${r.title}` : `Your coach knows you can't make ${r.title}`,
    failed: `Couldn't send your reply for ${r.title}`,
    code: 'CH-10001',
  }));
  const ack = useAction('hub.acknowledge', (a: ChHubAnnouncement) => writes.acknowledge(a.id), (a) => ({ done: '', failed: `Couldn't acknowledge "${a.title}"`, code: 'CH-10002' }));
  const complete = useAction('hub.completeTask', (t: ChHubTask) => writes.completeTask(t.id), (t) => ({ done: `${t.title} done`, failed: `Couldn't mark ${t.title} done`, code: 'CH-10003' }));
  const open = useAction('hub.openDocument', (f: ChHubFile) => writes.openDocument(f.id), (f) => ({ done: '', failed: `Couldn't open ${f.title}`, hint: 'The file may have been removed. Try again, or ask your coach to share it again.', code: 'CH-10004' }));

  // ── Coach writes ──
  const post = useAction('hub.postAnnouncement', writes.postAnnouncement, (i) => ({ done: `Posted "${i.title.trim()}"`, failed: 'Couldn’t post the announcement', hint: 'Your text is still here. Try again in a moment.', code: 'CH-10005' }));
  const plan = useAction('hub.planTrip', writes.planTrip, (i) => ({ done: `${i.name.trim()} is on Travel`, failed: `Couldn’t save ${i.name.trim() || 'the trip'}`, hint: 'What you entered is still here.', code: 'CH-10006' }));
  const give = useAction('hub.assignTask', writes.assignTask, (i) => ({
    done: `${i.title.trim()} assigned to ${i.playerIds.length === data.players.length ? 'the team' : i.playerIds.length === 1 ? '1 player' : `${i.playerIds.length} players`}`,
    failed: `Couldn’t assign ${i.title.trim() || 'the task'}`,
    hint: 'What you entered is still here.',
    code: 'CH-10007',
  }));
  const upload = useAction('hub.uploadDocument', (f: File) => writes.uploadDocument({ teamId: data.teamId, file: f, folder: null }), (f) => ({ done: `${f.name} shared with the team`, failed: `Couldn’t upload ${f.name}`, hint: 'Check the file is under 50 MB and try again.', code: 'CH-10008' }));
  const remove = useAction(
    'hub.delete',
    (p: NonNullable<Pending>) => (p.kind === 'ann' ? writes.deleteAnnouncement(p.a.id) : p.kind === 'task' ? writes.deleteTask(p.t.id) : writes.deleteDocument(p.f.id)),
    (p) => {
      const name = p.kind === 'ann' ? `"${p.a.title}"` : p.kind === 'task' ? p.t.title : p.f.title;
      return { done: `Deleted ${name}`, failed: `Couldn’t delete ${name}`, code: 'CH-10009' };
    },
  );

  const onReply = async (r: ChHubRsvp, s: Exclude<ChRsvp, 'pending'>) => {
    haptic('select');
    const before = replies.get(r.eventId);
    setReplies((m) => new Map(m).set(r.eventId, s));
    const res = await reply.run(r, s);
    if (!res.success)
      setReplies((m) => {
        const next = new Map(m);
        if (before) next.set(r.eventId, before);
        else next.delete(r.eventId);
        return next;
      });
  };
  const onAck = async (a: ChHubAnnouncement) => {
    setAcked((s) => new Set(s).add(a.id));
    const res = await ack.run(a);
    if (!res.success)
      setAcked((s) => {
        const next = new Set(s);
        next.delete(a.id);
        return next;
      });
  };
  const onToggle = async (t: ChHubTask) => {
    setDone((s) => new Set(s).add(t.id));
    const res = await complete.run(t);
    if (!res.success)
      setDone((s) => {
        const next = new Set(s);
        next.delete(t.id);
        return next;
      });
  };
  const onOpen = async (f: ChHubFile) => {
    // The tab opens inside the tap, so Safari doesn't block it; the signed link fills it in.
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    setOpening(f.id);
    const res = await open.run(f);
    setOpening(null);
    if (res.success && res.data) {
      if (win) win.location.href = res.data.url;
      else window.location.assign(res.data.url);
    } else win?.close();
  };
  const onUpload = async (files: File[]) => {
    setUploading(true);
    let any = false;
    for (const f of files) if ((await upload.run(f)).success) any = true;
    setUploading(false);
    if (any) refresh();
  };
  const onConfirmDelete = async () => {
    if (!confirm) return;
    const res = await remove.run(confirm);
    if (res.success) {
      const id = confirm.kind === 'ann' ? confirm.a.id : confirm.kind === 'task' ? confirm.t.id : confirm.f.id;
      setGone((s) => new Set(s).add(id));
      setConfirm(null);
      refresh();
    }
  };
  // CH-10702: the warning comes before the question.
  const askDelete = (p: NonNullable<Pending>) => {
    haptic('warning');
    setConfirm(p);
  };

  const anns = useMemo(() => data.announcements.rows.filter((a) => !gone.has(a.id)), [data.announcements.rows, gone]);
  const tasks = useMemo(() => ({ ...data.tasks, rows: data.tasks.rows.filter((t) => !gone.has(t.id)) }), [data.tasks, gone]);
  const docs = useMemo(() => ({ ...data.documents, folders: data.documents.folders.map((f) => ({ ...f, files: f.files.filter((d) => !gone.has(d.id)) })).filter((f) => f.files.length) }), [data.documents, gone]);
  const isAcked = (a: ChHubAnnouncement) => a.acked || acked.has(a.id);
  // The Home card: the newest post still waiting on this player, else the newest (no pinned posts yet, Q-70).
  const featured = anns.find((a) => !coach && a.needAck && !isAcked(a)) ?? anns[0] ?? null;
  const upcoming = data.trips.rows.filter((t) => t.upcoming);
  const nextTrip = upcoming[0] ?? null;
  const nothing =
    !data.announcements.error && !data.trips.error && !data.tasks.error && !data.documents.error && !anns.length && !data.trips.rows.length && !tasks.rows.length && !docs.folders.length;

  // CH-10701: a tab, a reply or a chip ticks; the current one is silent.
  const pick = (t: ChHubTab) => {
    if (t === tab) return;
    haptic('select');
    chTrail(`hub tab ${t}`);
    setTab(t);
  };
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
          <button key={k} type="button" role="tab" id={`ch-hb-tab-${k}`} aria-selected={tab === k} aria-controls={`ch-hb-panel-${k}`} onClick={() => pick(k)}>
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
                    <Announcement a={featured} role={data.role} featured acked={isAcked(featured)} onAck={onAck} onDelete={(a) => askDelete({ kind: 'ann', a })} />
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
                    <Tasks role={data.role} data={tasks} done={done} onToggle={onToggle} />
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
                anns.map((a) => <Announcement key={a.id} a={a} role={data.role} acked={isAcked(a)} onAck={onAck} onDelete={(x) => askDelete({ kind: 'ann', a: x })} />)
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
            <Documents role={data.role} data={docs} opening={opening} uploading={uploading} onOpen={onOpen} onUpload={onUpload} onDelete={(f) => askDelete({ kind: 'file', f })} />
          </SectionBoundary>
        )}

        {tab === 'tasks' && coach && (
          <SectionBoundary surface="hub.tasks" label="Tasks" code="CH-10205">
            <div className="ch-hb-list">
              <Tasks role={data.role} data={tasks} done={done} onToggle={onToggle} onAssign={() => setAssign(true)} onDelete={(t) => askDelete({ kind: 'task', t })} />
            </div>
          </SectionBoundary>
        )}
      </div>

      {coach && (
        <>
          <ComposeSheet
            open={compose}
            onClose={() => setCompose(false)}
            players={data.players}
            pending={post.pending}
            onPost={async (i) => {
              const ok = (await post.run(i)).success;
              if (ok) refresh();
              return ok;
            }}
          />
          <TripSheet
            open={tripOpen}
            onClose={() => setTripOpen(false)}
            teamId={data.teamId}
            pending={plan.pending}
            onSave={async (i) => {
              const ok = (await plan.run(i)).success;
              if (ok) refresh();
              return ok;
            }}
          />
          <AssignSheet
            open={assign}
            onClose={() => setAssign(false)}
            teamId={data.teamId}
            players={data.players}
            pending={give.pending}
            onSave={async (i) => {
              const ok = (await give.run(i)).success;
              if (ok) refresh();
              return ok;
            }}
          />
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
            onConfirm={() => void onConfirmDelete()}
          />
        </>
      )}
    </main>
  );
}
