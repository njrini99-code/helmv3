'use client';

import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { haptic } from '../../lib/haptics';
import { useChPhone } from '../../lib/use-phone';
import { Keys } from '../command/Keys';
import { useCommandDesktop } from '../command/palette-open';
import { isApple, modKey } from '../command/shortcuts';
import { Tooltip } from '../../ui/Tooltip';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { AskSheetContext, lookingAt } from '../AskSheet';
import { useClubhouseRole } from '../context';
import { useCrumbTrail } from '../crumbs';
import '../../styles/quick-chat.css';

const loadSession = () => import('./QuickChatSession');
const QuickChatSession = lazy(loadSession);
import { HelmMark, QcCtx, useQcCtx, type QcRun } from './qc-context';

export { HelmMark, useQcCtx };
export type { QcRun };

const PreviewQuickChat = lazy(() => import('../../preview/PreviewQuickChat'));


export const useQuickChatPresent = (): boolean => useContext(QcCtx) !== null;
/** The run in progress, for Ask to attach to rather than start its own (05 S-PANEL.full). */
export const useQuickChatRun = (): UseCoachHelmChatResult | null => useContext(QcCtx)?.session ?? null;

/**
 * The top-bar Helm key's state. The session (the chat hook) sits in a lazy child mounted once on `warm` and never keyed by path: the stream route aborts when its request goes, so a remount per path would end the run (wiring QW1).
 */
export function QuickChatProvider({ plans = false, pathname, search, enabled, children }: { plans?: boolean; pathname: string; search: string; enabled: boolean; children: ReactNode }) {
  // Preview only: `?qc=<state>` opens the panel at that state with the design page's fixture (QC0).
  const previewState = pathname.startsWith('/clubhouse-preview') || process.env.NODE_ENV !== 'production' ? new URLSearchParams(search).get('qc') : null;
  const initialOpen = !!previewState && previewState !== 'closed' && previewState !== 'live' && previewState !== 'live-work';
  const role = useClubhouseRole();
  const on = enabled && role === 'coach';
  const onCoachHelm = pathname === '/golf/dashboard/coachhelm' || pathname.startsWith('/golf/dashboard/coachhelm/');
  const trail = useCrumbTrail();
  const looking = lookingAt(pathname, search, trail);
  const [open, setOpen] = useState(initialOpen);
  const [loaded, setLoaded] = useState(!!previewState);
  const [run, setRun] = useState<QcRun>({ state: 'idle', label: '' });
  const [flag, setFlag] = useState(false);
  const [session, setSession] = useState<UseCoachHelmChatResult | null>(null);
  const keyRef = useRef<HTMLSpanElement | null>(null);
  const warm = useCallback(() => setLoaded(true), []);
  const toggle = useCallback(() => {
    setLoaded(true);
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'j' || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing && !t?.closest('.ch-qcs')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, toggle]);

  useEffect(() => {
    if (open) setFlag(false);
  }, [open]);

  const value = useMemo(() => ({ on: on && !onCoachHelm, open, setOpen, toggle, warm, run, setRun, flag, setFlag, keyRef, session, setSession }), [on, onCoachHelm, open, toggle, warm, run, flag, session]);
  const legacy = useMemo(() => ({ open, setOpen, warm, available: on && !onCoachHelm }), [open, warm, on, onCoachHelm]);
  return (
    <QcCtx.Provider value={value}>
      <AskSheetContext.Provider value={legacy}>
        {children}
        {on && loaded && (
          <Suspense fallback={null}>
            {previewState ? (
              <PreviewQuickChat state={previewState} open={open} onClose={() => setOpen(false)} looking={looking} pathname={pathname} />
            ) : (
              <QuickChatSession open={open && !onCoachHelm} onClose={() => setOpen(false)} looking={looking} pathname={pathname} planOn={plans} />
            )}
          </Suspense>
        )}
      </AskSheetContext.Provider>
    </QcCtx.Provider>
  );
}



/**
 * The key in the bar's 44pt slot, and the live pill that grows from it while a task runs with the panel closed. Hidden on CoachHelm, as today's key is.
 * It says what it is (owner, 2026-11-05: a wheel alone and a shortcut were no way in): its name beside the mark on a tab root and on a wide desk, with the
 * chord on the desk. A pushed page's bar, a narrow desk and a very narrow phone keep the design's plain 44pt mark.
 */
export function HelmKey() {
  const c = useContext(QcCtx);
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const desktop = useCommandDesktop();
  if (!c?.on) return null;
  const { open, toggle, warm, run, flag, keyRef } = c;
  const live = !open && run.state !== 'idle';
  return (
    <span className={'ch-qck keyslot' + (phone ? ' is-phone' : ' is-desk') + (reduced ? ' is-reduce' : '')} ref={keyRef}>
      <Tooltip shortcut={[modKey(true), 'J']}>
      <button
        type="button"
        className={'hkey' + (open ? ' is-on' : '') + (open && run.state === 'work' ? ' is-working' : '') + (flag ? ' has-flag' : '')}
        aria-label="CoachHelm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="ch-qc-panel"
        data-ch-qc-key=""
        style={live ? { visibility: 'hidden' } : undefined}
        onPointerEnter={warm}
        onFocus={warm}
        onPointerDown={warm}
        onClick={() => {
          haptic('press');
          toggle();
        }}
      >
        <span className="hkey__disc" />
        <HelmMark className="hkey__mark" />
        <span className="hkey__label" aria-hidden="true">
          CoachHelm
        </span>
        {desktop && <Keys keys={[modKey(isApple(navigator)), 'J']} />}
        <span className="hkey__flag" />
      </button>
      </Tooltip>
      {live && (
        <button type="button" className="live" aria-live="polite" onClick={toggle} style={{ maxWidth: phone ? 172 : 260 }}>
          <span className="live__ic">
            {run.state === 'work' && <span className="live__spin" />}
            {run.state === 'wait' && <span className="live__dot" />}
            {run.state === 'done' && (
              <span className="live__ok">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
          </span>
          <span className="live__l" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {run.label}
          </span>
        </button>
      )}
    </span>
  );
}
