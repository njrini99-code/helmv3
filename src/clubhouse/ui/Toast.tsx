'use client';

import { AnimatePresence, m } from 'framer-motion';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { CH_DUR, chSpringCurve, chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { chSupportsLinear, chThrownExit } from '../lib/sheet-drag';

interface ToastItem {
  id: number;
  title: string;
  /** Error toasts say what failed and what to do next; they stay 8s. */
  tone: 'done' | 'error';
  body?: string;
  action?: { label: string; run: () => void };
  /** Catalog number (docs/clubhouse/catalog), rendered as data-ch-code. */
  code?: string;
}

export interface ToastInput {
  title: string;
  tone?: ToastItem['tone'];
  body?: string;
  action?: ToastItem['action'];
  code?: string;
  /** Ends only this notice's lifetime; aborting never cancels the work it describes. */
  signal?: AbortSignal;
}

type ShowToast = (toast: ToastInput) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/** A request's delayed feedback ends on settlement, replacement or unmount, independently of its write. */
export function useDelayedToast() {
  const toast = useToast();
  const currentToast = useRef(toast);
  currentToast.current = toast;
  // Separate collections let new-scope layout effects schedule before the old passive cleanup runs.
  const lifetime = useMemo(() => ({ toast, live: true, cancellations: new Set<() => void>() }), [toast]);
  useEffect(() => {
    lifetime.live = true;
    return () => {
      lifetime.live = false;
      for (const cancel of lifetime.cancellations) cancel();
      lifetime.cancellations.clear();
    };
  }, [lifetime]);
  return useCallback((input: Omit<ToastInput, 'signal'>, delay: number): (() => void) => {
    // A queued save may still finish after its screen leaves; it must not raise old progress over the next screen.
    if (!lifetime.live || lifetime.toast !== currentToast.current) return () => {};
    const controller = new AbortController();
    const timer = window.setTimeout(() => lifetime.toast({ ...input, signal: controller.signal }), delay);
    const cancel = () => {
      window.clearTimeout(timer);
      lifetime.cancellations.delete(cancel);
      controller.abort();
    };
    lifetime.cancellations.add(cancel);
    return cancel;
  }, [lifetime]);
}

const DISMISS_MS = { done: 4000, error: 8000 } as const;
/** Let go after holding one, a toast stays at least this long, so it never vanishes the moment the finger lifts. */
const HELD_RESUME_MS = 1500;
/** A toast swiped this far toward its edge, or flicked, is dismissed (CH-1614). */
const SWIPE_DISMISS_PX = 40;
const SWIPE_FLICK_PX_PER_MS = 0.5;

/** A toast's own clock: it runs out after its time on screen, and stops while a finger holds the toast. */
interface ToastClock {
  left: number;
  since: number;
  timer: number;
  held: boolean;
}

/** The open dialog on top, if any (the last one opened is last in the top layer). Clubhouse opens every dialog with showModal (ui/Modal). */
function topModal(): HTMLDialogElement | null {
  const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return open[open.length - 1] ?? null;
}

/**
 * CH-1812: a modal dialog makes everything outside it inert, and the top layer
 * paints over it, so a toast raised while one is open was unseen, unannounced
 * and its Retry unreachable (seen in Chromium and WebKit). While toasts are up,
 * this follows the open dialog; they render inside it.
 */
function useToastHost(active: boolean): HTMLDialogElement | null {
  const [host, setHost] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (!active) {
      setHost(null);
      return;
    }
    const sync = () => setHost(topModal());
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => watch.disconnect();
  }, [active]);
  return host;
}

/**
 * Ink toasts bottom-right (above the tab bar on phones): confirmations 4s, errors 8s.
 *
 * `scope` is whose work the toasts are about (the shell passes the team). When it changes, the stack clears: an old
 * team's confirmation, Undo or Retry never sits over, or acts from, the new team's page (PAGE_PERFORMANCE.md rule 8).
 */
export function ToastProvider({ children, scope = '' }: { children: ReactNode; scope?: string }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [shownScope, setShownScope] = useState(scope);
  if (scope !== shownScope) {
    // Cleared in the same render that draws the new scope, so not one frame shows the old stack.
    setShownScope(scope);
    setToasts([]);
  }
  const nextId = useRef(1);
  const scoped = useMemo(() => ({ scope, lifetimes: new Map<number, () => void>(), clocks: new Map<number, ToastClock>() }), [scope]);
  const currentScope = useRef(scoped);
  currentScope.current = scoped;
  const { lifetimes, clocks } = scoped;
  const reduced = useChReducedMotion();
  // Release timers and abort listeners on team changes as well as provider unmount.
  useEffect(() => {
    return () => {
      for (const release of lifetimes.values()) release();
      lifetimes.clear();
    };
  }, [lifetimes]);

  const release = useCallback((id: number) => {
    const cleanup = lifetimes.get(id);
    lifetimes.delete(id);
    clocks.delete(id);
    cleanup?.();
  }, [lifetimes, clocks]);
  const dismiss = useCallback((id: number) => {
    release(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, [release]);
  const show = useCallback<ShowToast>(
    ({ title, tone = 'done', body, action, code, signal }) => {
      // Async feedback from a prior team never repopulates the new team's stack.
      if (scoped !== currentScope.current || signal?.aborted) return;
      // The stack holds at most three notices; an evicted notice owns no future timer/listener.
      if (lifetimes.size >= 3) release(lifetimes.keys().next().value!);
      const id = nextId.current++;
      const abort = () => dismiss(id);
      const clock: ToastClock = { left: DISMISS_MS[tone], since: Date.now(), timer: window.setTimeout(() => dismiss(id), DISMISS_MS[tone]), held: false };
      clocks.set(id, clock);
      signal?.addEventListener('abort', abort, { once: true });
      lifetimes.set(id, () => {
        window.clearTimeout(clock.timer);
        signal?.removeEventListener('abort', abort);
      });
      setToasts((t) => [...t.slice(-2), { id, title, tone, body, action, code }]);
    },
    [dismiss, release, scoped, lifetimes, clocks],
  );
  const value = useMemo(() => show, [show]);
  // CH-1614: a finger on a toast stops its clock; letting go starts it again with what was left, and never less than
  // HELD_RESUME_MS, so it can be read to the end.
  const hold = useCallback((id: number) => {
    const clock = clocks.get(id);
    if (!clock || clock.held) return;
    window.clearTimeout(clock.timer);
    clock.left = Math.max(0, clock.left - (Date.now() - clock.since));
    clock.held = true;
  }, [clocks]);
  const letGo = useCallback((id: number) => {
    const clock = clocks.get(id);
    if (!clock?.held) return;
    clock.held = false;
    clock.left = Math.max(clock.left, HELD_RESUME_MS);
    clock.since = Date.now();
    clock.timer = window.setTimeout(() => dismiss(id), clock.left);
  }, [clocks, dismiss]);
  const host = useToastHost(toasts.length > 0);

  const stack = (
    // CH-1804: confirmations are announced politely; an error toast is role="alert", announced at once.
    <div className={'ch-toasts' + (host ? ' ch-toasts--in-dialog' : '')} aria-live="polite" data-ui="clubhouse">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} reduced={reduced} onHold={hold} onLetGo={letGo} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {host ? createPortal(stack, host) : stack}
    </ToastContext.Provider>
  );
}

/**
 * One toast. CH-1604: it slides up 10px and fades in; the stack reflows (layout). CH-1614: a finger holds it (its
 * clock stops) and can throw it toward the edge the stack sits on; past 40px or on a flick it goes on at the speed
 * it was thrown and fades, otherwise it springs back. The other way it barely gives. Its action stays a button. With
 * reduced motion it doesn't follow the finger, but holding still stops its clock.
 */
function ToastCard({
  toast: t,
  reduced,
  onHold,
  onLetGo,
  onDismiss,
}: {
  toast: ToastItem;
  reduced: boolean;
  onHold: (id: number) => void;
  onLetGo: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** Set as a swipe dismisses it: which way it was thrown and how fast (px per ms), read once its exit begins. */
  const thrown = useRef<{ edge: 1 | -1; speed: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0 || e.isPrimary === false || (e.target as Element).closest('button')) return;
    onHold(t.id);
    const pointerId = e.pointerId;
    const start = e.clientY;
    const rect = el.getBoundingClientRect();
    // Toward the screen edge the stack sits on: down at the foot of the screen, up when it drops from the top (CH-1812).
    const edge: 1 | -1 = rect.top + rect.height / 2 < window.innerHeight / 2 ? -1 : 1;
    if (typeof pointerId === 'number') el.setPointerCapture?.(pointerId);
    el.style.transition = 'none';
    let d = 0;
    let last: [number, number] = [e.timeStamp, 0];
    let speed = 0;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || reduced) return;
      const raw = (ev.clientY - start) * edge;
      // Away from its edge it barely gives (a quarter of the finger, never past 12px).
      d = raw >= 0 ? raw : -Math.min(12, -raw / 4);
      const dt = ev.timeStamp - last[0];
      if (dt > 0) speed = (d - last[1]) / dt;
      last = [ev.timeStamp, d];
      el.style.translate = `0 ${d * edge}px`;
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
      // As for a sheet: the speed fades with the time since the finger last moved.
      const age = Math.max(0, ev.timeStamp - last[0]);
      const fresh = age < 80 ? speed * (1 - age / 80) : 0;
      if (ev.type === 'pointerup' && (d > SWIPE_DISMISS_PX || (d > 10 && fresh > SWIPE_FLICK_PX_PER_MS))) {
        thrown.current = { edge, speed: Math.max(0, fresh) };
        onDismiss(t.id);
        return;
      }
      if (d !== 0) {
        const curve = chSupportsLinear() ? chSpringCurve('smooth', { velocity: (-fresh * 1000) / d, rest: 0.5 / Math.abs(d) }) : null;
        el.style.transition = curve ? `translate ${curve.ms}ms ${curve.linear}` : 'translate var(--ch-dur-release) var(--ch-ease)';
      }
      el.style.translate = '';
      onLetGo(t.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const leave = {
    gone: () => {
      const throw_ = thrown.current;
      if (reduced) return { opacity: 0, transition: { duration: 0 } };
      if (!throw_) return { opacity: 0, y: 6, scale: 0.98, transition: chTween('base') };
      // On from where the finger let go, at the speed it was thrown, for another 48px as it fades.
      const out = chThrownExit(throw_.speed, 48);
      return { y: [out.lead * throw_.edge, 48 * throw_.edge], opacity: 0, transition: { y: { duration: out.ms / 1000, ease: out.ease }, opacity: { duration: CH_DUR.quick } } };
    },
  };
  return (
    <m.div
      ref={ref}
      layout={!reduced}
      className={'ch-toast' + (t.tone === 'error' ? ' ch-toast--error' : '')}
      role={t.tone === 'error' ? 'alert' : 'status'}
      data-ch-code={t.code}
      initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      variants={leave}
      exit="gone"
      // CH-1604: a toast slides up 10px and fades in; the stack reflows (layout).
      transition={chTween('base', reduced)}
      onPointerDown={onPointerDown}
    >
      <Icon icon={t.tone === 'error' ? CircleAlert : CircleCheck} size={16} className="ch-toast__icon" />
      <span className="ch-toast__txt">
        <span>{t.title}</span>
        {t.body && <span className="ch-toast__body">{t.body}</span>}
      </span>
      {t.action && (
        <button
          type="button"
          className="ch-toast__action"
          onClick={() => {
            t.action?.run();
            onDismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
    </m.div>
  );
}
