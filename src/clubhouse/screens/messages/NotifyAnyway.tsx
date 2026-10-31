'use client';

import { ArrowUp, Bell, ChevronDown, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { PEEK_HOLD_MS } from '../../ui/Peek';
import { notifyChordLabel, type ChSendNotify } from './notify-anyway';

/**
 * Long press on Send (the phone's way to Notify anyway). A press held still for the same time a Peek takes (PEEK_HOLD_MS) fires
 * once with the press tick; a finger that moves further than 10 px is scrolling, not holding. The click a long press ends in
 * must never send (Must 6): `onClickCapture` swallows exactly that one click, so holding Send to look at the menu cannot also
 * send the message the ordinary way.
 */
export function useSendHold(onFire: () => void, enabled: boolean) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  if (!enabled) return {};
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clear();
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        clear();
        fired.current = true;
        haptic('press');
        onFire();
      }, PEEK_HOLD_MS);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    // The tap a long press ends in never lands as a send.
    onClickCapture: (e: ReactMouseEvent<HTMLElement>) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    // A touch's long press raises the system menu on some browsers; the press is ours.
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => e.preventDefault(),
  };
}

const HOLD_HINT_ID = 'ch-ms-send-hint';

/**
 * Send, and Notify anyway beside it when the thread offers it (see `sendNotify`). With nothing to offer this is exactly the Send
 * button the composer always drew: same markup, no extra element. Phone: Send gains a long press, a visually hidden "More send
 * options" button for VoiceOver (a long press cannot be discovered), and a hidden description of the gesture. Desktop: a 24 px
 * chevron beside Send opens the same menu, with the shortcut.
 */
export function SendCluster({
  phone,
  ready,
  unconfirmed,
  notify,
  mac,
  onSend,
}: {
  phone: boolean;
  ready: boolean;
  unconfirmed: boolean;
  /** Present when Notify anyway exists for this thread and this send (text only, nothing to retry). */
  notify: ChSendNotify | null;
  mac: boolean;
  onSend: (notifyAnyway: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const offered = !!notify && !unconfirmed;
  const hold = useSendHold(() => ready && setOpen(true), offered && phone);

  const sendButton = (ref?: (el: HTMLButtonElement | null) => void) => (
    <Tooltip>
      <button
        ref={ref}
        type="button"
        className={'ch-ms-send' + (ready ? ' is-ready' : '')}
        onClick={() => onSend(false)}
        disabled={!ready}
        aria-label={unconfirmed ? 'Retry send' : 'Send'}
        aria-describedby={offered && phone ? HOLD_HINT_ID : undefined}
        data-ch-code={offered ? 'CH-7370' : undefined}
        {...hold}
      >
        <Icon icon={unconfirmed ? RotateCw : ArrowUp} size={17} />
      </button>
    </Tooltip>
  );

  if (!offered) return sendButton();

  const chord = notifyChordLabel(mac);
  const items = [
    {
      label: phone ? 'Notify anyway' : 'Send and notify anyway',
      icon: Bell,
      caption: notify.caption,
      ...(phone ? {} : { shortcut: chord.menu }),
      onSelect: () => onSend(true),
    },
  ];

  if (phone) {
    return (
      <>
        <Menu
          label="Send options"
          align="end"
          width={280}
          items={items}
          open={open}
          onOpenChange={setOpen}
          trigger={(p) => sendButton(p.ref)}
        />
        <span id={HOLD_HINT_ID} className="ch-sr-only">Long press for more send options</span>
        <span className="ch-sr-only ch-sr-only--focusable">
          <button type="button" data-ch-code="CH-7870" disabled={!ready} onClick={() => setOpen(true)}>More send options</button>
        </span>
      </>
    );
  }

  return (
    <span className="ch-ms-send-split">
      {sendButton()}
      <Menu
        label="Send options"
        align="end"
        width={300}
        items={items}
        trigger={(p) => (
          <button
            ref={p.ref}
            type="button"
            className="ch-ms-send__more"
            onClick={p.onClick}
            aria-expanded={p['aria-expanded']}
            aria-haspopup={p['aria-haspopup']}
            aria-controls={p['aria-controls']}
            aria-label="More send options"
            data-ch-code="CH-7870"
            disabled={!ready}
          >
            <Icon icon={ChevronDown} size={14} />
          </button>
        )}
      />
    </span>
  );
}
