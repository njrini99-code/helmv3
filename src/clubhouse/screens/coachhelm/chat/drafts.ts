'use client';

import { useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { RouteScope } from '../../../lib/session-state';

/**
 * The Ask composer's unsent text, kept for this tab (owner rule 8, 2026-10-01: a coach who leaves for a player's page and comes back
 * finds what they were typing). Keyed by the page's route and team (`RouteScope`), the signed-in coach and the conversation
 * (`draftKey`, "coach:chat"; the new chat is its own), so another team, another coach in the same tab or another chat never opens on
 * it. Cleared when the text is sent or emptied (an empty box stores nothing). Storage can be absent or refuse writes: every access is
 * guarded and the box still works. Precedent: `screens/messages/drafts.ts`.
 *
 * It is restored after the screen has mounted, never during the render, so a hard load hydrates the empty box the server drew. A key
 * that changes under a live box (a new chat that has just been given its id) takes the draft with it.
 */
const PREFIX = 'ch:ask:draft:';

function read(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked or full: the text still stays in the box for this visit.
  }
}

export function useAskDraft(draftKey: string | null): [string, Dispatch<SetStateAction<string>>] {
  const scope = useContext(RouteScope);
  const key = draftKey && scope ? `${PREFIX}${scope}\u0000${draftKey}` : null;
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
    // The box moved to another key while it was alive (the new chat's id arrived): the old entry goes, the text is stored under the new.
    if (was.current && was.current !== key) write(was.current, '');
    was.current = key;
    if (key) write(key, value);
  }, [key, value]);

  return [value, setValue];
}
