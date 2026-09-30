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

/** Ink toasts bottom-right (above the tab bar on phones): confirmations 4s, errors 8s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const reduced = useChReducedMotion();

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ShowToast>(
    ({ title, tone = 'done', body, action, code }) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, title, tone, body, action, code }]);
      window.setTimeout(() => dismiss(id), DISMISS_MS[tone]);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  const host = useToastHost(toasts.length > 0);

  const stack = (
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
