'use client';

import { AnimatePresence, m } from 'framer-motion';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

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
}

type ShowToast = (toast: ToastInput) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const DISMISS_MS = { done: 4000, error: 8000 } as const;

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
  const timers = useRef(new Set<number>());
  const reduced = useChReducedMotion();
  // A toast's dismiss timer must not fire after the provider unmounts (a route change, a test teardown).
  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live) window.clearTimeout(t);
      live.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ShowToast>(
    ({ title, tone = 'done', body, action, code }) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, title, tone, body, action, code }]);
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, DISMISS_MS[tone]);
      timers.current.add(timer);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  const host = useToastHost(toasts.length > 0);

  const stack = (
    // CH-1804: confirmations are announced politely; an error toast is role="alert", announced at once.
    <div className={'ch-toasts' + (host ? ' ch-toasts--in-dialog' : '')} aria-live="polite" data-ui="clubhouse">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            layout={!reduced}
            className={'ch-toast' + (t.tone === 'error' ? ' ch-toast--error' : '')}
            role={t.tone === 'error' ? 'alert' : 'status'}
            data-ch-code={t.code}
            initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            // CH-1604: a toast slides up 10px and fades in; the stack reflows (layout).
            transition={chTween('base')}
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
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </m.div>
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
