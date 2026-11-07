'use client';

import { FileText, Image as ImageIcon, ListChecks, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { CH_PHONE_QUERY } from '../../lib/phone-query';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import type { ChConv } from './model';
import type { ChMessagesApi } from './MessagesView';
import { PollSheet, usePollSeed } from './polls';
import { MS_BEATS, msAnimate, sheetCloseCurve } from './motion/messages-motion';
import '../../styles/messages-overlays.css';

/** MOT-ATT-2: the menu grows from the + (0.4 to 1, origin 18px 100%) on `lift`; it leaves 1 to 0.7 over 160 ms. */
export const ATTACH_IN = [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }] as const;
export const ATTACH_OUT = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.7)' }] as const;

/**
 * The composer's + (MSG-312, MSG-313): it turns to x and lifts a glass menu of exactly Photos, File and Poll (Nick, 31 Oct: no Camera,
 * no Announcement; Poll is a group's). Both motions are Web Animations so they can start from where the menu is now (MOT-ATT-2, MC-06):
 * reopening while it closes unfolds again from that frame, never a second menu. It closes on an outside press, Escape (focus back on
 * the +), the + itself, Tab, or a pick.
 */
export function ComposerPlusV2({ api, conv, disabled, onPick }: { api: ChMessagesApi; conv: ChConv; disabled?: boolean; onPick: (picked: File[]) => void }) {
  const reduced = useChReducedMotion();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [polling, setPolling] = useState(false);
  const seedKey = usePollSeed(conv.id, () => setPolling(true));
  const photos = useRef<HTMLInputElement | null>(null);
  const files = useRef<HTMLInputElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const key = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const leaving = useRef<Animation | null>(null);
  const closingRef = useRef(false);

  const finish = () => {
    leaving.current = null;
    closingRef.current = false;
    setOpen(false);
    setClosing(false);
  };
  const close = () => {
    if (!open || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const el = menu.current;
    const a = el && msAnimate(el, [...ATTACH_OUT], null, { live: true, fill: 'forwards', reduced, timing: { ms: MS_BEATS.fillInk, easing: sheetCloseCurve.easing } });
    if (!a) {
      finish();
      return;
    }
    leaving.current = a;
    a.onfinish = () => {
      if (leaving.current === a) finish();
    };
  };
  /** Opened again while it leaves: unfold from the live frame, then let the old fade go (cancelling it first would snap the menu to full). */
  const reopen = () => {
    const was = leaving.current;
    leaving.current = null;
    closingRef.current = false;
    setClosing(false);
    if (menu.current) msAnimate(menu.current, [...ATTACH_IN], 'lift', { live: true, reduced });
    if (was) {
      was.onfinish = null;
      was.cancel();
    }
  };

  // Fresh open: it grows from the + (and, from the keyboard, the first row takes focus; not on a phone whose composer has the keyboard up).
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    msAnimate(menu.current, [...ATTACH_IN], 'lift', { reduced });
    const typing = document.activeElement instanceof HTMLTextAreaElement && window.matchMedia(CH_PHONE_QUERY).matches;
    if (!typing) menu.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount of the menu
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      // The tap that closes the menu does only that: it doesn't also open or like what's under it.
      close();
      const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 400);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        key.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close reads current state through refs
  }, [open, reduced]);
  // The menu goes with the screen: no animation left running on a node that is leaving.
  useEffect(() => () => leaving.current?.cancel(), []);

  const toggle = () => {
    haptic('select');
    if (open && !closing) close();
    else if (open && closing) reopen();
    else setOpen(true);
  };
  const take = (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []);
    if (picked.length) onPick(picked);
    input.value = '';
  };
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus({ preventScroll: true });
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      rows[e.key === 'Home' ? 0 : rows.length - 1]?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close();
      key.current?.focus({ preventScroll: true });
    }
  };
  const canPoll = conv.group && !!api.polls;
  const showing = open && !closing;
  return (
    <div ref={root} className="ch-msv-plus">
      <button ref={key} type="button" className={'ch-msv-plus__key' + (showing ? ' is-open' : '')} aria-label={showing ? 'Close' : 'Add a photo, file or poll'} aria-expanded={showing} aria-haspopup="menu" disabled={disabled} onClick={toggle}>
        <Icon icon={Plus} size={20} />
      </button>
      {open && (
        <div ref={menu} className={"ch-msv-attach" + (closing ? " is-closing" : "")} role="menu" tabIndex={-1} aria-label="Add to the message" onKeyDown={onMenuKey}>
          <button type="button" role="menuitem" onClick={() => { photos.current?.click(); close(); }}>
            <span className="ch-msv-attach__ic is-photos"><Icon icon={ImageIcon} size={17} /></span>
            Photos
          </button>
          <button type="button" role="menuitem" onClick={() => { files.current?.click(); close(); }}>
            <span className="ch-msv-attach__ic is-file"><Icon icon={FileText} size={17} /></span>
            File
          </button>
          {canPoll && (
            <button type="button" role="menuitem" onClick={() => { setPolling(true); close(); }}>
              <span className="ch-msv-attach__ic is-poll"><Icon icon={ListChecks} size={17} /></span>
              Poll
            </button>
          )}
        </div>
      )}
      <input ref={photos} type="file" accept="image/*,video/*" multiple hidden disabled={disabled} onChange={(e) => take(e.target)} />
      <input ref={files} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,application/*" multiple hidden disabled={disabled} onChange={(e) => take(e.target)} />
      {canPoll && <PollSheet key={seedKey} api={api} conv={conv} open={polling} onClose={() => setPolling(false)} />}
    </div>
  );
}
