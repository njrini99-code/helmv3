'use client';

import { ArrowUpRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { ChatUIMessage } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { haptic } from '../../lib/haptics';
import { useChMotionMode } from '../../lib/reduced-motion';
import { useChPhone } from '../../lib/use-phone';
import { conversationHref } from '../../screens/coachhelm/chat/History';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import type { ChAskSheetChat } from '../AskSheet';
import { HelmMark, useQcCtx } from './qc-context';
import { useQcSeam } from './qc-seam';
import { DRAG_CLOSE_SHARE, DRAG_FLING, DRAG_REST_MS, DRAG_SLOP_PX } from './qc-timing';
import { QuickChatThread } from './QuickChatThread';
import { readTodayThread } from './earlier-today';
import { usePanelHistory } from './use-panel-history';
import { dragCloses, useQcMotion } from './useQcMotion';

const ASK_HOME = '/golf/dashboard/coachhelm?view=ask';
/** The keyboard's height once it has been seen this session, so the next open pours with the composer already in place (MO-1-3). */
let knownKeyboard = 0;

/**
 * "Inert others": every sibling of each kept element's ancestors, up to the body, stops taking pointer, key and
 * VoiceOver focus. The page behind stays drawn and alive; only the chat and its key can be reached.
 */
export function inertOthers(keep: readonly Element[]): () => void {
  const changed: HTMLElement[] = [];
  const kept = (el: Element) => keep.some((k) => el === k || el.contains(k));
  for (const k of keep) {
    for (let node: Element | null = k; node && node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sib of node.parentElement.children) {
        if (sib === node || kept(sib) || !(sib instanceof HTMLElement) || sib.inert || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
        sib.inert = true;
        changed.push(sib);
      }
    }
  }
  return () => {
    for (const el of changed) el.inert = false;
  };
}

/**
 * The quick chat's frame (QUICK-CHAT.md, Moment 1): the panel that pours out of the key, its scrim, its header, every
 * way of closing it, and what the page behind does meanwhile. The conversation inside is `QuickChatThread`, mounted
 * once on `warm` and never keyed by path: the stream route aborts when its request goes, so a remount per path would
 * end the run (wiring QW1).
 */
export default function QuickChatSession({ open, onClose, looking, pathname, planOn = false, chat = useCoachHelmChat, initialText = '' }: { planOn?: boolean; open: boolean; onClose: () => void; looking: { label: string; playerId: string | null; playerName: string | null }; pathname: string; chat?: ChAskSheetChat; initialText?: string }) {
  const router = useRouter();
  const phone = useChPhone();
  const mode = useChMotionMode();
  const seam = useQcSeam();
  const { keyRef, session } = useQcCtx();
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [shown, setShown] = useState(open);
  const [text, setText] = useState(initialText);
  const [islandSlot, setIslandSlot] = useState<HTMLElement | null>(null);
  /** The speed the sheet was thrown at (px per ms), for the close that follows it; 0 for every other close. */
  const thrown = useRef(0);
  const motion = useQcMotion(mode);
  /** The close is the app going somewhere (Open in Ask, a receipt's Open): focus and history belong to the destination. */
  const leaving = useRef(false);

  // `ST-9.qc.today.restored`: today's thread, read once when the key is first warmed. The live hook holds it from then on.
  const live = chat === useCoachHelmChat && !seam;
  const [restored, setRestored] = useState<{ id: string; messages: ChatUIMessage[] } | null>(null);
  const [restoring, setRestoring] = useState(live);
  const sessionAt = useRef(session);
  sessionAt.current = session;
  useEffect(() => {
    if (!live) return;
    let alive = true;
    void readTodayThread().then((thread) => {
      if (!alive) return;
      // A question asked before the read answered starts its own conversation; the earlier one stays in Ask.
      if (thread && !sessionAt.current?.messages.length && !sessionAt.current?.busy) setRestored(thread);
      setRestoring(false);
    });
    return () => {
      alive = false;
    };
  }, [live]);

  // The panel hangs 6px under the bar on both layouts; the pour's origin is the key's centre.
  const place = useCallback(() => {
    const el = panel.current;
    const key = keyRef.current?.getBoundingClientRect();
    if (!el || !key) return { x: window.innerWidth - 60, y: 60 };
    const top = (phone ? (window.visualViewport?.offsetTop ?? 0) : 0) + key.bottom;
    el.style.setProperty('--ch-qc-top', `${top + 6}px`);
    scrim.current?.style.setProperty('--ch-qc-scrim-top', `${top}px`);
    return { x: key.left + key.width / 2, y: key.top + key.height / 2 };
  }, [keyRef, phone]);

  // MO-1-3: the sheet's frame never changes; the composer rides the keyboard on a transform (the CSS transition on --ch-qc-kb).
  const ride = useCallback(
    (predicted?: number) => {
      const el = panel.current;
      if (!el) return;
      const vv = window.visualViewport;
      const measured = phone && vv ? Math.max(0, Math.round(el.offsetTop + el.offsetHeight - (vv.offsetTop + vv.height) + 8)) : 0;
      const cover = seam?.keyboard ?? predicted ?? (measured > 120 ? measured : 0);
      if (predicted === undefined && measured > 120) knownKeyboard = measured;
      el.style.setProperty('--ch-qc-kb', `${cover}px`);
    },
    [phone, seam?.keyboard],
  );

  const releaseInert = useRef<(() => void) | null>(null);
  const history = usePanelHistory(open, onClose);
  useLayoutEffect(() => {
    if (open) setShown(true);
  }, [open]);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (open) {
      el.hidden = false;
      if (scrim.current) scrim.current.hidden = false;
      leaving.current = false;
      const origin = place();
      // The key focused a field of its own inside the tap, so iOS raises the keyboard in this gesture: the composer takes it over.
      const proxy = keyRef.current?.querySelector<HTMLInputElement>('.ch-qc-kbd');
      const summoned = !!proxy && document.activeElement === proxy;
      const fine = !phone && window.matchMedia('(pointer: fine)').matches;
      ride(summoned && knownKeyboard ? knownKeyboard : undefined);
      motion.open(el, scrim.current, origin, () => {
        // MQ-1-8: the page is live through the pour and inert from its last frame.
        releaseInert.current?.();
        const wrapper = el.closest('.ch-qcs');
        releaseInert.current = inertOthers([...(wrapper ? [wrapper] : [el]), ...(keyRef.current ? [keyRef.current] : [])]);
      });
      if (fine || summoned) field.current?.focus({ preventScroll: true });
      else el.focus({ preventScroll: true });
    } else if (shown) {
      releaseInert.current?.();
      releaseInert.current = null;
      motion.close(
        el,
        scrim.current,
        () => {
          el.hidden = true;
          if (scrim.current) scrim.current.hidden = true;
          setShown(false);
        },
        thrown.current,
      );
      thrown.current = 0;
      if (!leaving.current) keyRef.current?.querySelector<HTMLElement>('[data-ch-qc-key]')?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the toggle
  }, [open, phone]);
  useEffect(() => () => releaseInert.current?.(), []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !open) return;
    const fit = () => {
      place();
      ride();
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, [open, place, ride]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.closest('[role="menu"], .ch-modal')) return;
      // First Escape leaves a field that has words in it; the next closes (QC-20).
      if (t?.tagName === 'TEXTAREA' && (t as HTMLTextAreaElement).value) {
        panel.current?.focus({ preventScroll: true });
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** Close because the app is going somewhere: the destination takes the panel's history entry, so Back returns to the page. */
  const leaveTo = useCallback(
    (href: string) => {
      const mine = history.forget();
      leaving.current = true;
      onClose();
      if (mine) router.replace(href);
      else router.push(href);
    },
    [history, onClose, router],
  );
  const conversationId = session?.conversationId ?? null;
  const toAsk = () => {
    haptic('press');
    leaveTo(conversationId ? conversationHref(conversationId) : ASK_HOME);
  };

  // Tab stays inside the dialog, with the key as one more stop after the last (AC-QC-PNL-08).
  const onPanelKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const stops = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], input:not(:disabled), [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    const key = keyRef.current?.querySelector<HTMLElement>('[data-ch-qc-key]');
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last || !key) return;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel.current)) {
      e.preventDefault();
      key.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      key.focus();
    }
  };

  // MO-1-5: the header and the grab bar are the sheet's handles. A drag follows the finger from the grab point, either way.
  const drag = useRef<{ id: number; y0: number; on: boolean; y: number; t: number; v: number } | null>(null);
  const handle = phone
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          if ((e.target as HTMLElement).closest('button, a')) return;
          drag.current = { id: e.pointerId, y0: e.clientY, on: false, y: e.clientY, t: e.timeStamp, v: 0 };
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
          const d = drag.current;
          const el = panel.current;
          if (!d || d.id !== e.pointerId || !el) return;
          const dy = e.clientY - d.y0;
          if (!d.on) {
            if (Math.abs(dy) < DRAG_SLOP_PX) return;
            d.on = true;
            d.y0 += Math.sign(dy) * DRAG_SLOP_PX;
            // A pointer the browser no longer has cannot be captured; the drag still follows its moves.
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Not capturable: nothing to do.
            }
          }
          const dt = e.timeStamp - d.t;
          if (dt > 0) d.v = (e.clientY - d.y) / dt;
          d.y = e.clientY;
          d.t = e.timeStamp;
          motion.dragTo(el, scrim.current, e.clientY - d.y0);
        },
        onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
          const d = drag.current;
          const el = panel.current;
          drag.current = null;
          if (!d?.on || !el) return;
          const dy = e.clientY - d.y0;
          // A finger that rested before it lifted is not a fling: its last speed is stale.
          const v = e.timeStamp - d.t > DRAG_REST_MS ? 0 : d.v;
          if (dragCloses(dy, v, el.offsetHeight, DRAG_CLOSE_SHARE, DRAG_FLING)) {
            // Thrown, the close starts at the finger's speed instead of at rest.
            thrown.current = Math.sign(v) === Math.sign(dy) ? Math.abs(v) : 0;
            haptic('commit');
            onClose();
          } else motion.dragBack(el, scrim.current, dy, v);
        },
        onPointerCancel: () => {
          const d = drag.current;
          drag.current = null;
          if (d?.on && panel.current) motion.dragBack(panel.current, scrim.current, d.y - d.y0, 0);
        },
      }
    : {};

  return (
    <div className={'ch-qcs' + (phone ? ' is-phone' : ' is-desk') + (mode !== 'full' ? ' is-reduce' : '')}>
      <div ref={scrim} className="scrim" hidden={!shown} onClick={onClose} aria-hidden="true" />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the dialog keeps Tab inside itself (AC-QC-PNL-08) */}
      <section id="ch-qc-panel" ref={panel} className="qc" role="dialog" aria-modal="true" aria-label="CoachHelm" tabIndex={-1} hidden={!shown} data-ch-qc-panel="" onKeyDown={onPanelKey}>
        <header className="qc__h" data-qc-rise="" data-qc-handle="" {...handle}>
          <span className="qc__mark">
            <HelmMark />
          </span>
          <b className="qc__ttl">CoachHelm</b>
          {/* The activity island's place: one line here while CoachHelm works, opening over the body; empty otherwise. */}
          <span className="qc__isl" ref={setIslandSlot} />
          <Button variant="ghost" size="sm" className="qc__full" rightIcon={ArrowUpRight} aria={{ label: conversationId ? 'Open in Ask' : 'Open Ask' }} onClick={toAsk}>
            <span className="qc__full-l">{conversationId ? 'Open in Ask' : 'Open Ask'}</span>
          </Button>
          <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm qc__x" aria-label="Close" onClick={onClose}>
            <Icon icon={X} size={16} />
          </button>
        </header>
        <div className="qc__sheet">
          <QuickChatThread
            key={restored?.id ?? 'fresh'}
            chat={chat}
            conversationId={restored?.id ?? null}
            initialMessages={restored?.messages}
            restored={!!restored}
            restoring={restoring}
            open={open}
            onClose={onClose}
            leaveTo={leaveTo}
            looking={looking}
            pathname={pathname}
            planOn={planOn}
            phone={phone}
            mode={mode}
            text={text}
            setText={setText}
            field={field}
            islandSlot={islandSlot}
          />
          {phone && <i className="ch-grab ch-grab--hit" aria-hidden="true" data-qc-handle="" {...handle} />}
        </div>
      </section>
    </div>
  );
}
