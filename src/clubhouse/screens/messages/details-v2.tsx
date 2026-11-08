'use client';

import { Bell, BellOff, FileText, LogOut, Paperclip, Search, UserMinus, UserPlus, UserRound, ImageOff } from 'lucide-react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { MS_BEATS, chSpringCurve, msAnimate } from './motion/messages-motion';
import '../../styles/messages-overlays.css';
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

/**
 * A scale in on `pop` (MOT-DET-3, MOT-EMP-2): the picked token (0.8, fading in with it) and the mute action (0.92). Reduce Motion:
 * the token appears and the action does not move (`rd: null`). Through the Messages motion module, so the numbers are the app's
 * own `pop` curve.
 */
export function usePopIn() {
  const reduced = useChReducedMotion();
  return useCallback(
    (el: HTMLElement | null, from: number, opts: { once?: boolean; fade?: boolean } = {}): Animation | null => {
      if (!el) return null;
      if (opts.once) {
        if (el.dataset.chPopped) return null;
        el.dataset.chPopped = '1';
      }
      const frames: Keyframe[] = opts.fade ? [{ transform: `scale(${from})`, opacity: 0 }, { transform: 'scale(1)', opacity: 1 }] : [{ transform: `scale(${from})` }, { transform: 'scale(1)' }];
      return msAnimate(el, frames, 'pop', { reduced, rd: null });
    },
    [reduced],
  );
}

/** How long a picked token shows before the conversation opens (MOT-EMP-2): the 520 ms reveal beat, 200 ms under Reduce Motion. */
export const tokenBeat = (reduced: boolean): number => (reduced ? MS_BEATS.arrow : MS_BEATS.reveal);

/** The toast a mute choice makes (one, MSG-604): "Muted for 8 hours", "Muted for a week", "Muted until I turn it on", "Unmuted". */
export function muteToast(on: boolean, hours: number | null): string {
  if (!on) return 'Unmuted';
  return hours === 8 ? 'Muted for 8 hours' : hours === 24 * 7 ? 'Muted for a week' : 'Muted until I turn it on';
}

/** The mute lengths the menu offers, in the order drawn (MSG-604, Q-31). */
export const MUTE_CHOICES: ReadonlyArray<{ label: string; hours: number | null }> = [
  { label: 'For 8 hours', hours: 8 },
  { label: 'For a week', hours: 24 * 7 },
  { label: 'Until I turn it on', hours: null },
];

const MAX_TIMER = 2_147_000_000;

/** Where the mute menu hangs from a rectangle (a tile, an inbox row): under it with 8 px between, or above where the screen ends; clear of the edge. */
export function muteAnchor(r: { left: number; top: number; bottom: number }): { left: number; top: number; above: boolean } {
  const roomBelow = window.innerHeight - r.bottom > 240;
  return { left: Math.max(8, Math.min(r.left, window.innerWidth - 236 - 8)), top: roomBelow ? r.bottom + 8 : Math.max(16, r.top - 8 - 200), above: !roomBelow };
}

/**
 * The mute action, phone and desktop (MSG-604, MSG-608): a menu of three lengths, one toast, the inbox glyph following, and an
 * 8-hour or one-week mute going back to unmuted by itself when its time comes, with the page open or when it comes back to the front.
 */
export function useMuteAction(api: ChMessagesApi) {
  const toast = useToast();
  const [choosing, setChoosingOn] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number; above?: boolean } | null>(null);
  /** Opens under the key that asked (MSG-410), or above it where the screen ends; clear of the edge. */
  const setChoosing = (on: boolean, from?: HTMLElement) => {
    if (on && from) setAnchor(muteAnchor(from.getBoundingClientRect()));
    setChoosingOn(on);
  };
  const [busy, setBusy] = useState(false);
  const muted = !!api.mute?.muted;
  const setMute = async (on: boolean, hours: number | null) => {
    setChoosing(false);
    if (!api.mute || busy) return;
    setBusy(true);
    const ok = await api.setMute(on, hours);
    setBusy(false);
    // The container toasts the same change under the key `mute`; this one replaces it, so the person sees one.
    if (ok !== false) toast({ title: muteToast(on, hours), replace: 'mute' });
  };
  // MSG-608: the mute ends on its own. One timer to the end (never longer than a timer holds), and a look again when the page returns.
  const until = api.mute?.muted ? api.mute.until : null;
  const retry = api.retryMute;
  useEffect(() => {
    if (!until) return;
    const end = Date.parse(until);
    if (!Number.isFinite(end)) return;
    const check = () => {
      if (Date.now() >= end) retry();
    };
    const t = window.setTimeout(check, Math.min(Math.max(end - Date.now(), 0) + 250, MAX_TIMER));
    const onShow = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `retry` is a new function every render; the timer is for `until` alone
  }, [until]);
  return { choosing, setChoosing, anchor, busy, muted, setMute };
}

/**
 * The mute menu (MSG-410, MOT-DET-3): grows from the key's corner (`scale .8 opacity 0` to rest on `lift`) and leaves on a 160 ms
 * fade. Reduce Motion: the fade alone.
 */
export function MuteMenu({ onPick, onClose, anchor }: { onPick: (hours: number | null) => void; onClose: () => void; anchor?: { left: number; top: number; above?: boolean } | null }) {
  const reduced = useChReducedMotion();
  const menu = useRef<HTMLDivElement | null>(null);
  const leaving = useRef(false);
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    el.style.transformOrigin = anchor?.above ? '0 100%' : '0 0';
    msAnimate(el, [{ transform: 'scale(0.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 'lift', { reduced });
  }, [reduced, anchor]);
  /** Fade out, then say so: the menu never vanishes from under a finger. */
  const leave = (then: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    const el = menu.current;
    const a = el ? msAnimate(el, [{ opacity: 1 }, { opacity: 0 }], null, { live: true, fill: 'forwards', timing: { ms: MS_BEATS.fillInk, easing: 'linear' } }) : null;
    if (!a) return then();
    // The fade's end, or a beat after it where the animation never reports one.
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      then();
    };
    a.onfinish = once;
    window.setTimeout(once, MS_BEATS.fillInk + 40);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave(onClose);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ch-mso-pop ch-msd-lift" data-ch-ms-v2="on">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Esc is the keyboard's way out */}
      <div className="ch-mso-pop__scrim" onClick={() => leave(onClose)} />
      <div ref={menu} className="ch-mso-menu ch-msd-menu" role="menu" aria-label="Mute this conversation" style={anchor ? { left: anchor.left, top: anchor.top } : undefined}>
        {MUTE_CHOICES.map((c) => (
          <button key={c.label} type="button" role="menuitem" onClick={() => leave(() => onPick(c.hours))}>
            <span className="ch-mso-menu__t">{c.label}</span>
          </button>
        ))}
      </div>
    </div>,
    // Portaled like the message menu: a row in a scrolling list must not clip or offset it.
    document.querySelector('.ch-root') ?? document.body,
  );
}

/**
 * Mute, Search, Files, then Profile, Add or Leave per kind and role (MSG-604). Muting turns the first one green (accent fill) and the
 * tile pops `0.92 > 1` when the state flips, not on the tap that opens the menu (MOT-DET-3).
 */
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
  /** A coach on a direct thread with a player, and nobody else (MSG-604, ruling 20). */
  profileHref: string | null;
  onSearch: () => void;
  onFiles: () => void;
  onAdd: () => void;
  onLeave: () => void;
}) {
  const mine = conv.creatorId === api.viewer.userId;
  const lastTile = profileHref ? 'profile' : conv.group && mine ? 'add' : conv.group && !mine && !conv.channel ? 'leave' : null;
  const n = 3 + (lastTile ? 1 : 0);
  const muteTile = useRef<HTMLButtonElement | null>(null);
  const pop = usePopIn();
  const seen = useRef(mute.muted);
  useEffect(() => {
    if (seen.current === mute.muted) return;
    seen.current = mute.muted;
    pop(muteTile.current, 0.92);
  }, [mute.muted, pop]);
  return (
    <div className="ch-msp-tiles ch-msd-tiles" style={{ ['--ch-msp-n' as string]: n }}>
      <button
        ref={muteTile}
        type="button"
        className="ch-msp-tile ch-msd-tile"
        aria-pressed={mute.muted}
        aria-haspopup={mute.muted ? undefined : 'menu'}
        aria-label={mute.muted ? 'Muted. Turn notifications back on' : 'Mute this conversation'}
        disabled={!api.mute || mute.busy}
        onClick={(e) => {
          if (mute.muted) return void mute.setMute(false, null);
          haptic('select');
          mute.setChoosing(true, e.currentTarget);
        }}
      >
        <Icon icon={mute.muted ? BellOff : Bell} size={20} />
        <span>{mute.muted ? 'Muted' : 'Mute'}</span>
      </button>
      <button type="button" className="ch-msp-tile ch-msd-tile" onClick={onSearch}>
        <Icon icon={Search} size={20} />
        <span>Search</span>
      </button>
      <button type="button" className="ch-msp-tile ch-msd-tile" onClick={onFiles}>
        <Icon icon={Paperclip} size={20} />
        <span>Files</span>
      </button>
      {profileHref && (
        <Link className="ch-msp-tile ch-msd-tile" href={profileHref}>
          <Icon icon={UserRound} size={20} />
          <span>Profile</span>
        </Link>
      )}
      {lastTile === 'add' && (
        <button type="button" className="ch-msp-tile ch-msd-tile" onClick={onAdd}>
          <Icon icon={UserPlus} size={20} />
          <span>Add</span>
        </button>
      )}
      {lastTile === 'leave' && (
        <button type="button" className="ch-msp-tile ch-msd-tile" onClick={onLeave}>
          <Icon icon={LogOut} size={20} />
          <span>Leave</span>
        </button>
      )}
    </div>
  );
}

/** The header's second line: "Junior · Demo University Golf", "Group · 6 members" or "Team channel · 11 members", then " · Muted" (MSG-603). */
export function detailsLine(conv: ChConv, teamName: string | null | undefined, muted = false): string {
  const line = conv.group ? `${conv.channel ? 'Team channel' : 'Group'} · ${conv.memberCount} members` : [conv.subtitle, teamName].filter(Boolean).join(' · ');
  return muted ? `${line} · Muted` : line;
}

/**
 * The Class status card (MSG-606): a coach's view of a player they message, never anyone else's. A green dot and the status in
 * words. Default per Q-17 and GAP: the richer coach copy stays (class, today's blocks, where it comes from); "Next: Monday ..."
 * needs the class loader to look past today and is left (see the package report).
 */
export function ClassStatusCard({ children }: { children: ReactNode }) {
  return (
    <section className="ch-msd-lcard ch-msd-class" aria-label="Class status">
      <header className="ch-msd-lcard__h">
        <b>Class status</b>
      </header>
      <div className="ch-msd-class__b">
        <span className="ch-msd-class__dot" aria-hidden="true" />
        <div className="ch-msd-class__t">{children}</div>
      </div>
    </section>
  );
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

/**
 * Members (MSG-605): first six, "Show all {n}", you as "You", a Coach chip where the role is coach. The card header holds the count
 * in accent ink. No Captain chip (Q-35: nothing says who the captain is).
 */
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
    <section className="ch-msp-panel ch-msv-members ch-msd-lcard" aria-label="Members">
      <header className="ch-msv-members__h ch-msd-lcard__h">
        <b>Members</b>
        <span className="ch-num">{conv.memberCount}</span>
      </header>
      {api.membersError ? (
        <InlineNotice code="CH-7204" title="Members didn’t load" body="Try again." onRetry={api.retryMembers} />
      ) : !list ? (
        <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7405">
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : (
        <>
          {(all ? list : list.slice(0, 6)).map((m) => {
            const you = m.userId === api.viewer.userId;
            const coach = (you ? api.viewer.role : personOf(api, m.userId)?.role) === 'coach';
            return (
              <div key={m.userId} className="ch-msv-member ch-msd-member">
                {/* The drawn row has no key of its own: the row is what messages them (today's action, kept). */}
                <button type="button" className="ch-msv-member__to" disabled={you} aria-label={you ? undefined : `Message ${m.name}`} onClick={() => onMessage(m.userId)}>
                  <Avatar name={m.name} id={personOf(api, m.userId)?.playerId ?? m.userId} size={32} />
                  <span className="ch-msv-member__b">
                    <b>{you ? 'You' : m.name}</b>
                    <span>{[m.subtitle, m.userId === conv.creatorId ? 'Admin' : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
                {coach && <span className="ch-msv-coachchip ch-msd-chip">Coach</span>}
                {onRemove && !you && (
                  <button type="button" className="ch-msp-icon is-remove" aria-label={`Remove ${m.name}`} onClick={() => onRemove(m)}>
                    <Icon icon={UserMinus} size={17} />
                  </button>
                )}
              </div>
            );
          })}
          {!all && list.length > 6 && (
            <button type="button" className="ch-msv-seeall ch-msd-seeall" onClick={() => setAll(true)}>
              Show all {list.length}
            </button>
          )}
        </>
      )}
    </section>
  );
}

const isImage = (f: ChFile) => f.mime.startsWith('image/');

/**
 * A signed address, read once per message and kept for 40 minutes (they last an hour): the six tiles of the card, "See all" and a
 * second look at the same message are one request each, not one per tile (GAP D risk 2).
 */
const SIGNED_FOR_MS = 40 * 60_000;
type Signed = Awaited<ReturnType<ChMessagesApi['attachments']>>;
const signedCache = new Map<string, { at: number; read: Promise<Signed> }>();
export function signedOnce(read: ChMessagesApi['attachments'], messageId: string, now: number = Date.now()): Promise<Signed> {
  const hit = signedCache.get(messageId);
  if (hit && now - hit.at < SIGNED_FOR_MS) return hit.read;
  const next = read(messageId).catch((err: unknown) => {
    signedCache.delete(messageId);
    throw err;
  });
  signedCache.set(messageId, { at: now, read: next });
  return next;
}
/** Test seam: forget what was signed. */
export const forgetSigned = () => signedCache.clear();

/** One image's tile, its signed address read as the thread reads it (`attachments`). */
function PhotoTile({ api, file, onOpen }: { api: ChMessagesApi; file: ChFile; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const read = api.attachments;
  useEffect(() => {
    let live = true;
    signedOnce(read, file.messageId)
      .then((list) => {
        if (!live) return;
        const found = list?.find((x) => x.id === file.id)?.url ?? null;
        setUrl(found);
        setFailed(!found);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [read, file.id, file.messageId]);
  return (
    <button type="button" className="ch-msv-ptile" aria-label={`Open ${file.name}`} onClick={onOpen}>
      {url ? <img src={url} alt="" loading="lazy" /> : failed ? <span className="ch-msv-photo-off"><Icon icon={ImageOff} size={20} /></span> : <span className="ch-msv-sk" aria-hidden="true" />}
    </button>
  );
}

/** Photos and files (MSG-607): six tiles, then file rows; "See all" sits in the card header and opens the rest in place. */
export function PhotosAndFiles({ api, conv }: { api: ChMessagesApi; conv: ChConv }) {
  const { files, failed, retry, open } = useConversationFiles(api, conv);
  const [all, setAll] = useState(false);
  const images = (files ?? []).filter(isImage);
  const rest = (files ?? []).filter((f) => !isImage(f));
  const shownImages = all ? images : images.slice(0, 6);
  const shownRest = all ? rest : rest.slice(0, 2);
  const more = !all && (images.length > 6 || rest.length > 2);
  return (
    <section className="ch-msp-panel ch-msv-files ch-msd-lcard" aria-label="Photos and files">
      <header className="ch-msv-members__h ch-msd-lcard__h">
        <b>Photos and files</b>
        {more && (
          <button type="button" className="ch-msd-link" onClick={() => setAll(true)}>
            See all
          </button>
        )}
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
            <div className="ch-msv-ptiles ch-msd-ptiles">
              {shownImages.map((f) => (
                <PhotoTile key={f.id} api={api} file={f} onOpen={() => void open(f)} />
              ))}
            </div>
          )}
          {shownRest.map((f) => (
            <button key={f.id} type="button" className="ch-msv-frow ch-msd-frow" onClick={() => void open(f)}>
              <span className="ch-msv-frow__ic">
                <Icon icon={FileText} size={16} />
              </span>
              <span className="ch-msv-member__b">
                <b>{f.name}</b>
                <span className="ch-num">{fileMeta(f, api)}</span>
              </span>
            </button>
          ))}
        </>
      )}
    </section>
  );
}

/** Where the thread reads its scroll position from, desktop. */
const THREAD_SCROLLER = '.ch-ms .ch-ms-thread .ch-ms-scroll, .ch-ms .ch-ms-scroll';
/** The thread counts as "at the latest message" within this many px of the bottom (the artifact's `pinBottom`). */
export const PIN_SLACK_PX = 60;
/** Frames the re-pin runs beyond the column's own glide, ms. */
const PIN_TAIL_MS = 40;

/**
 * The details column's life (MSG-602, MOT-DET-2; Q-27's default): the one layout motion in Messages, set from here as the
 * artifact's `wsMotion` does. The canvas grid takes the smooth spring on `grid-template-columns` (inline, so a close mid-open
 * turns round where it is), the panel's content stays pinned to its right edge so the track reveals it, and a thread that was at
 * its latest message is put back there every frame for the glide plus 40 ms. Reduce Motion: the column lands at once and the
 * panel crossfades (Details). The panel stays mounted until the glide has run, so a close reads as the track narrowing.
 */
export function useDetailsColumn(open: boolean): boolean {
  const reduced = useChReducedMotion();
  const [mounted, setMounted] = useState(open);
  const pinned = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const grid = document.querySelector<HTMLElement>('.ch-msd-ms');
    if (!grid) return;
    grid.style.transition = reduced ? 'none' : `grid-template-columns ${chSpringCurve('smooth').ms}ms ${chSpringCurve('smooth').linear}`;
    return () => {
      grid.style.transition = '';
    };
  }, [reduced]);
  useEffect(() => {
    if (open) setMounted(true);
    if (reduced) {
      if (!open) setMounted(false);
      return;
    }
    const scroller = document.querySelector<HTMLElement>(THREAD_SCROLLER);
    // A turn-around keeps the first decision: while the track moves, the thread's own height changes with its width.
    if (pinned.current === null) pinned.current = !!scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < PIN_SLACK_PX;
    let frame = 0;
    const started = performance.now();
    const run = chSpringCurve('smooth').ms + PIN_TAIL_MS;
    const pin = (now: number) => {
      if (pinned.current && scroller) scroller.scrollTop = scroller.scrollHeight;
      if (now - started < run) frame = requestAnimationFrame(pin);
      else {
        pinned.current = null;
        if (!open) setMounted(false);
      }
    };
    frame = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(frame);
  }, [open, reduced]);
  return mounted || open;
}
