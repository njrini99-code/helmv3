'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '../../ui/Toast';
import { PIN_LIMIT, readPinned, usePinned, withPin, writePinned, type ChPins } from './pinned';

/**
 * Pins on every device (PR 11h, PIN-SYNC): the server's list is the truth, every write returns it, and a change on another device arrives as
 * a private broadcast on the viewer's own topic. With the held table missing the hook keeps device pins (`pinned.ts`) with no error anywhere,
 * remembers that for 5 minutes, and picks the server up by itself after the owner applies. Flag off: no request at all.
 */
const UNAVAILABLE_MS = 5 * 60_000;
const PROBE_WAIT_MS = 1500;
let unavailableUntil = 0;

const importKey = (viewer: string, team: string) => `ch:msg:pins-imported:${viewer}:${team}`;

interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
}

const isMissing = (e: RpcError | null | undefined) => e?.code === '42P01' || e?.code === 'PGRST205' || e?.code === 'PGRST202';

function detailList(e: RpcError): string[] | null {
  try {
    const parsed: unknown = JSON.parse(e.details ?? '');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

/** The table isn't in `database.ts` until the owner applies it and runs `db:types`; then these casts go, as `conversation-hide.ts`'s did. */
interface PinsClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => { order: (k: string) => Promise<{ data: Array<{ conversation_id: string }> | null; error: RpcError | null }> };
      is: (k: string, v: null) => { order: (k: string) => Promise<{ data: Array<{ conversation_id: string }> | null; error: RpcError | null }> };
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { pins?: string[] } | null; error: RpcError | null }>;
  realtime: { setAuth?: () => Promise<void> | void };
  channel: (topic: string, opts: { config: { private: boolean } }) => {
    on: (kind: 'broadcast', filter: { event: string }, cb: (m: { payload?: { team_id?: string | null } }) => void) => unknown;
    subscribe: (cb: (status: string) => void) => unknown;
  };
  removeChannel: (ch: unknown) => unknown;
}

/** `inboxReady`: the inbox has answered, so `convIds` is what it holds and not the empty list of a cold load. */
export function useConversationPins(viewer: string, team: string, convIds: readonly string[], enabled: boolean, inboxReady = true): ChPins {
  const device = usePinned(viewer, team, convIds, enabled);
  const toast = useToast();
  // null: device pins are showing (no table, or the probe hasn't answered in time).
  const [server, setServer] = useState<readonly string[] | null>(null);
  const [waiting, setWaiting] = useState(enabled);
  const client = useRef<PinsClient | null>(null);
  const queue = useRef<Map<string, boolean>>(new Map());
  const known = convIds.join('\u0000');
  // The import reads the inbox when it runs; an inbox change is never a reason to probe or subscribe again.
  const knownRef = useRef(known);
  knownRef.current = known;
  // Which viewer and team the shown server list is theirs, and which of them has had this visit's import.
  const probedFor = useRef<string | null>(null);
  const importedFor = useRef<string | null>(null);

  const read = useCallback(async (): Promise<readonly string[] | null> => {
    const db = client.current;
    if (!db) return null;
    const q = db.from('golf_conversation_pins').select('conversation_id');
    const { data, error } = await (team ? q.eq('team_id', team) : q.is('team_id', null)).order('position');
    if (error) {
      if (isMissing(error)) unavailableUntil = Date.now() + UNAVAILABLE_MS;
      return null;
    }
    return (data ?? []).map((r) => r.conversation_id);
  }, [team]);

  const send = useCallback(
    async (id: string, pin: boolean): Promise<{ list: readonly string[] | null; error: RpcError | null }> => {
      const db = client.current;
      if (!db) return { list: null, error: null };
      const { data, error } = await db.rpc('golf_pin_conversation', { p_conversation_id: id, p_pinned: pin });
      return { list: data?.pins ?? null, error };
    },
    [],
  );

  // One-time move of this device's pins to the account (D6): server list first, then this device's in order, until the cap; both refusals are
  // silent; the flag is set only after a clean end, so an interrupted import runs again and already-sent pins are skipped.
  const runImport = useCallback(
    async (start: readonly string[]) => {
      try {
        if (localStorage.getItem(importKey(viewer, team))) return;
      } catch {
        return;
      }
      const inbox = new Set(knownRef.current ? knownRef.current.split('\u0000') : []);
      let list = start;
      for (const id of readPinned(viewer, team)) {
        if (list.length >= PIN_LIMIT) break;
        if (list.includes(id) || !inbox.has(id)) continue;
        const { list: next, error } = await send(id, true);
        if (error) {
          if (error.message === 'pin_limit') break;
          if (error.message === 'not_a_member') continue;
          return;
        }
        if (next) {
          list = next;
          setServer(next);
        }
      }
      writePinned(viewer, team, []);
      try {
        localStorage.setItem(importKey(viewer, team), '1');
      } catch {
        // A refused write runs the import again next time; it skips what's already pinned.
      }
    },
    [send, team, viewer],
  );

  useEffect(() => {
    probedFor.current = null;
    setServer(null);
    if (!enabled || Date.now() < unavailableUntil) {
      setWaiting(false);
      return;
    }
    let live = true;
    setWaiting(true);
    const wait = window.setTimeout(() => live && setWaiting(false), PROBE_WAIT_MS);
    const db = createClient() as unknown as PinsClient;
    client.current = db;
    let channel: unknown = null;
    const refetch = () =>
      void read().then((list) => {
        if (live && list) setServer(list);
      });
    void read().then(async (list) => {
      if (!live) return;
      window.clearTimeout(wait);
      setWaiting(false);
      if (!list) return;
      probedFor.current = `${viewer}:${team}`;
      setServer(list);
      await Promise.resolve(db.realtime.setAuth?.()).catch(() => undefined);
      if (!live) return;
      const ch = db.channel(`golf-pins:${viewer}`, { config: { private: true } });
      channel = ch;
      ch.on('broadcast', { event: 'pins' }, (m) => {
        if ((m.payload?.team_id ?? '') === team) refetch();
      });
      let joined = false;
      ch.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // A reconnect heals whatever was missed while away.
        if (joined) refetch();
        joined = true;
      });
    });
    const flush = () => {
      const ops = [...queue.current];
      queue.current.clear();
      void (async () => {
        for (const [id, pin] of ops) await send(id, pin);
        refetch();
      })();
    };
    window.addEventListener('focus', refetch);
    window.addEventListener('online', flush);
    return () => {
      live = false;
      window.clearTimeout(wait);
      window.removeEventListener('focus', refetch);
      window.removeEventListener('online', flush);
      if (channel) db.removeChannel(channel);
    };
  }, [enabled, read, send, team, viewer]);

  // The import waits for both the server's list and the inbox, in either order, and runs once: on a cold load the inbox is still empty, and
  // reading it then would skip every device pin as "not in the inbox" and clear them.
  useEffect(() => {
    const key = `${viewer}:${team}`;
    if (!enabled || !inboxReady || server == null || probedFor.current !== key || importedFor.current === key) return;
    importedFor.current = key;
    void runImport(server);
  }, [enabled, inboxReady, runImport, server, team, viewer]);

  const toggle = useCallback(
    (id: string) => {
      if (server == null) return device.toggle(id);
      const pin = !server.includes(id);
      const before = server;
      const next = withPin(before, id, pin);
      if (next === before) return;
      setServer(next);
      // Offline: one op per conversation, the last tap wins, sent in order on reconnect; lost on reload, where the server's list rules.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        queue.current.delete(id);
        queue.current.set(id, pin);
        return;
      }
      void send(id, pin).then(({ list, error }) => {
        if (error) {
          // The two lines are PIN-SYNC section 5's, word for word; any other failure reverts with no toast (MSG-PIN-05).
          if (error.message === 'pin_limit') {
            setServer(detailList(error) ?? before);
            toast({ title: 'You already have 3 pinned.' });
          } else if (error.message === 'not_a_member') {
            setServer((cur) => (cur ?? before).filter((x) => x !== id));
            toast({ title: 'You’re not in this conversation anymore.' });
          } else setServer(before);
          return;
        }
        if (list) setServer(list);
      });
    },
    [device, send, server, toast],
  );

  return useMemo(() => {
    if (server == null) {
      // The Pinned card waits for the probe up to 1500ms, then shows device pins.
      if (waiting) return { ids: [], has: () => false, atLimit: false, toggle };
      return { ...device, toggle };
    }
    const inbox = new Set(known ? known.split('\u0000') : []);
    const ids = server.filter((id) => inbox.has(id));
    return { ids, has: (id: string) => ids.includes(id), atLimit: server.length >= PIN_LIMIT, toggle };
  }, [device, known, server, toggle, waiting]);
}
