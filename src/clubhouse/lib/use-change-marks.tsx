'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CH_MARKS_COOKIE, CH_MARKS_MAX_AGE, markKey, serializeMarks, showAgain as showAgainEntry, withMark, type MarkEntries } from './marks-cookie';

/**
 * What this device has seen of the calendar's change marks (P-14), kept in the `ch_marks` cookie so the server paints an
 * already-seen mark right on the first frame. Three things are remembered per change:
 *
 * - seen (`s`): the strike has been drawn once. The draw itself is CSS (a one-shot animation on a pending mark); one
 *   shared IntersectionObserver only records that a mark was 60% on screen, so the next paint is already struck;
 * - got it (`g`): the viewer hid the change on this device. Every surface that shows the mark reads it;
 * - show it again: back to seen, without drawing a second time.
 *
 * Device-only (owner call 12.4). Every cookie write is inside try/catch: a browser with cookies off still shows every mark.
 */

interface MarksApi {
  entries: MarkEntries;
  markSeen: (changeId: string) => void;
  gotIt: (changeId: string) => void;
  showAgain: (changeId: string) => void;
  watch: (el: Element, changeId: string) => () => void;
}

const MarksContext = createContext<MarksApi | null>(null);

function writeCookie(entries: MarkEntries): void {
  try {
    document.cookie = `${CH_MARKS_COOKIE}=${serializeMarks(entries)}; path=/; max-age=${CH_MARKS_MAX_AGE}; samesite=lax`;
  } catch {
    // Cookies off or blocked: the marks still show, and draw again next visit.
  }
}

export function ChangeMarksProvider({ marks, children }: { marks: MarkEntries; children: ReactNode }) {
  const [entries, setEntries] = useState<MarkEntries>(marks);
  const latest = useRef(entries);
  const io = useRef<IntersectionObserver | null>(null);
  const watched = useRef(new Map<Element, string>());

  const commit = useCallback((next: MarkEntries) => {
    latest.current = next;
    setEntries(next);
    writeCookie(next);
  }, []);

  const hasFlag = (changeId: string) => latest.current.some(([k]) => k === markKey(changeId));

  const markSeen = useCallback(
    (changeId: string) => {
      if (!hasFlag(changeId)) commit(withMark(latest.current, changeId, 's'));
    },
    [commit],
  );
  const gotIt = useCallback((changeId: string) => commit(withMark(latest.current, changeId, 'g')), [commit]);
  const showAgain = useCallback((changeId: string) => commit(showAgainEntry(latest.current, changeId)), [commit]);

  const watch = useCallback(
    (el: Element, changeId: string) => {
      // No IntersectionObserver (an old WebView, a test): a mark counts as seen at once, so nothing waits on it.
      if (typeof IntersectionObserver === 'undefined') {
        markSeen(changeId);
        return () => {};
      }
      if (!io.current) {
        io.current = new IntersectionObserver(
          (list) => {
            let next = latest.current;
            for (const entry of list) {
              const id = watched.current.get(entry.target);
              if (!entry.isIntersecting || !id) continue;
              io.current?.unobserve(entry.target);
              watched.current.delete(entry.target);
              if (!next.some(([k]) => k === markKey(id))) next = withMark(next, id, 's');
            }
            if (next !== latest.current) commit(next);
          },
          { threshold: 0.6 },
        );
      }
      watched.current.set(el, changeId);
      io.current.observe(el);
      return () => {
        watched.current.delete(el);
        io.current?.unobserve(el);
      };
    },
    [commit, markSeen],
  );

  useEffect(
    () => () => {
      io.current?.disconnect();
      io.current = null;
    },
    [],
  );

  const api = useMemo<MarksApi>(() => ({ entries, markSeen, gotIt, showAgain, watch }), [entries, markSeen, gotIt, showAgain, watch]);
  return <MarksContext.Provider value={api}>{children}</MarksContext.Provider>;
}

export interface ChangeMarkState {
  /** The strike has been drawn on this device (or the viewer cleared the mark). */
  seen: boolean;
  /** The viewer chose Got it on this device. */
  got: boolean;
  gotIt: () => void;
  showAgain: () => void;
  /** A struck value registers its element: once 60% of it has been on screen, the mark counts as seen. */
  watch: (el: Element) => () => void;
}

const NOOP = () => {};

/** One change's state on this device. Without a provider (a preview, a test) a mark is seen and not cleared. */
export function useMark(changeId: string | null | undefined): ChangeMarkState {
  const api = useContext(MarksContext);
  const apiWatch = api?.watch;
  const apiGotIt = api?.gotIt;
  const apiShowAgain = api?.showAgain;
  const live = !!api && !!changeId;
  const flag = live ? api.entries.find(([k]) => k === markKey(changeId))?.[1] : undefined;
  const gotIt = useCallback(() => {
    if (apiGotIt && changeId) apiGotIt(changeId);
  }, [apiGotIt, changeId]);
  const showAgain = useCallback(() => {
    if (apiShowAgain && changeId) apiShowAgain(changeId);
  }, [apiShowAgain, changeId]);
  const watch = useCallback((el: Element) => (apiWatch && changeId ? apiWatch(el, changeId) : NOOP), [apiWatch, changeId]);
  return useMemo<ChangeMarkState>(() => ({ seen: live ? flag !== undefined : true, got: flag === 'g', gotIt, showAgain, watch }), [live, flag, gotIt, showAgain, watch]);
}

/** Which changes this device has seen or cleared, for a list that reads many marks in one render (a hook per row would break the rules of hooks). */
export function useMarkReader(): (changeId: string | null | undefined) => { seen: boolean; got: boolean } {
  const api = useContext(MarksContext);
  const entries = api?.entries;
  return useCallback(
    (changeId) => {
      if (!entries || !changeId) return { seen: true, got: false };
      const flag = entries.find(([k]) => k === markKey(changeId))?.[1];
      return { seen: flag !== undefined, got: flag === 'g' };
    },
    [entries],
  );
}
