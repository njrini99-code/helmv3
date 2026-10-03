'use client';

import { useMemo, useRef } from 'react';
import { haptic } from '../../../lib/haptics';
import { useToast, type ToastInput } from '../../../ui/Toast';
import { entryFailureToast } from './failures';

/*
 * What the round engines ask of the screen (`NewRoundSessionPorts`, `ContinueRoundSessionPorts`), as Clubhouse
 * answers them. The engines take a toast function and tell the player things through it: a save that is slow, a
 * backup that failed, a round that changed on another device, and, in the continue engine, the failure of a Save for
 * later, a discard or a change to practice. Here every one of those becomes a Clubhouse state.
 */

type EngineToast = 'success' | 'error' | 'warning' | 'info';

/**
 * The round changed on another device. The two engines word it differently ("Please reload." in the new-round engine,
 * `ROUND_CONFLICT_MESSAGE`'s "Reload to continue." in the continue engine), and both mean CH-11902.
 */
export const isRoundConflictMessage = (message: string) => /was updated on another device/i.test(message);

/**
 * The toast for an engine notice: Clubhouse's words (sentence case, what to do next) for the notices the engines
 * word for the Fairway toast, and the engine's own words for anything else. Toasts are done or error, so a warning
 * is drawn as the longer error toast. CH-11903 to CH-11908.
 */
export function noticeToast(message: string, type: EngineToast): ToastInput {
  if (/^auto-save is having trouble/i.test(message)) {
    return { tone: 'error', title: 'Saving is slow', body: 'Your shots are safe on this device. The copy on the server may be late.', code: 'CH-11903' };
  }
  if (/could not save a quick local backup/i.test(message)) {
    return { tone: 'error', title: 'This device couldn’t keep a quick backup', body: 'Your shots are still saving to a slower backup and to the server.', code: 'CH-11904' };
  }
  if (/^round saved on this device/i.test(message)) {
    return { tone: 'error', title: 'Your round is saved on this device', body: 'It couldn’t reach the server. Restore it on the next screen to submit it.', code: 'CH-11905' };
  }
  if (/^saved as a practice round/i.test(message)) {
    return { title: 'Saved as a practice round', code: 'CH-11906' };
  }
  return { tone: type === 'success' || type === 'info' ? 'done' : 'error', title: message, code: 'CH-11908' };
}

/** What the engine told the player while an action ran. */
export interface RoundNotices {
  /** Sentences the engine raised as errors: the reason an action failed (the continue engine's way). */
  errors: string[];
  /** The round changed on another device, and the engine said so. */
  conflict: boolean;
}

/**
 * The engine's ports, stable for the life of the screen (a new function each render would re-create every engine
 * callback that lists it, and re-run its effects), and `capture`, which runs an engine action and hands back what it
 * told the player while it ran instead of drawing the errors, so the action reports its own failure once, with its
 * own code and Retry. Outside a capture an error is drawn as it comes: nothing the engine says is dropped.
 * The conflict message is always CH-11902's toast, with Reload.
 */
export function useRoundPorts() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  // The actions running now: what the engine says is theirs to report, all of them if two overlap.
  const capturing = useRef<Set<RoundNotices>>(new Set());

  return useMemo(() => {
    const showToast = (message: string, type: EngineToast) => {
      const running = capturing.current;
      if (isRoundConflictMessage(message)) {
        for (const n of running) n.conflict = true;
        haptic('error');
        toastRef.current(entryFailureToast('round-updated', { run: () => window.location.reload() }));
        return;
      }
      if (type === 'error' && running.size) {
        for (const n of running) n.errors.push(message);
        return;
      }
      if (type === 'error') haptic('error');
      toastRef.current(noticeToast(message, type));
    };
    const ports = {
      showToast,
      // Clubhouse hides its own tab bar (`usePhoneTabsHidden`); the engine's are the Fairway nav's.
      hideMobileNav: () => {},
      showMobileNav: () => {},
      haptic: (event: 'error') => haptic(event),
    };
    /** Runs `run`, and returns what it returned or threw, with what the engine said meanwhile. */
    async function capture<T>(run: () => Promise<T>): Promise<{ value?: T; thrown?: unknown; notices: RoundNotices }> {
      const notices: RoundNotices = { errors: [], conflict: false };
      capturing.current.add(notices);
      try {
        return { value: await run(), notices };
      } catch (thrown) {
        return { thrown, notices };
      } finally {
        capturing.current.delete(notices);
      }
    }
    return { ports, capture };
  }, []);
}
