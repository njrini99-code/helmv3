'use client';

import { useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { RouteScope } from '../../../lib/session-state';

/**
 * What the Ask page keeps for this tab (owner rule 8, 2026-10-01: a coach who leaves for a player's page and comes back finds what they
 * were doing): the composer's unsent text (`useAskDraft`), and the chats panel and the History search (`useAskKept`). Keyed by the
 * page's route and team (`RouteScope`), so another team never opens on it; the draft also by the signed-in coach and the conversation
 * (`askDraftKey`), so another coach in the same tab or another chat never does. Storage can be absent or refuse writes: every access
 * is guarded and the control still works. Precedent: `screens/messages/drafts.ts`.
 *
 * Both are restored after the screen has mounted, never during the render. Ask sits in the route's Suspense, so it can hydrate after
 * the shell has marked the app running, and a value read during that render would disagree with the server's markup: the first
 * render is the default, as the server drew it, and the kept value arrives in an effect. (The shell's `useChSessionState` reads in its
 * initialiser, which is right for a page that mounts on a client navigation and not for one that may be hydrating.)
 */
const DRAFT = 'ch:ask:draft:';
const KEPT = 'ch:ask:kept:';
const NEW_SUFFIX = ':new';

/** One chat's draft: "coach:chat", the new chat (no id yet) being "coach:new". */
export function askDraftKey(coachId: string | undefined, chatId: string | null): string | null {
  return coachId ? `${coachId}:${chatId ?? 'new'}` : null;
}

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked or full: the value still stays in the control for this visit.
  }
}

export function useAskDraft(draftKey: string | null): [string, Dispatch<SetStateAction<string>>] {
  const scope = useContext(RouteScope);
  const key = draftKey && scope ? `${DRAFT}${scope}\u0000${draftKey}` : null;
  const [value, setValue] = useState('');
  const was = useRef<string | null>(key);

  // Restored once, after mount: a draft is only taken into an empty box (the coach may have started typing already).
  useEffect(() => {
    if (!key) return;
    const saved = read(key);
    if (saved) setValue((v) => v || saved);
    // Mount only.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const before = was.current;
    was.current = key;
    if (before && before !== key) {
      if (before.endsWith(NEW_SUFFIX)) {
        // The new chat was given its id: it is the same chat, so what the coach has typed since moves with it.
        write(before, null);
        if (key) write(key, value);
      } else {
        // The coach left a chat for another (New chat): the chat they left keeps its draft, which was stored as it was typed, and the
        // box shows the draft of the one they are in now (none if it has none), never the other chat's text.
        setValue(key ? (read(key) ?? '') : '');
      }
      return;
    }
    if (key) write(key, value);
  }, [key, value]);

  return [value, setValue];
}

/**
 * A value of Ask's own layout that the coach left as it was (the chats panel open or hidden, the History search). The default on the
 * first render, restored after mount; stored only while it differs from the default. Primitives only (a boolean or a string).
 */
export function useAskKept<T extends boolean | string>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(RouteScope);
  const key = scope ? `${KEPT}${scope}\u0000${name}` : null;
  const [value, setValue] = useState<T>(initial);
  // What the store holds, so the effect below writes only what the coach changed: not the default on mount, and not the value it has just read.
  const synced = useRef<T>(initial);

  useEffect(() => {
    if (!key) return;
    const raw = read(key);
    if (raw === null) return;
    try {
      const saved = JSON.parse(raw) as unknown;
      if (typeof saved === typeof initial) {
        synced.current = saved as T;
        setValue(saved as T);
      }
    } catch {
      // A value that does not parse is not a kept one.
    }
    // Mount only; `initial` is a default.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key || Object.is(synced.current, value)) return;
    synced.current = value;
    write(key, Object.is(value, initial) ? null : JSON.stringify(value));
    // `initial` is a default, read for comparison only.
  }, [key, value]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}
