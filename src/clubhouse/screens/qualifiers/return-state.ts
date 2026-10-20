'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, type MouseEvent } from 'react';

/**
 * Coming back to the Qualifiers list from a qualifier (owner rule 8, 2026-10-01). The list's filter and search come back through the
 * shell's `useChSessionState`, and its place in the list through RouteFrame, which records the scroll per page and restores it on Back
 * or Forward (a popstate; a new page still opens at the top, CH-1904). What is left for these screens is making the Back controls a
 * real Back: a push to the list is a new page, so it would open at the top and not where the coach was. The same goes for Manage
 * selections, whose Back returns to the qualifier.
 *
 * A qualifier opened from the list leaves a note in `sessionStorage` (this tab only). The qualifier reads it once, when it mounts, and
 * spends it; its Back then steps back in history (which brings the list back with its filter, search and place) instead of pushing a
 * new list on top. Manage selections opened from the qualifier does the same for its own Back, and hands the list's note back to the
 * qualifier as it steps back, so the qualifier's Back is still a step back to the list. With no note (a deep link, a fresh tab, Home's
 * link, a shared address) Back goes to the address as before. Same pattern as the Rounds library (screens/rounds/return-state.ts).
 *
 * Spending the note at the first mount is what keeps it honest: a later page for the same qualifier that the list did not open (the
 * edit form's save, Confirm squad, a Forward) is not the entry after the list, so its Back goes to the address. A note is only written
 * by a plain click, since a new-tab click leaves this tab where it is, and it carries the time of the click: one older than ten
 * seconds is the click of a page that never opened, and is ignored and dropped.
 *
 * Client-only. A blocked store only costs the step back: Back then goes to the address.
 */

export const LIST_HREF = '/golf/dashboard/qualifiers';

const FROM_LIST_KEY = 'ch:qualifiers:from-list';
const FROM_DETAIL_KEY = 'ch:qualifiers:from-detail';
/** A second tap on a Back control inside this long is the first tap's: it must not step back twice and skip the list. */
const STEP_WINDOW_MS = 1000;
/**
 * A note is the click that is being followed. One older than this belongs to a page that never opened (a navigation that failed or
 * was cancelled), so it must not send the next visit to that qualifier from somewhere else back to the wrong page.
 */
const NOTE_FRESH_MS = 10_000;

interface Note {
  id: string;
  /** When the click was made (`Date.now()`). */
  at: number;
  /** Manage selections only: the qualifier it was opened from had itself been opened from the list. */
  listBelow?: boolean;
}

function write(key: string, note: Omit<Note, 'at'>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...note, id: note.id.toLowerCase(), at: Date.now() }));
  } catch {
    /* Back goes to the address */
  }
}

/** The note, when it is fresh and names this qualifier; the note is spent as it is read, and a stale one is dropped. */
function take(key: string, qualifierId: string): Note | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Note | null;
    if (!kept) return null;
    if (typeof kept.at !== 'number' || Date.now() - kept.at > NOTE_FRESH_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (kept.id !== qualifierId.toLowerCase()) return null;
    sessionStorage.removeItem(key);
    return kept;
  } catch {
    return null;
  }
}

/** This qualifier is being opened from the list: remember which. */
export const noteOpenedFromList = (qualifierId: string): void => write(FROM_LIST_KEY, { id: qualifierId });

/** A plain click only: a new-tab click (a modifier or a middle button) is the address's, as it always was. */
export const isPlainClick = (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean =>
  e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * A screen's Back to its parent: a step in history when the note says the parent is the entry before this one, the parent's address
 * otherwise. `from` is who the note says opened this screen. `onClickCapture` goes on whatever wraps a Back link (the link keeps its
 * `href`, so a new-tab click and a long-press work); `onBack` is for the phone's top bar, which has no link; `opened` says whether a
 * note named this screen.
 */
export function useStepBack(from: 'list' | 'detail', qualifierId: string, href: string) {
  const router = useRouter();
  const noted = useRef<Note | null>(null);
  const stepped = useRef(0);
  useEffect(() => {
    // Read once and spent. A second run of this effect (strict mode) finds nothing and keeps what the first one read.
    const note = take(from === 'list' ? FROM_LIST_KEY : FROM_DETAIL_KEY, qualifierId);
    if (note) noted.current = note;
  }, [from, qualifierId]);
  const opened = (): boolean => noted.current?.id === qualifierId.toLowerCase();
  const step = (): boolean => {
    if (!opened()) return false;
    if (Date.now() - stepped.current < STEP_WINDOW_MS) return true;
    stepped.current = Date.now();
    // Manage selections returning to a qualifier the list opened: it comes back as a new page, and its Back is a step to the list too.
    if (from === 'detail' && noted.current?.listBelow) noteOpenedFromList(qualifierId);
    router.back();
    return true;
  };
  return {
    opened,
    onBack: () => {
      if (!step()) router.push(href);
    },
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (isPlainClick(e) && step()) e.preventDefault();
    },
  };
}

/**
 * For a container with a "Manage selections" link: a plain click on that link leaves the note its Back steps back by. `fromList` says
 * whether this qualifier was itself opened from the list.
 */
export const noteIfSelectionLink = (qualifierId: string, fromList: () => boolean) => (e: MouseEvent<HTMLElement>) => {
  const link = (e.target as Element).closest('a');
  if (link?.getAttribute('href') === `${LIST_HREF}/${qualifierId}/selection` && isPlainClick(e)) {
    write(FROM_DETAIL_KEY, { id: qualifierId, listBelow: fromList() });
  }
};
