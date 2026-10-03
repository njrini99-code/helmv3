'use client';

import { Bus, CalendarCheck, Check, Download, FileSpreadsheet, FileText, FileType, Folder, Image as ImageIcon, Megaphone, MoreHorizontal, Pencil, Plane, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import type { ChHubAnnouncement, ChHubFile, ChHubRsvp, ChHubTask, ChHubTrip, ChHubUpdate, ChRsvp, ChTeamHub } from '../../data/hub';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { haptic } from '../../lib/haptics';
import { useAction, type ActionCopy, type ActionResult, type ServerResult } from '../../lib/use-action';

/*
 * Team Hub's sections (design/handoff/hub.jsx). Each takes what it shows and
 * the callbacks that change it; TeamHub holds the optimistic state and the writes.
 */

// A duplicate from an older mounted row/Retry is refused by the Hub gate without an error outcome.
function quietBusy(result: ActionResult, copy: ActionCopy): ActionCopy {
  return !result.success && result.error === 'busy' ? { ...copy, quiet: true } : copy;
}

const REPLIES: Array<[Exclude<ChRsvp, 'pending'>, string]> = [
  ['accepted', 'Going'],
  ['tentative', 'Maybe'],
  ['declined', 'Can’t'],
];

/** The phone's reply line names only what is there ("4 going · 1 no reply", the board's); desktop spells out every count. */
function repliesLine(c: { going: number; maybe: number; no: number; none: number }, compact: boolean): string {
  if (!compact) return `${c.going} going · ${c.maybe} maybe · ${c.no} can’t · ${c.none} no reply`;
  const terms = [
    [c.going, 'going'],
    [c.maybe, 'maybe'],
    [c.no, 'can’t'],
    [c.none, 'no reply'],
  ] as const;
  const said = terms.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
  return said.length ? said.join(' · ') : 'No one invited yet';
}

export function Rsvps({
  role,
  data,
  replies,
  isPending,
  onReply,
  compact = false,
}: {
  role: ChTeamHub['role'];
  data: ChTeamHub['rsvps'];
  replies: Map<string, ChRsvp>;
  isPending: (r: ChHubRsvp) => boolean;
  onReply: (r: ChHubRsvp, status: Exclude<ChRsvp, 'pending'>) => Promise<ServerResult>;
  /** The phone build: a reply line that leaves out the counts that are zero. */
  compact?: boolean;
}) {
  const coach = role === 'coach';
  const mine = (r: ChHubRsvp) => replies.get(r.eventId) ?? r.mine ?? 'pending';
  const open = data.rows.filter((r) => mine(r) === 'pending').length;
  return (
    <section className="ch-hb-card ch-hb-rsvp" aria-labelledby="ch-hb-rsvp">
      <div className="ch-hb-card__h">
        <h2 id="ch-hb-rsvp">{coach ? 'RSVPs' : 'Your RSVPs'}</h2>
        {!data.error && data.rows.length > 0 && <span className="ch-hb-muted">{coach ? 'This week' : open === 0 ? 'All answered' : `${open} need${open === 1 ? 's' : ''} a reply`}</span>}
      </div>
      {data.error ? (
        <RefreshNotice code="CH-10201" title={coach ? "This week's replies didn't load." : "Your events didn't load."} body="Nothing was lost. Try again; the error has been reported." />
      ) : !data.rows.length ? (
        <EmptyState
          compact
          code="CH-10301"
          icon={CalendarCheck}
          title={coach ? 'No events need RSVPs' : 'You’re all caught up'}
          body={coach ? 'Events you create with RSVP on show their replies here.' : 'New team events that need a reply show here.'}
          action={
            coach ? (
              <Button size="sm" href="/golf/dashboard/calendar?new=1">
                Create event
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="ch-hb-rsvp__list">
          {data.rows.map((r) => (
            <li key={r.eventId}>
              <span className="ch-hb-rsvp__d" aria-hidden="true">
                <em>{r.weekday}</em>
                <b className="ch-num">{r.day}</b>
              </span>
              <Link className="ch-hb-rsvp__b" href={`/golf/dashboard/calendar?date=${r.date}&event=${r.eventId}`}>
                <b>
                  {r.title}
                  {r.mandatory && <span className="ch-hb-req">Required</span>}
                </b>
                <span className="ch-num">
                  {r.weekday} {r.day} · {r.meta}
                </span>
              </Link>
              {coach ? (
                r.counts ? (
                  <span className="ch-hb-rsvp__c">
                    {/* No bar over nothing: with no one invited it was an empty grey track (F-53). */}
                    {r.counts.going + r.counts.maybe + r.counts.no + r.counts.none > 0 && <span className="ch-hb-rsvp__bar" aria-hidden="true">
                      {(['going', 'maybe', 'no', 'none'] as const).map((k) => (r.counts![k] ? <i key={k} className={`is-${k}`} style={{ flex: r.counts![k] }} /> : null))}
                    </span>}
                    <em className="ch-num">{repliesLine(r.counts, compact)}</em>
                  </span>
                ) : (
                  <span className="ch-hb-muted">Replies didn’t load</span>
                )
              ) : (
                <ReplyChoices r={r} mine={mine(r)} pending={isPending(r)} onReply={onReply} />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The optimistic selection remains visible but is explicitly pending until this event's write answers. */
function ReplyChoices({ r, mine, pending, onReply }: {
  r: ChHubRsvp;
  mine: ChRsvp;
  pending: boolean;
  onReply: (r: ChHubRsvp, status: Exclude<ChRsvp, 'pending'>) => Promise<ServerResult>;
}) {
  const save = useAction('hub.reply', onReply, (event, answer) => ({
    done: answer === 'accepted' ? `You're going to ${event.title}` : answer === 'tentative' ? `Marked maybe for ${event.title}` : `Your coach knows you can't make ${event.title}`,
    failed: `Couldn't send your reply for ${event.title}`,
    code: 'CH-10001',
  }), quietBusy);
  return (
    <div className="ch-hb-rsvp__choice">
      <span className="ch-hb-rsvp__a" role="radiogroup" aria-label={`Your reply for ${r.title}`} aria-busy={pending}>
        {REPLIES.map(([answer, label]) => (
          <button key={answer} type="button" role="radio" aria-checked={mine === answer} disabled={pending} onClick={() => {
            if (mine === answer) return;
            haptic('select');
            void save.run(r, answer);
          }}>{label}</button>
        ))}
      </span>
      {pending && <span className="ch-hb-saving" role="status" data-ch-code="CH-10408">Sending reply for {r.title}…</span>}
    </div>
  );
}

function Acknowledgement({ a, acked, pending, onAck }: {
  a: ChHubAnnouncement;
  acked: boolean;
  pending: boolean;
  onAck: (a: ChHubAnnouncement) => Promise<ServerResult>;
}) {
  const save = useAction('hub.acknowledge', onAck, (post) => ({ done: '', failed: `Couldn't acknowledge "${post.title}"`, code: 'CH-10002' }), quietBusy);
  if (pending) return <span className="ch-hb-saving" role="status" data-ch-code="CH-10409">Acknowledging {a.title}…</span>;
  if (acked) return <span className="ch-hb-acked"><Icon icon={Check} size={13} />Acknowledged</span>;
  return <Button size="sm" variant="primary" onClick={() => void save.run(a)}>Got it</Button>;
}

export function Announcement({
  a,
  role,
  featured = false,
  acked,
  pending,
  onAck,
  onEdit,
  onDelete,
}: {
  a: ChHubAnnouncement;
  role: ChTeamHub['role'];
  featured?: boolean;
  acked: boolean;
  pending: boolean;
  onAck: (a: ChHubAnnouncement) => Promise<ServerResult>;
  onEdit: (a: ChHubAnnouncement) => void;
  onDelete: (a: ChHubAnnouncement) => void;
}) {
  const coach = role === 'coach';
  const pct = a.recipients ? Math.round((a.ackCount / a.recipients) * 100) : 0;
  return (
    <article className={'ch-hb-ann' + (featured ? ' is-featured' : '')} aria-labelledby={`ch-hb-ann-${a.id}`}>
      {featured && <span className="ch-hb-eyebrow">{coach ? 'Latest' : a.needAck && !acked ? 'Needs your reply' : 'Latest from your coaches'}</span>}
      <h3 id={`ch-hb-ann-${a.id}`}>{a.title}</h3>
      {a.body && <p>{a.body}</p>}
      <div className="ch-hb-ann__h">
        <Avatar name={a.by} size={32} />
        <div>
          <b>{a.by}</b>
          <span className="ch-num">{[a.byRole, a.when].filter(Boolean).join(' · ')}</span>
        </div>
        {coach && (
          <Menu
            label={`More for ${a.title}`}
            align="end"
            items={[
              { label: 'Edit announcement', icon: Pencil, onSelect: () => onEdit(a) },
              { label: 'Delete announcement', icon: Trash2, danger: true, onSelect: () => onDelete(a) },
            ]}
            trigger={(p) => (
              <button type="button" className="ch-hb-iconbtn" aria-label={`More for ${a.title}`} {...p}>
                <Icon icon={MoreHorizontal} size={16} />
              </button>
            )}
          />
        )}
      </div>
      <div className="ch-hb-ann__f">
        {coach ? (
          <span className="ch-hb-reads ch-num">
            <span className="ch-hb-reads__t" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </span>
            {a.ackCount} of {a.recipients} {a.needAck ? 'acknowledged' : 'read'}
          </span>
        ) : a.needAck ? (
          <Acknowledgement a={a} acked={acked} pending={pending} onAck={onAck} />
        ) : null}
        {a.documentCount > 0 && <span className="ch-hb-muted ch-num">{a.documentCount === 1 ? '1 attachment' : `${a.documentCount} attachments`}</span>}
      </div>
    </article>
  );
}

const TRANSPORT: Record<string, string> = { bus: 'Bus', van: 'Van', flight: 'Flight', carpool: 'Carpool' };

/** The trip as a boarding pass (typographic: the owner rejected imagery, so no course photo). */
export function TripPass({
  t,
  big = false,
  later = false,
  role,
  onEdit,
  onDelete,
}: {
  t: ChHubTrip;
  big?: boolean;
  /** A trip after the next one: it is a trip, not "Next trip". */
  later?: boolean;
  role: ChTeamHub['role'];
  /** A coach's Edit and Delete; a player's pass has neither. */
  onEdit?: (t: ChHubTrip) => void;
  onDelete?: (t: ChHubTrip) => void;
}) {
  const manage = role === 'coach' && (onEdit || onDelete);
  const plan = [
    t.depart && ([t.depart, `${TRANSPORT[t.transport ?? ''] ?? 'Leave'}${t.from ? ` from ${t.from}` : ''}`] as const),
    t.hotel && (['Stay', t.hotel] as const),
    t.back && ([t.back, 'Home'] as const),
  ].filter((x): x is readonly [string, string] => !!x);
  return (
    <article className={'ch-hb-pass' + (big ? ' is-big' : '')} aria-labelledby={`ch-hb-trip-${t.id}`}>
      <div className="ch-hb-pass__main">
        <div className="ch-hb-pass__top">
          <span className="ch-hb-eyebrow ch-num">
            <Icon icon={t.transport === 'flight' ? Plane : Bus} size={13} />
            {t.upcoming && !later ? 'Next trip' : 'Trip'} · {t.dates}
          </span>
          {manage && (
            <Menu
              label={`More for ${t.name}`}
              align="end"
              items={[
                ...(onEdit ? [{ label: 'Edit trip', icon: Pencil, onSelect: () => onEdit(t) }] : []),
                ...(onDelete ? [{ label: 'Delete trip', icon: Trash2, danger: true, onSelect: () => onDelete(t) }] : []),
              ]}
              trigger={(p) => (
                <button type="button" className="ch-hb-iconbtn" aria-label={`More for ${t.name}`} {...p}>
                  <Icon icon={MoreHorizontal} size={16} />
                </button>
              )}
            />
          )}
        </div>
        <b id={`ch-hb-trip-${t.id}`}>{t.name}</b>
        {t.destination && <span className="ch-hb-muted">{t.destination}</span>}
        <dl className="ch-hb-pass__f">
          <div>
            <dt>Departs</dt>
            <dd className="ch-num">{t.depart ?? 'To be set'}</dd>
          </div>
          <div>
            <dt>Stay</dt>
            <dd>{t.hotel ?? 'Same day'}</dd>
          </div>
          <div>
            <dt>{role === 'coach' ? 'Travelers' : 'You'}</dt>
            <dd className="ch-num">{role === 'coach' ? (t.travelerCount ?? '—') : t.mine == null ? '—' : t.mine ? 'Traveling' : 'Not traveling'}</dd>
          </div>
        </dl>
      </div>
      {big && (
        <div className="ch-hb-pass__stub">
          {plan.length > 0 && (
            <ol className="ch-hb-plan">
              {plan.map(([when, what]) => (
                <li key={when + what}>
                  <span className="ch-num">{when}</span>
                  <b>{what}</b>
                </li>
              ))}
            </ol>
          )}
          {[
            ['Uniform', t.uniform],
            ['Bring', t.gear],
            ['Rooms', t.rooms],
            ['Flights', t.flight],
            ['Notes', t.notes],
          ].map(([k, v]) =>
            v ? (
              <p key={k} className="ch-hb-pass__line">
                <em>{k}</em>
                {v}
              </p>
            ) : null,
          )}
          {role === 'coach' && t.travelers && t.travelers.length > 0 && (
            <p className="ch-hb-pass__line">
              <em>Travelers</em>
              {t.travelers.join(', ')}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function Updates({ data }: { data: ChTeamHub['updates'] }) {
  const unread = data.rows.filter((n) => n.unread).length;
  return (
    <section className="ch-hb-card ch-hb-feed" aria-labelledby="ch-hb-updates">
      <div className="ch-hb-card__h">
        <h2 id="ch-hb-updates">Updates</h2>
        {unread > 0 && <span className="ch-hb-muted ch-num">{unread} new</span>}
      </div>
      {data.error ? (
        <RefreshNotice code="CH-10202" title="Updates didn't load." body="Your notifications are safe; the bell may still have them. Try again." />
      ) : !data.rows.length ? (
        <EmptyState compact code="CH-10302" title="Nothing new." body="Posts, trips, tasks and qualifier moves show here as they happen." />
      ) : (
        <ol>
          {data.rows.map((n: ChHubUpdate) => (
            <li key={n.id} className={n.unread ? 'is-new' : undefined}>
              {n.href ? (
                <Link href={n.href}>
                  <UpdateBody n={n} />
                </Link>
              ) : (
                <div className="ch-hb-feed__row">
                  <UpdateBody n={n} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function UpdateBody({ n }: { n: ChHubUpdate }) {
  return (
    <>
      <span className="ch-hb-feed__b">
        <b>
          {n.unread && <span className="ch-sr-only">New: </span>}
          {n.title}
        </b>
        {n.body && <span>{n.body}</span>}
      </span>
      <em className="ch-num">{n.when}</em>
    </>
  );
}

export function Tasks({
  role,
  data,
  isDone,
  isPending,
  onToggle,
  onAssign,
  onDelete,
}: {
  role: ChTeamHub['role'];
  data: ChTeamHub['tasks'];
  isDone: (t: ChHubTask) => boolean;
  isPending: (t: ChHubTask) => boolean;
  onToggle: (t: ChHubTask, nextDone: boolean) => Promise<ServerResult>;
  onAssign?: () => void;
  onDelete?: (t: ChHubTask) => void;
}) {
  const coach = role === 'coach';
  const open = data.rows.filter((t) => !isDone(t)).length;
  return (
    <section className="ch-hb-card" aria-labelledby="ch-hb-tasks">
      <div className="ch-hb-card__h">
        <h2 id="ch-hb-tasks">{coach ? 'Assigned tasks' : 'Your tasks'}</h2>
        {coach && onAssign ? (
          <Button size="sm" variant="ghost" onClick={onAssign}>
            Assign
          </Button>
        ) : (
          !data.error && data.rows.length > 0 && <span className="ch-hb-muted ch-num">{open} open</span>
        )}
      </div>
      {data.error ? (
        <RefreshNotice code="CH-10203" title={coach ? "Tasks didn't load." : "Your tasks didn't load."} body="Nothing was lost. Try again; the error has been reported." />
      ) : !data.rows.length ? (
        <EmptyState compact code="CH-10303" title={coach ? 'No tasks assigned.' : 'No tasks right now.'} body={coach ? 'Assign a task and see who has done it.' : 'Tasks your coaches assign show here with their due date.'} />
      ) : (
        <div className="ch-hb-tasks">
          {data.rows.map((t) => <TaskRow key={t.id} t={t} coach={coach} d={isDone(t)} pending={isPending(t)} onToggle={onToggle} onDelete={onDelete} />)}
          {data.total != null && data.total > data.rows.length && (
            // C-20: the list is capped; it says so rather than passing for every task.
            <p className="ch-hb-muted ch-num">
              Showing the {data.rows.length} latest due of {data.total} tasks.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** One gate per task, shared by completing and reopening it; other tasks remain usable. */
function TaskRow({ t, coach, d, pending, onToggle, onDelete }: {
  t: ChHubTask;
  coach: boolean;
  d: boolean;
  pending: boolean;
  onToggle: (t: ChHubTask, nextDone: boolean) => Promise<ServerResult>;
  onDelete?: (t: ChHubTask) => void;
}) {
  const save = useAction(
    d ? 'hub.uncompleteTask' : 'hub.completeTask',
    onToggle,
    (task, nextDone) => ({
      done: nextDone ? `${task.title} done` : `${task.title} is open again`,
      failed: nextDone ? `Couldn't mark ${task.title} done` : `Couldn't reopen ${task.title}`,
      code: nextDone ? 'CH-10003' : 'CH-10011',
    }),
    quietBusy,
  );
  return (
    <div className={'ch-hb-task' + (d ? ' is-done' : '')}>
      {coach ? (
        <span className="ch-hb-ring" style={{ ['--ch-hb-p' as string]: t.done && t.done[1] ? (t.done[0] / t.done[1]) * 100 : 0 }} aria-label={t.done ? `${t.done[0]} of ${t.done[1]} done` : 'Completion didn’t load'}>
          <b className="ch-num">{t.done ? `${t.done[0]}/${t.done[1]}` : '—'}</b>
        </span>
      ) : (
        <button type="button" className="ch-hb-check" aria-pressed={d} aria-label={`${t.title}${d ? ', done' : ''}`} disabled={pending} aria-busy={pending} onClick={() => void save.run(t, !d)}>
          {d && <Icon icon={Check} size={13} />}
        </button>
      )}
      <div>
        <b>{t.title}</b>
        {t.detail && <span>{t.detail}</span>}
      </div>
      <em role={pending ? 'status' : undefined} data-ch-code={pending ? 'CH-10410' : undefined} aria-label={pending ? `Saving ${t.title}` : undefined} className={'ch-num' + (!d && (t.status === 'overdue' || t.due === 'Today' || t.due === 'Tomorrow') ? ' is-soon' : '')}>{pending ? 'Saving…' : d && !coach ? 'Done' : t.status === 'overdue' && !d ? `Overdue · ${t.due}` : (t.due ?? 'No date')}</em>
      {coach && onDelete && (
        <Menu
          label={`More for ${t.title}`}
          align="end"
          items={[{ label: 'Delete task', icon: Trash2, danger: true, onSelect: () => onDelete(t) }]}
          trigger={(p) => (
            <button type="button" className="ch-hb-iconbtn" aria-label={`More for ${t.title}`} {...p}>
              <Icon icon={MoreHorizontal} size={16} />
            </button>
          )}
        />
      )}
    </div>
  );
}

const FILE_ICON: Record<string, typeof FileText> = { PDF: FileText, DOC: FileType, XLS: FileSpreadsheet, IMG: ImageIcon };

export function Documents({
  role,
  data,
  opening,
  uploading,
  onOpen,
  onUpload,
  onDelete,
}: {
  role: ChTeamHub['role'];
  data: ChTeamHub['documents'];
  opening: string | null;
  uploading: boolean;
  onOpen: (f: ChHubFile) => void;
  onUpload: (files: File[]) => void;
  onDelete: (f: ChHubFile) => void;
}) {
  const coach = role === 'coach';
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onUpload(files);
  };
  return (
    <div className="ch-hb-docs">
      {coach && (
        <>
          <button
            type="button"
            className={'ch-hb-drop' + (over ? ' is-over' : '')}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
            disabled={uploading}
            data-ch-code={uploading ? 'CH-10401' : undefined}
          >
            <span aria-hidden="true">
              <Icon icon={Upload} size={18} />
            </span>
            <b>{uploading ? 'Uploading…' : 'Drop files to share with the team'}</b>
            <em>PDF, DOC, XLS or images · players see them in Team Hub</em>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) onUpload(files);
            }}
          />
        </>
      )}
      {data.error ? (
        <RefreshNotice code="CH-10204" title="Documents didn't load." body="Your files are safe. Try again; the error has been reported." />
      ) : !data.folders.length ? (
        <div className="ch-hb-card">
          <EmptyState compact code="CH-10304" icon={Folder} title="No documents yet." body={coach ? 'Files you share show here in folders.' : 'Files your coaches share show here.'} />
        </div>
      ) : (
        data.folders.map((f) => (
          <section key={f.name} className="ch-hb-card ch-hb-folder" aria-labelledby={`ch-hb-f-${f.name}`}>
            <div className="ch-hb-card__h">
              <h2 id={`ch-hb-f-${f.name}`}>
                <Icon icon={Folder} size={16} />
                {f.name}
              </h2>
              <span className="ch-hb-muted ch-num">{f.files.length === 1 ? '1 file' : `${f.files.length} files`}</span>
            </div>
            <div className="ch-hb-files">
              {f.files.map((d) => (
                <div key={d.id} className="ch-hb-file">
                  <button type="button" className="ch-hb-file__open" onClick={() => onOpen(d)} disabled={opening === d.id} aria-label={`Open ${d.title}, ${d.type}`}>
                    <span className={`ch-hb-file__ic is-${d.type.toLowerCase()}`} aria-hidden="true">
                      <Icon icon={FILE_ICON[d.type] ?? FileText} size={18} />
                      <em>{d.type}</em>
                    </span>
                    <span className="ch-hb-file__b">
                      <b>{d.title}</b>
                      <span className="ch-num">{[d.size, d.date].filter(Boolean).join(' · ')}</span>
                    </span>
                    <Icon icon={Download} size={15} className="ch-hb-muted" />
                  </button>
                  {coach && (
                    <Menu
                      label={`More for ${d.title}`}
                      align="end"
                      items={[{ label: 'Delete file', icon: Trash2, danger: true, onSelect: () => onDelete(d) }]}
                      trigger={(p) => (
                        <button type="button" className="ch-hb-iconbtn" aria-label={`More for ${d.title}`} {...p}>
                          <Icon icon={MoreHorizontal} size={16} />
                        </button>
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** The coach's "Write an announcement…" line that opens the composer. */
export function NewAnnouncementLine({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="ch-hb-new"
      onClick={() => {
        haptic('press');
        onOpen();
      }}
    >
      <Avatar name={name} size={32} />
      <span>Write an announcement for the team…</span>
      <Icon icon={Megaphone} size={16} />
    </button>
  );
}
