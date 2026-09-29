'use client';

import {
  ArrowUp,
  CalendarPlus,
  ChevronLeft,
  Download,
  Ellipsis,
  FileText,
  Frown,
  Heart,
  Info,
  Laugh,
  LogOut,
  Paperclip,
  PartyPopper,
  Pencil,
  RotateCw,
  SmilePlus,
  SquarePen,
  ThumbsUp,
  HandHeart,
  Trash2,
  Users,
  X,
  Check,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { EmptyState, Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { rebuiltHref } from '../../shell/nav';
import {
  clock,
  filterConvs,
  firstName,
  railTime,
  sectionOf,
  threadItems,
  type ChAttachment,
  type ChConv,
  type ChConvFilter,
  type ChMember,
  type ChMsg,
  type ChPerson,
  type ChReaction,
  type ChReactionKey,
} from './model';

export const REACTIONS: Array<{ key: ChReactionKey; icon: LucideIcon }> = [
  { key: 'Like', icon: ThumbsUp },
  { key: 'Love', icon: Heart },
  { key: 'Laugh', icon: Laugh },
  { key: 'Celebrate', icon: PartyPopper },
  { key: 'Surprised', icon: Frown },
  { key: 'Thanks', icon: HandHeart },
];
const REACTION_ICON = Object.fromEntries(REACTIONS.map((r) => [r.key, r.icon])) as Record<ChReactionKey, LucideIcon>;

export interface ChMessagesApi {
  viewer: { userId: string; role: 'coach' | 'player'; name: string };
  timeZone: string;
  now: string;
  teamName: string | null;

  convs: ChConv[];
  convsLoading: boolean;
  convsError: boolean;
  refetchConvs: () => void;

  selectedId: string | null;
  select: (id: string | null) => void;

  msgs: ChMsg[];
  msgsLoading: boolean;
  msgsError: boolean;
  refetchMsgs: () => void;
  typing: boolean;
  onTyping: (on: boolean) => void;
  send: (text: string) => Promise<boolean>;
  sendFiles: (text: string, files: File[]) => Promise<boolean>;
  retry: (id: string) => void;
  discard: (id: string) => void;
  edit: (id: string, text: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;

  reactions: Map<string, ChReaction[]>;
  react: (messageId: string, key: ChReactionKey, active: boolean) => void;
  attachments: (messageId: string) => Promise<ChAttachment[] | null>;

  members: ChMember[] | null;
  membersError: boolean;
  leave: () => Promise<boolean>;

  directory: ChPerson[];
  directoryError: boolean;
  startDirect: (userId: string) => Promise<boolean>;
  createGroup: (userIds: string[], title: string) => Promise<boolean>;
}

const personOf = (api: ChMessagesApi, userId: string) => api.directory.find((p) => p.userId === userId);

/* Rail */

function Rail({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>('all');
  const [q, setQ] = useState('');
  const unread = api.convs.filter((c) => c.unread > 0).length;
  const list = filterConvs(api.convs, filter, q);
  const sections: Array<[ReturnType<typeof sectionOf>, string]> = [
    ['today', 'Today'],
    ['week', 'This week'],
    ['earlier', 'Earlier'],
  ];
  return (
    <aside className="ch-ms-rail" aria-label="Conversations">
      <div className="ch-ms-rail__head">
        <div className="ch-ms-rail__title">
          <h1>Messages</h1>
          <button type="button" className="ch-btn ch-btn--secondary ch-iconbtn" aria-label="New message" title="New message" onClick={onNew}>
            <Icon icon={SquarePen} size={16} />
          </button>
        </div>
        <SearchField value={q} onChange={setQ} placeholder="Search people and messages" label="Search conversations" />
        <Segmented<ChConvFilter>
          size="sm"
          label="Filter conversations"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: `Unread · ${unread}` },
            { value: 'groups', label: 'Groups' },
          ]}
        />
      </div>
      <div className="ch-ms-rail__body">
        {api.convsError ? (
          <InlineNotice title="Conversations didn't load." body="Your messages are safe. Try again; the error has been reported." onRetry={api.refetchConvs} />
        ) : api.convsLoading && !api.convs.length ? (
          <div className="ch-ms-sec__card" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ch-ms-row" style={{ cursor: 'default' }}>
                <Skeleton width={36} height={36} radius={18} />
                <span style={{ display: 'grid', gap: 7 }}>
                  <Skeleton width="60%" height={13} />
                  <Skeleton width="85%" height={12} />
                </span>
              </div>
            ))}
          </div>
        ) : !api.convs.length ? (
          <EmptyState
            compact
            icon={MessageSquare}
            title="No conversations yet."
            body={api.viewer.role === 'coach' ? 'Start one with a player, or create a team group.' : 'Message a coach or a teammate to start.'}
            action={
              <Button size="sm" leftIcon={SquarePen} onClick={onNew}>
                New message
              </Button>
            }
          />
        ) : (
          <>
            {sections.map(([k, l]) => {
              const rows = list.filter((c) => sectionOf(c.lastAt, api.now, api.timeZone) === k);
              if (!rows.length) return null;
              return (
                <section key={k} className="ch-ms-sec" aria-label={l}>
                  <div className="ch-ms-sec__l">{l}</div>
                  <div className="ch-ms-sec__card">
                    {rows.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={'ch-ms-row' + (c.unread ? ' is-unread' : '') + (api.selectedId === c.id ? ' is-sel' : '')}
                        aria-current={api.selectedId === c.id ? 'true' : undefined}
                        onClick={() => {
                          haptic('select');
                          chTrail('messages open conversation');
                          api.select(c.id);
                        }}
                      >
                        {c.group ? (
                          <span className="ch-ms-grp">
                            <Icon icon={Users} size={15} />
                          </span>
                        ) : (
                          <Avatar name={c.title} size={36} />
                        )}
                        <span className="ch-ms-row__main">
                          <span className="ch-ms-row__top">
                            <b>{c.title}</b>
                            <span className="ch-num">{railTime(c.lastAt, api.now, api.timeZone)}</span>
                          </span>
                          <span className="ch-ms-row__bot">
                            <span>
                              {c.lastText ? (
                                <>
                                  {c.lastSenderId && (c.group || c.lastSenderId === api.viewer.userId) && (
                                    <em>{c.lastSenderId === api.viewer.userId ? 'You' : firstName(personOf(api, c.lastSenderId)?.name ?? 'Member')}: </em>
                                  )}
                                  {c.lastText}
                                </>
                              ) : (
                                'No messages yet'
                              )}
                            </span>
                            {c.unread > 0 && (
                              <span className="ch-ms-count ch-num" aria-label={`${c.unread} unread`}>
                                {c.unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!list.length && <div className="ch-ms-empty">{q.trim() ? `No conversation matches “${q.trim()}”.` : 'Nothing unread. You’re caught up.'}</div>}
          </>
        )}
      </div>
    </aside>
  );
}

/* Thread */

function Attachments({ api, id, mine }: { api: ChMessagesApi; id: string; mine: boolean }) {
  const [files, setFiles] = useState<ChAttachment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .attachments(id)
      .then((a) => live && (a ? setFiles(a) : setFailed(true)))
      .catch((err) => {
        chReport(err, { surface: 'messages.attachments', severity: 'low' });
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [api, id, attempt]);
  if (failed) {
    return (
      <button type="button" className="ch-ms-bub ch-ms-bub--file" onClick={() => setAttempt((a) => a + 1)}>
        <span className="ch-ms-file__ic">
          <Icon icon={RotateCw} size={15} />
        </span>
        <span>
          <b>Attachment didn&apos;t load</b>
          <span>Tap to try again</span>
        </span>
      </button>
    );
  }
  if (!files) return <Skeleton width={240} height={54} radius={14} />;
  return (
    <>
      {files.map((f) => (
        <a key={f.id} className="ch-ms-bub ch-ms-bub--file" href={f.url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!f.url}>
          <span className="ch-ms-file__ic">
            <Icon icon={FileText} size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <b>{f.name}</b>
            <span>{fileSize(f.size)}</span>
          </span>
          <Icon icon={Download} size={15} />
          {mine && <span className="ch-sr-only">Sent by you</span>}
        </a>
      ))}
    </>
  );
}

function fileSize(b: number) {
  if (!b) return '';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(3, Math.floor(Math.log(b) / Math.log(k)));
  return `${(b / k ** i).toFixed(i ? 1 : 0).replace(/\.0$/, '')} ${units[i]}`;
}

function Bubble({
  api,
  m,
  first,
  last,
  group,
  picking,
  setPicking,
  onEdit,
  onDelete,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  first: boolean;
  last: boolean;
  group: boolean;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const who = personOf(api, m.senderId);
  const reacts = api.reactions.get(m.id) ?? [];
  if (m.deleted) {
    return (
      <div className={'ch-ms-msg' + (m.mine ? ' is-mine' : '') + (first ? ' is-first' : '') + (last ? ' is-last' : '')}>
        {!m.mine && <span className="ch-ms-msg__av" />}
        <div className="ch-ms-msg__col">
          <div className="ch-ms-bub is-deleted">Message deleted</div>
        </div>
      </div>
    );
  }
  return (
    <div className={'ch-ms-msg' + (m.mine ? ' is-mine' : '') + (first ? ' is-first' : '') + (last ? ' is-last' : '') + (m.failed ? ' is-failed' : '')}>
      {!m.mine && <span className="ch-ms-msg__av">{last && <Avatar name={who?.name ?? 'Member'} size={30} />}</span>}
      <div className="ch-ms-msg__col">
        {!m.mine && first && group && <span className="ch-ms-msg__who">{firstName(who?.name ?? 'Member')}</span>}
        <div className="ch-ms-msg__line">
          <div className="ch-ms-msg__stack">
            {m.text && <div className="ch-ms-bub">{m.text}</div>}
            {m.hasAttachments && <Attachments api={api} id={m.id} mine={m.mine} />}
          </div>
          {!m.failed && (
            <div className="ch-ms-msg__tools">
              <button type="button" className="ch-ms-tool" aria-label="React" aria-expanded={picking} onClick={() => setPicking(!picking)}>
                <Icon icon={SmilePlus} size={15} />
              </button>
              {m.mine && (
                <Menu
                  label="Message actions"
                  align={m.mine ? 'end' : 'start'}
                  items={[
                    { label: 'Edit', icon: Pencil, onSelect: onEdit },
                    { label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete },
                  ]}
                  trigger={(p) => (
                    <button type="button" className="ch-ms-tool" aria-label="More message actions" {...p}>
                      <Icon icon={Ellipsis} size={15} />
                    </button>
                  )}
                />
              )}
            </div>
          )}
          {picking && (
            <div className="ch-ms-reactbar" role="menu" aria-label="Reactions">
              {REACTIONS.map((r) => {
                const on = reacts.some((x) => x.key === r.key && x.mine);
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="menuitem"
                    className={'ch-ms-reactbar__b' + (on ? ' is-on' : '')}
                    aria-label={`${on ? 'Remove' : 'React'} ${r.key.toLowerCase()}`}
                    onClick={() => {
                      haptic('select');
                      api.react(m.id, r.key, !on);
                      setPicking(false);
                    }}
                  >
                    <Icon icon={r.icon} size={16} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {reacts.length > 0 && (
          <div className="ch-ms-reacts">
            {reacts.map((r) => (
              <button
                key={r.key}
                type="button"
                className={'ch-ms-react ch-num' + (r.mine ? ' is-mine' : '')}
                aria-label={`${r.key}, ${r.count}${r.mine ? ', including you' : ''}`}
                aria-pressed={r.mine}
                onClick={() => {
                  haptic('select');
                  api.react(m.id, r.key, !r.mine);
                }}
              >
                <Icon icon={REACTION_ICON[r.key]} size={12} />
                {r.count}
              </button>
            ))}
          </div>
        )}
        {m.failed ? (
          <span className="ch-ms-msg__fail" role="alert">
            {m.failed === 'unknown' ? 'Couldn’t confirm this sent. Check before sending again.' : 'Not sent.'}
            <button type="button" onClick={() => (haptic('press'), api.retry(m.id))}>
              Retry
            </button>
            <button type="button" onClick={() => api.discard(m.id)}>
              Discard
            </button>
          </span>
        ) : (
          last && (
            <span className="ch-ms-msg__t ch-num">
              {clock(m.at, api.timeZone)}
              {m.edited ? ' · Edited' : ''}
              {m.mine && !group && m.seen ? ' · Seen' : ''}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function Composer({ api, conv }: { api: ChMessagesApi; conv: ChConv }) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const typingTimer = useRef<number | null>(null);
  const ready = (draft.trim() || files.length) && !sending;

  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
  }, [draft]);

  const send = async () => {
    if (!ready) return;
    const text = draft.trim();
    const pending = files;
    setSending(true);
    setDraft('');
    setFiles([]);
    api.onTyping(false);
    chTrail('messages send');
    const ok = pending.length ? await api.sendFiles(text, pending) : await api.send(text);
    setSending(false);
    if (ok) haptic('commit');
    else {
      haptic('error');
      // Keep what they wrote: a failed send never eats the draft.
      setDraft(text);
      setFiles(pending);
    }
    ta.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };
  const label = conv.group ? conv.title : firstName(conv.title);
  return (
    <footer className="ch-ms-comp">
      {files.length > 0 && (
        <div className="ch-ms-to">
          {files.map((f, i) => (
            <span key={`${f.name}${i}`} className="ch-ms-to__c">
              <Icon icon={FileText} size={13} />
              {f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((s) => s.filter((_, j) => j !== i))}>
                <Icon icon={X} size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="ch-ms-comp__field">
        <IconButton icon={Paperclip} label="Attach a file" size="sm" onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length) setFiles((s) => [...s, ...picked].slice(0, 10));
            e.target.value = '';
          }}
        />
        <textarea
          ref={ta}
          rows={1}
          aria-label={`Message ${label}`}
          placeholder={`Message ${label}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            api.onTyping(true);
            if (typingTimer.current) window.clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(() => api.onTyping(false), 2500);
          }}
          onKeyDown={onKey}
          enterKeyHint="send"
        />
        <button type="button" className={'ch-ms-send' + (ready ? ' is-ready' : '')} onClick={() => void send()} disabled={!ready} aria-label="Send">
          <Icon icon={ArrowUp} size={17} />
        </button>
      </div>
      <span className="ch-ms-comp__hint">Enter to send · Shift + Enter for a new line</span>
    </footer>
  );
}

function Thread({ api, conv, detailsOpen, setDetails, onBack }: { api: ChMessagesApi; conv: ChConv; detailsOpen: boolean; setDetails: (v: boolean) => void; onBack: () => void }) {
  const [picking, setPicking] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChMsg | null>(null);
  const [editText, setEditText] = useState('');
  const [deleting, setDeleting] = useState<ChMsg | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => threadItems(api.msgs, api.now, api.timeZone), [api.msgs, api.now, api.timeZone]);
  const calendarHref = rebuiltHref('/golf/dashboard/calendar', api.viewer.role);

  useLayoutEffect(() => {
    const s = scroller.current;
    if (s) s.scrollTop = s.scrollHeight;
  }, [conv.id, api.msgs.length, api.typing]);
  useEffect(() => setPicking(null), [conv.id]);
  useEffect(() => {
    if (!picking) return;
    const close = (e: Event) => !(e.target as HTMLElement | null)?.closest?.('.ch-ms-reactbar, .ch-ms-tool') && setPicking(null);
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [picking]);

  const sub = conv.group
    ? `${conv.memberCount} members${conv.memberIds.length ? ` · ${conv.memberIds.slice(0, 3).map((id) => firstName(personOf(api, id)?.name ?? 'Member')).join(', ')}${conv.memberIds.length > 3 ? ' and more' : ''}` : ''}`
    : conv.subtitle;

  return (
    <section className="ch-ms-thread" aria-label={`Conversation with ${conv.title}`}>
      <header className="ch-ms-th">
        <div className="ch-ms-th__who">
          <span className="ch-ms-back">
            <IconButton icon={ChevronLeft} label="All conversations" onClick={onBack} />
          </span>
          {conv.group ? (
            <span className="ch-ms-grp is-lg">
              <Icon icon={Users} size={17} />
            </span>
          ) : (
            <Avatar name={conv.title} size={38} />
          )}
          <div style={{ minWidth: 0 }}>
            <b>{conv.title}</b>
            <span>{sub}</span>
          </div>
        </div>
        <div className="ch-ms-th__act">
          {calendarHref && api.viewer.role === 'coach' && (
            <a className="ch-btn ch-btn--ghost ch-iconbtn" href={calendarHref} aria-label="Open the calendar" title="Open the calendar">
              <Icon icon={CalendarPlus} size={16} />
            </a>
          )}
          <button
            type="button"
            className={'ch-btn ch-iconbtn ' + (detailsOpen ? 'ch-btn--secondary' : 'ch-btn--ghost')}
            aria-label="Details"
            aria-pressed={detailsOpen}
            title="Details"
            onClick={() => {
              haptic('select');
              setDetails(!detailsOpen);
            }}
          >
            <Icon icon={conv.group ? Users : Info} size={16} />
          </button>
        </div>
      </header>
      <div
        className="ch-ms-scroll"
        ref={scroller}
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="ch-ms-msgs">
          {api.msgsError ? (
            <InlineNotice title="This conversation didn't load." body="Nothing was lost. Try again; the error has been reported." onRetry={api.refetchMsgs} />
          ) : api.msgsLoading && !api.msgs.length ? (
            <div style={{ display: 'grid', gap: 12, paddingTop: 24 }} aria-busy="true">
              <Skeleton width="46%" height={40} radius={18} />
              <div style={{ justifySelf: 'end', width: '52%' }}>
                <Skeleton width="100%" height={40} radius={18} />
              </div>
              <Skeleton width="38%" height={40} radius={18} />
            </div>
          ) : !api.msgs.length ? (
            <div className="ch-ms-empty">No messages yet. Say hello to {conv.group ? 'the group' : firstName(conv.title)}.</div>
          ) : (
            items.map((it) =>
              it.kind === 'day' ? (
                <div key={it.key} className="ch-ms-day">
                  <span>{it.label}</span>
                </div>
              ) : (
                <Bubble
                  key={it.key}
                  api={api}
                  m={it.m}
                  first={it.first}
                  last={it.last}
                  group={conv.group}
                  picking={picking === it.m.id}
                  setPicking={(v) => setPicking(v ? it.m.id : null)}
                  onEdit={() => {
                    setEditing(it.m);
                    setEditText(it.m.text);
                  }}
                  onDelete={() => setDeleting(it.m)}
                />
              ),
            )
          )}
          {api.typing && (
            <div className="ch-ms-msg is-first">
              <span className="ch-ms-msg__av" />
              <div className="ch-ms-msg__col">
                <div className="ch-ms-typing" role="status" aria-label={`${conv.group ? 'Someone' : firstName(conv.title)} is typing`}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Composer key={conv.id} api={api} conv={conv} />

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        icon={Pencil}
        title="Edit message"
        description="Everyone in the conversation sees it marked as edited."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !editText.trim()}
              onClick={async () => {
                if (!editing) return;
                setBusy(true);
                const ok = await api.edit(editing.id, editText.trim());
                setBusy(false);
                if (ok) setEditing(null);
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <textarea className="ch-textarea" rows={4} aria-label="Message" value={editText} onChange={(e) => setEditText(e.target.value)} />
      </Modal>
      <Modal
        open={deleting != null}
        onClose={() => setDeleting(null)}
        icon={Trash2}
        title="Delete this message?"
        description="It's removed for everyone in the conversation. This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              feel="warning"
              disabled={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                const ok = await api.remove(deleting.id);
                setBusy(false);
                if (ok) setDeleting(null);
              }}
            >
              {busy ? 'Deleting…' : 'Delete message'}
            </Button>
          </>
        }
      />
    </section>
  );
}

/* Details */

function Details({ api, conv, onClose }: { api: ChMessagesApi; conv: ChConv; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const other = !conv.group ? personOf(api, conv.memberIds[0] ?? '') : undefined;
  const statsHref = rebuiltHref('/golf/dashboard/stats', api.viewer.role);
  return (
    <aside className="ch-ms-det" aria-label={conv.group ? 'Group details' : 'Details'}>
      <div className="ch-ms-det__head">
        <b>{conv.group ? 'Group details' : 'Details'}</b>
        <IconButton icon={X} label="Close details" size="sm" onClick={onClose} />
      </div>
      <div className="ch-ms-det__hero">
        {conv.group ? (
          <span className="ch-ms-grp is-xl">
            <Icon icon={Users} size={22} />
          </span>
        ) : (
          <Avatar name={conv.title} size={64} ring />
        )}
        <b>{conv.title}</b>
        <span>{conv.group ? `Group · ${conv.memberCount} members` : conv.subtitle}</span>
      </div>
      {!conv.group && other?.role === 'player' && other.playerId && api.viewer.role === 'coach' && statsHref && (
        <div className="ch-ms-det__sec">
          <Button size="sm" href={`${statsHref}?player=${encodeURIComponent(other.playerId)}`}>
            View stats
          </Button>
        </div>
      )}
      {conv.group && (
        <div className="ch-ms-det__sec">
          <div className="ch-ms-det__l">
            <span>{conv.memberCount} members</span>
          </div>
          {api.membersError ? (
            <InlineNotice title="Members didn't load." body="Try again in a moment." />
          ) : !api.members ? (
            <div style={{ display: 'grid', gap: 10 }} aria-busy="true">
              <Skeleton height={30} />
              <Skeleton height={30} />
              <Skeleton height={30} />
            </div>
          ) : (
            api.members.map((mb) => (
              <div key={mb.userId} className="ch-ms-mem">
                <Avatar name={mb.name} size={30} />
                <span style={{ minWidth: 0 }}>
                  <b>
                    {mb.name}
                    {mb.userId === api.viewer.userId ? ' (you)' : ''}
                  </b>
                  <span>{mb.subtitle}</span>
                </span>
                {mb.userId === conv.creatorId ? <Badge tone="neutral">Admin</Badge> : <span />}
              </div>
            ))
          )}
        </div>
      )}
      {conv.group && conv.creatorId !== api.viewer.userId && (
        <div className="ch-ms-det__sec">
          <Button variant="danger" leftIcon={LogOut} onClick={() => setLeaving(true)}>
            Leave group
          </Button>
        </div>
      )}
      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        icon={LogOut}
        title={`Leave ${conv.title}?`}
        description="You stop getting its messages. Someone in the group can add you back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              Stay
            </Button>
            <Button
              variant="danger"
              feel="warning"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await api.leave();
                setBusy(false);
                if (ok) {
                  setLeaving(false);
                  onClose();
                }
              }}
            >
              {busy ? 'Leaving…' : 'Leave group'}
            </Button>
          </>
        }
      />
    </aside>
  );
}

/* New message */

function NewMessage({ api, open, onClose }: { api: ChMessagesApi; open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [to, setTo] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMode('direct');
    setTo([]);
    setQ('');
    setTitle('');
    setTouched(false);
  }, [open]);
  const coachGroup = mode === 'group' && api.viewer.role === 'coach';
  const people = api.directory.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && (!coachGroup || p.role === 'player'));
  const toggle = (id: string) => {
    haptic('select');
    setTo(mode === 'direct' ? [id] : to.includes(id) ? to.filter((x) => x !== id) : [...to, id]);
  };
  const needsTitle = coachGroup && !title.trim();
  const canGo = mode === 'direct' ? to.length === 1 : to.length >= 1 && !needsTitle;
  const go = async () => {
    setTouched(true);
    if (!canGo) {
      haptic('warning');
      return;
    }
    setBusy(true);
    const ok = mode === 'direct' ? await api.startDirect(to[0]!) : await api.createGroup(to, title.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      icon={SquarePen}
      title="New message"
      description={`Only players and coaches${api.teamName ? ` on ${api.teamName}` : ' on your team'} can be messaged.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void go()}>
            {busy ? 'Starting…' : mode === 'group' ? 'Create group' : 'Start conversation'}
          </Button>
        </>
      }
    >
      <div className="ch-ms-new">
        <Segmented<'direct' | 'group'>
          label="Message type"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setTo([]);
          }}
          options={[
            { value: 'direct', label: 'Direct' },
            { value: 'group', label: 'Group' },
          ]}
        />
        {coachGroup && (
          <label className="ch-field">
            <span className="ch-field__label">Group name</span>
            <input className="ch-input" placeholder="Pinehurst travel" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} aria-invalid={touched && needsTitle} />
            {touched && needsTitle && <span className="ch-field__help is-error">Name the group so players know what it&apos;s for.</span>}
          </label>
        )}
        <SearchField value={q} onChange={setQ} placeholder={coachGroup ? 'Find a player' : 'Find a player or coach'} label="Find people" />
        {mode === 'group' && to.length > 0 && (
          <div className="ch-ms-to">
            {to.map((id) => {
              const p = personOf(api, id);
              return (
                <span key={id} className="ch-ms-to__c">
                  <Avatar name={p?.name ?? 'Member'} size={20} />
                  {firstName(p?.name ?? 'Member')}
                  <button type="button" aria-label={`Remove ${p?.name ?? 'member'}`} onClick={() => toggle(id)}>
                    <Icon icon={X} size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {api.directoryError ? (
          <InlineNotice title="Your team list didn't load." body="Close this and try again; the error has been reported." />
        ) : (
          <div className="ch-ms-pick" role="listbox" aria-multiselectable={mode === 'group'} aria-label="People">
            {people.map((p) => {
              const on = to.includes(p.userId);
              return (
                <button key={p.userId} type="button" role="option" aria-selected={on} className="ch-pp__row" onClick={() => toggle(p.userId)}>
                  <Avatar name={p.name} size={28} />
                  <span className="ch-pp__name">
                    <b>{p.name}</b>
                    <span>{p.subtitle}</span>
                  </span>
                  {mode === 'group' ? <span className={'ch-pp__box' + (on ? ' is-on' : '')}>{on && <Icon icon={Check} size={12} />}</span> : on ? <Icon icon={Check} size={15} /> : <span />}
                </button>
              );
            })}
            {!people.length && <div className="ch-pp__empty">{q.trim() ? `No one matches “${q.trim()}”.` : 'No one to message yet.'}</div>}
          </div>
        )}
        {touched && !canGo && !needsTitle && <span className="ch-field__help is-error">{mode === 'direct' ? 'Choose who to message.' : 'Choose at least one person.'}</span>}
      </div>
    </Modal>
  );
}

/* Screen */

export function MessagesView({ api }: { api: ChMessagesApi }) {
  const [details, setDetails] = useState(false);
  const [compose, setCompose] = useState(false);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  useEffect(() => setDetails(false), [api.selectedId]);
  const toast = useToast();
  useEffect(() => {
    if (api.selectedId && !conv && !api.convsLoading && api.convs.length) {
      toast({ tone: 'error', title: "That conversation isn't available", body: 'You may have left it, or it belongs to another team.' });
      api.select(null);
    }
  }, [api.selectedId, api.convsLoading, api.convs.length, conv, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className={'ch-ms' + (conv ? ' has-open' : '') + (details && conv ? ' has-details' : '')}>
      <SectionBoundary surface="messages.rail" label="Your conversations">
        <Rail api={api} onNew={() => setCompose(true)} />
      </SectionBoundary>
      {conv ? (
        <SectionBoundary surface="messages.thread" label="This conversation">
          <Thread api={api} conv={conv} detailsOpen={details} setDetails={setDetails} onBack={() => api.select(null)} />
        </SectionBoundary>
      ) : (
        <section className="ch-ms-thread is-empty">
          <EmptyState
            icon={MessageSquare}
            title={api.convs.length ? 'Pick a conversation.' : 'Start your first conversation.'}
            body={api.convs.length ? 'Threads open here, with replies as they arrive.' : 'Message a player, a coach or the whole team.'}
            action={
              <Button variant="primary" leftIcon={SquarePen} onClick={() => setCompose(true)}>
                New message
              </Button>
            }
          />
        </section>
      )}
      {conv && details && (
        <SectionBoundary surface="messages.details" label="Details">
          <Details api={api} conv={conv} onClose={() => setDetails(false)} />
        </SectionBoundary>
      )}
      <NewMessage api={api} open={compose} onClose={() => setCompose(false)} />
    </main>
  );
}
