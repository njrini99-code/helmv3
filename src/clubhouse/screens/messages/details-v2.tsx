'use client';

import { Bell, BellOff, FileText, LogOut, Paperclip, Search, UserMinus, UserPlus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useLayoutEffect } from 'react';
import { chSpringCurve } from '../../lib/motion';
import { haptic } from '../../lib/haptics';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { fileMeta, useConversationFiles } from './files';
import type { ChConv, ChFile, ChMember } from './model';
import type { ChMessagesApi } from './MessagesView';
import { MessageHits } from './message-hits';
import { personOf } from './person-of';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A scale in on `pop`: the picked token (0.8, M-MSG-22) and the mute action (0.92, M-MSG-21). Nothing under Reduce Motion. */
export function popIn(el: HTMLElement | null, from: number, once = false): void {
  if (!el || reduced()) return;
  if (once) {
    if (el.dataset.chPopped) return;
    el.dataset.chPopped = '1';
  }
  const c = chSpringCurve('pop');
  el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: c.ms, easing: c.linear });
}

/** How long a picked token shows before the conversation opens. */
export const tokenBeat = (): number => (reduced() ? 0 : chSpringCurve('pop').ms);

/** The mute action, phone and desktop: today's three lengths and today's labels, one toast style (MSG-MUTE-01, 03). */
export function useMuteAction(api: ChMessagesApi) {
  const toast = useToast();
  const [choosing, setChoosingOn] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  /** Opens under the key that asked (MSG-MUTE-01), clear of the screen's edge. */
  const setChoosing = (on: boolean, from?: HTMLElement) => {
    if (on && from) {
      const r = from.getBoundingClientRect();
      setAnchor({ left: Math.max(16, Math.min(r.left, window.innerWidth - 236 - 16)), top: r.bottom + 8 });
    }
    setChoosingOn(on);
  };
  const [busy, setBusy] = useState(false);
  const muted = !!api.mute?.muted;
  const setMute = async (on: boolean, hours: number | null) => {
    setChoosing(false);
    if (!api.mute || busy) return;
    setBusy(true);
    await api.setMute(on, hours);
    setBusy(false);
    toast({ title: !on ? 'Unmuted' : hours === 8 ? 'Mute 8 hours' : hours === 24 * 7 ? 'Mute a week' : 'Until I turn it on' });
  };
  return { choosing, setChoosing, anchor, busy, muted, setMute };
}

/** The glass menu in the hold menu's box (MSG-MUTE-01). */
export function MuteMenu({ onPick, onClose, anchor }: { onPick: (hours: number | null) => void; onClose: () => void; anchor?: { left: number; top: number } | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = (label: string, hours: number | null) => (
    <button type="button" role="menuitem" onClick={() => onPick(hours)}>
      <span>{label}</span>
    </button>
  );
  return (
    <div className="ch-msv-lift" data-ch-ms-v2="on">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Esc is the keyboard's way out */}
      <div className="ch-msv-lift__scrim is-light" onClick={onClose} />
      <div className="ch-msv-holdmenu is-mute" role="menu" aria-label="Mute this conversation" style={anchor ?? undefined}>
        {row('Mute 8 hours', 8)}
        {row('Mute a week', 24 * 7)}
        {row('Until I turn it on', null)}
      </div>
    </div>
  );
}

/** Mute, Search, Files, then Profile, Add or Leave per kind and role (MSG-DETAILS-04, MSG-GROUPDET-02). */
export function QuickActions({
  api,
  conv,
  mute,
  profileHref,
  onSearch,
  onFiles,
  onAdd,
  onLeave,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  mute: ReturnType<typeof useMuteAction>;
  /** A coach on a direct thread with a player, and nobody else (MSG-ROLE-04). */
  profileHref: string | null;
  onSearch: () => void;
  onFiles: () => void;
  onAdd: () => void;
  onLeave: () => void;
}) {
  const mine = conv.creatorId === api.viewer.userId;
  const n = 3 + (profileHref || conv.group ? 1 : 0);
  return (
    <div className="ch-msp-tiles" style={{ ['--ch-msp-n' as string]: n }}>
      <button
        type="button"
        className="ch-msp-tile"
        aria-pressed={mute.muted}
        aria-haspopup={mute.muted ? undefined : 'menu'}
        aria-label={mute.muted ? 'Muted. Turn notifications back on' : 'Mute this conversation'}
        disabled={!api.mute || mute.busy}
        onClick={(e) => {
          popIn(e.currentTarget, 0.92);
          if (mute.muted) return void mute.setMute(false, null);
          haptic('select');
          mute.setChoosing(true, e.currentTarget);
        }}
      >
        <Icon icon={mute.muted ? BellOff : Bell} size={20} />
        <span>{mute.muted ? 'Muted' : 'Mute'}</span>
      </button>
      <button type="button" className="ch-msp-tile" onClick={onSearch}>
        <Icon icon={Search} size={20} />
        <span>Search</span>
      </button>
      <button type="button" className="ch-msp-tile" onClick={onFiles}>
        <Icon icon={Paperclip} size={20} />
        <span>Files</span>
      </button>
      {profileHref && (
        <Link className="ch-msp-tile" href={profileHref}>
          <Icon icon={UserRound} size={20} />
          <span>Profile</span>
        </Link>
      )}
      {conv.group && mine && (
        <button type="button" className="ch-msp-tile" onClick={onAdd}>
          <Icon icon={UserPlus} size={20} />
          <span>Add</span>
        </button>
      )}
      {conv.group && !mine && (
        <button type="button" className="ch-msp-tile" onClick={onLeave}>
          <Icon icon={LogOut} size={20} />
          <span>Leave</span>
        </button>
      )}
    </div>
  );
}

/** The header's second line: "Junior · Demo University Golf", "Group · 6 members" or "Team channel · 11 members". */
export function detailsLine(conv: ChConv, teamName: string | null | undefined): string {
  if (conv.group) return `${conv.channel ? 'Team channel' : 'Group'} · ${conv.memberCount} members`;
  return [conv.subtitle, teamName].filter(Boolean).join(' · ');
}

/** Today's search, scoped to this conversation (S-MSG.search; 03 Details). A hit opens the thread at its message. */
export function ConversationSearch({ api, conv, onClose, onPicked }: { api: ChMessagesApi; conv: ChConv; onClose: () => void; /** The phone pops back to the thread. */ onPicked?: () => void }) {
  const [q, setQ] = useState('');
  return (
    <div className="ch-msv-consearch">
      <div className="ch-msv-consearch__f">
        <SearchField value={q} onChange={setQ} placeholder="Search" label={`Search this conversation with ${conv.title}`} />
        <button type="button" className="ch-msv-consearch__x" onClick={onClose}>
          Cancel
        </button>
      </div>
      <MessageHits api={api} q={q} nameMatches={0} conversationId={conv.id} onPicked={() => (onPicked ?? onClose)()} />
    </div>
  );
}

/** Members: first six, today's "See all", a Coach chip where the role is coach, you as "You"; no Captain chip (MSG-GROUPDET-01). */
export function MembersCard({
  api,
  conv,
  onMessage,
  onRemove,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  onMessage: (userId: string) => void;
  onRemove?: (m: ChMember) => void;
}) {
  const [all, setAll] = useState(false);
  const list = api.members;
  return (
    <section className="ch-msp-panel ch-msv-members" aria-label="Members">
      <header className="ch-msv-members__h">
        <b>Members</b>
        <span className="ch-num">{conv.memberCount}</span>
      </header>
      {api.membersError ? (
        <InlineNotice code="CH-7204" title="Members didn’t load" body="Try again." onRetry={api.retryMembers} />
      ) : !list ? (
        <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7405">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : (
        <>
          {(all ? list : list.slice(0, 6)).map((m) => {
            const you = m.userId === api.viewer.userId;
            const coach = (you ? api.viewer.role : personOf(api, m.userId)?.role) === 'coach';
            return (
              <div key={m.userId} className="ch-msv-member">
                {/* The drawn row has no key of its own: the row is what messages them (today's action, kept). */}
                <button type="button" className="ch-msv-member__to" disabled={you} aria-label={you ? undefined : `Message ${m.name}`} onClick={() => onMessage(m.userId)}>
                  <Avatar name={m.name} id={personOf(api, m.userId)?.playerId ?? m.userId} size="md" />
                  <span className="ch-msv-member__b">
                    <b>{you ? 'You' : m.name}</b>
                    <span>{[m.subtitle, m.userId === conv.creatorId ? 'Admin' : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
                {coach && <span className="ch-msv-coachchip">Coach</span>}
                {onRemove && !you && (
                  <button type="button" className="ch-msp-icon is-remove" aria-label={`Remove ${m.name}`} onClick={() => onRemove(m)}>
                    <Icon icon={UserMinus} size={17} />
                  </button>
                )}
              </div>
            );
          })}
          {!all && list.length > 6 && (
            <button type="button" className="ch-msv-seeall" onClick={() => setAll(true)}>
              Show all {list.length}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const isImage = (f: ChFile) => f.mime.startsWith('image/');

/** One image's tile, its signed address read as the thread reads it (`attachments`). */
function PhotoTile({ api, file, onOpen }: { api: ChMessagesApi; file: ChFile; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const read = api.attachments;
  useEffect(() => {
    let live = true;
    read(file.messageId)
      .then((list) => {
        if (live) setUrl(list?.find((x) => x.id === file.id)?.url ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [read, file.id, file.messageId]);
  return (
    <button type="button" className="ch-msv-ptile" aria-label={`Open ${file.name}`} onClick={onOpen}>
      {url && <img src={url} alt="" loading="lazy" />}
    </button>
  );
}

/** Photos and files: six tiles, then file rows with a tint tile, "See all" past that (MSG-DETAILS-01). */
export function PhotosAndFiles({ api, conv }: { api: ChMessagesApi; conv: ChConv }) {
  const { files, failed, retry, open } = useConversationFiles(api, conv);
  const [all, setAll] = useState(false);
  const images = (files ?? []).filter(isImage);
  const rest = (files ?? []).filter((f) => !isImage(f));
  const shownImages = all ? images : images.slice(0, 6);
  const shownRest = all ? rest : rest.slice(0, 2);
  return (
    <section className="ch-msp-panel ch-msv-files" aria-label="Photos and files">
      <header className="ch-msv-members__h">
        <b>Photos and files</b>
        {files && files.length > 0 && <span className="ch-num">{files.length}</span>}
      </header>
      {failed ? (
        <InlineNotice code="CH-7214" title="Files didn’t load" body="Your messages are safe. Try again." onRetry={retry} />
      ) : !files ? (
        <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7409">
          <Skeleton height={36} />
        </div>
      ) : !files.length ? (
        <p className="ch-msp-none" data-ch-code="CH-7306">
          No files shared yet.
        </p>
      ) : (
        <>
          {shownImages.length > 0 && (
            <div className="ch-msv-ptiles">
              {shownImages.map((f) => (
                <PhotoTile key={f.id} api={api} file={f} onOpen={() => void open(f)} />
              ))}
            </div>
          )}
          {shownRest.map((f) => (
            <button key={f.id} type="button" className="ch-msv-frow" onClick={() => void open(f)}>
              <span className="ch-msv-frow__ic">
                <Icon icon={FileText} size={16} />
              </span>
              <span className="ch-msv-member__b">
                <b>{f.name}</b>
                <span className="ch-num">{fileMeta(f, api)}</span>
              </span>
            </button>
          ))}
          {!all && (images.length > 6 || rest.length > 2) && (
            <button type="button" className="ch-msv-seeall" onClick={() => setAll(true)}>
              See all
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The details column's life: it stays mounted through the 462ms close, so the track narrows over the panel and nothing reflows, and the
 * thread at its latest message stays on it every frame while the track moves (MSG-DETAILS-03). Under Reduce Motion it goes at once.
 */
export function useDetailsColumn(open: boolean, redesign: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  // M-MSG-20b, the one layout animation the design keeps: set inline as the design's `wsMotion` does, so a close mid-open
  // turns around where it is. Reduce Motion: the column snaps. Off the redesign, nothing is set.
  useLayoutEffect(() => {
    if (!redesign || reduced()) return;
    const grid = document.querySelector<HTMLElement>('.ch-ms');
    if (!grid) return;
    grid.style.transition = 'grid-template-columns 462ms var(--ch-ease-spring-smooth)';
    return () => {
      grid.style.transition = '';
    };
  }, [redesign]);
  useEffect(() => {
    if (!redesign) return setMounted(open);
    if (open) setMounted(true);
    const scroller = document.querySelector<HTMLElement>('.ch-ms .ch-ms-thread .ch-ms-scroll, .ch-ms .ch-ms-scroll');
    const atEnd = !!scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    if (reduced()) {
      if (!open) setMounted(false);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const pin = (now: number) => {
      if (atEnd && scroller) scroller.scrollTop = scroller.scrollHeight;
      if (now - started < 502) frame = requestAnimationFrame(pin);
      else if (!open) setMounted(false);
    };
    frame = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(frame);
  }, [open, redesign]);
  return redesign ? mounted || open : open;
}
