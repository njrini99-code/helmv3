'use client';

import { MessagesSquare, PanelLeftClose, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { filterConversations, groupConversations, type ChAskConversation } from '../../../data/coachhelm-chat-shape';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChSessionState } from '../../../lib/session-state';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { SearchField } from '../../../ui/SearchField';
import { COACHHELM_HREF } from './SubTabs';

export interface AskHistoryProps {
  conversations: { list: ChAskConversation[]; error: boolean };
  /** The open conversation, marked `aria-current`. */
  openId: string | null;
  nowIso: string;
  timezone: string;
  /** New chat: a fresh thread, no server trip. */
  onNew: () => void;
  /** A conversation was chosen (closes the phone drawer). */
  onNavigate?: () => void;
  /**
   * Open a conversation in place: the page's own switch (`useViewSwitch`), so the row takes the selected look on the tap and the chat
   * dims until the next one lands. A plain tap goes through it; a modified one (a new tab) is still the link.
   */
  onOpen?: (id: string) => void;
}

/** The address of a saved conversation. */
export function conversationHref(id: string): string {
  return `${COACHHELM_HREF.ask}&c=${id}`;
}

/**
 * The chats: a search, then Today, This week and Earlier, each row a real link (so it opens in a new tab and the
 * open one is `aria-current`). A failed read is its own notice with Try again, never "No chats yet".
 */
function HistoryList({ conversations, openId, nowIso, timezone, onNew, onNavigate, onOpen }: AskHistoryProps) {
  // The search comes back when the coach returns to the page (owner rule 8), as Roster's does.
  const [q, setQ] = useChSessionState('askHistorySearch', '');
  const groups = useMemo(() => groupConversations(filterConversations(conversations.list, q), nowIso, timezone), [conversations.list, q, nowIso, timezone]);

  if (conversations.error) {
    return <RefreshNotice code="CH-13222" title="Your chats didn’t load" body="Nothing is lost. Your past chats are still saved; try again in a moment." />;
  }
  if (conversations.list.length === 0) {
    return (
      <div className="ch-ask-hist__empty" data-ch-code="CH-13323">
        <span className="ch-ask-hist__emptyic" aria-hidden="true">
          <Icon icon={MessagesSquare} size={22} />
        </span>
        <b>No chats yet</b>
        <span>Ask your first question and it will be kept here.</span>
        <button type="button" className="ch-ask-hist__emptynew" onClick={onNew}>
          New chat
        </button>
      </div>
    );
  }
  return (
    <>
      <SearchField label="Search chats" placeholder="Search chats" value={q} onChange={setQ} className="ch-ask-hist__search" />
      <div className="ch-ask-hist__scroll">
        {groups.length === 0 ? (
          <p className="ch-ask-hist__nomatch" data-ch-code="CH-13324">
            No chats match “{q.trim()}”.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h3 className="ch-ask-hist__group">{g.label}</h3>
              <ul>
                {g.items.map((c) => {
                  const on = c.id === openId;
                  return (
                    <li key={c.id}>
                      <Link
                        href={conversationHref(c.id)}
                        className={'ch-ask-hist__row' + (on ? ' is-on' : '')}
                        aria-current={on ? 'page' : undefined}
                        data-ch-code={on ? 'CH-13823' : undefined}
                        onClick={(e) => {
                          onNavigate?.();
                          if (!onOpen || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.preventDefault();
                          onOpen(c.id);
                        }}
                      >
                        {c.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}

/**
 * The standing History panel (desktop, 280px): the team's name, Hide chats, New chat, then the list. It stays mounted
 * while collapsed, so the width can animate over base (CH-13620); a collapsed panel is inert.
 */
export function HistoryPanel(props: AskHistoryProps & { open: boolean; onHide: () => void; heading: string }) {
  const { open, onHide, heading, onNew } = props;
  return (
    <aside className={'ch-ask-hist' + (open ? '' : ' is-closed')} aria-label="Chats" inert={!open || undefined} data-ch-code="CH-13820">
      <div className="ch-ask-hist__head">
        <b>{heading}</b>
        <button type="button" className="ch-ask-hist__iconbtn" aria-label="Hide chats" onClick={onHide}>
          <Icon icon={PanelLeftClose} size={19} />
        </button>
      </div>
      <button type="button" className="ch-ask-hist__new" onClick={onNew}>
        <Icon icon={SquarePen} size={17} />
        New chat
      </button>
      <HistoryList {...props} />
    </aside>
  );
}

/** A drag to the left past this many pixels, or a quick flick, closes the drawer. */
const DRAWER_CLOSE_PX = 80;
const FLICK_PX_PER_MS = 0.5;

/**
 * The phone's History: a left drawer on the native dialog (focus trap, Esc, and the backdrop for free). It closes on the
 * scrim, on Esc, on a drag or flick to the left (back to rest when let go sooner), and on choosing a chat (CH-13621, CH-13822).
 * Reduced motion draws it without the slide and without the drag.
 */
export function HistoryDrawer(props: AskHistoryProps & { open: boolean; onClose: () => void }) {
  const { open, onClose, onNew } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const aside = useRef<HTMLElement>(null);
  const reduced = useChReducedMotion();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  const drag = (e: ReactPointerEvent<HTMLElement>) => {
    const el = aside.current;
    if (reduced || !el || e.button !== 0 || (e.target as Element).closest('input, button, a')) return;
    const x0 = e.clientX;
    let dx = 0;
    let lastX = x0;
    let lastT = e.timeStamp;
    let speed = 0;
    el.style.transition = 'none';
    const move = (ev: PointerEvent) => {
      const dt = ev.timeStamp - lastT;
      if (dt > 0) speed = (ev.clientX - lastX) / dt;
      lastX = ev.clientX;
      lastT = ev.timeStamp;
      dx = Math.min(0, ev.clientX - x0);
      el.style.translate = `${dx}px 0`;
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (ev.type === 'pointerup' && (-dx > DRAWER_CLOSE_PX || (dx < -10 && -speed > FLICK_PX_PER_MS))) {
        onClose();
        return;
      }
      el.style.transition = 'translate var(--ch-dur-base) var(--ch-ease)';
      el.style.translate = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    // The click is the scrim's dismiss; the keyboard path is Esc, which <dialog> reports through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="ch-ask-drawer"
      aria-label="Chats"
      data-ch-code="CH-13822"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <aside ref={aside} className="ch-ask-hist is-drawer" aria-label="Chats" onPointerDown={drag}>
          <div className="ch-ask-hist__head">
            <b>Chats</b>
            <button
              type="button"
              className="ch-ask-hist__iconbtn is-accent"
              aria-label="New chat"
              onClick={() => {
                onNew();
                onClose();
              }}
            >
              <Icon icon={SquarePen} size={20} />
            </button>
          </div>
          <HistoryList
            {...props}
            onNew={() => {
              onNew();
              onClose();
            }}
            onNavigate={onClose}
          />
        </aside>
      )}
    </dialog>
  );
}
