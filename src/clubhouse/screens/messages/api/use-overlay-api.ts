'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChMessagesApi } from './types';
import type { MessagesApiCtx } from './ctx';
import type { ChReaction, ChReactionKey } from '../model';
import { haptic } from '../../../lib/haptics';
import { CH_DUR } from '../../../lib/motion';
import { MESSAGE_REACTIONS } from '@/hooks/golf/use-message-reactions';
import { msAnimate } from '../motion/messages-motion';
import { REACTIONS } from '../overlays/reactions';

export const EMOJI_BY_KEY = Object.fromEntries(MESSAGE_REACTIONS.map((r) => [r.label, r.emoji])) as Record<ChReactionKey, string>;
export const KEY_BY_EMOJI = Object.fromEntries(MESSAGE_REACTIONS.map((r) => [r.emoji, r.label])) as Record<string, ChReactionKey>;

/** A tap that has not come back from the server yet: `${messageId}|${key}` to whether the viewer now has that reaction. */
export type ReactionOverrides = ReadonlyMap<string, boolean>;

const RX_ORDER = new Map(REACTIONS.map((r, i) => [r.key, i]));

/**
 * MSG-406: the badges of every message in the order the picker draws them (Like, Love, Laugh, Celebrate, Surprised, Thanks), not by
 * emoji code point, with the viewer's pending taps laid over what the server last said, so a tap shows at once (MOT-RX-1) and the
 * pop does not wait two round trips. A tap the server already agrees with changes nothing.
 */
export function layerReactions(base: ReadonlyMap<string, ChReaction[]>, overrides: ReactionOverrides, viewerId: string): Map<string, ChReaction[]> {
  const out = new Map<string, ChReaction[]>();
  const ids = new Set(base.keys());
  for (const k of overrides.keys()) ids.add(k.split('|')[0]!);
  for (const id of ids) {
    const byKey = new Map<ChReactionKey, ChReaction>((base.get(id) ?? []).map((r) => [r.key, { ...r }]));
    for (const [k, want] of overrides) {
      const [mid, key] = k.split('|') as [string, ChReactionKey];
      if (mid !== id) continue;
      const cur = byKey.get(key);
      if (want && !cur?.mine) byKey.set(key, { key, count: (cur?.count ?? 0) + 1, mine: true, userIds: [...(cur?.userIds ?? []), viewerId] });
      else if (!want && cur?.mine) {
        if (cur.count <= 1) byKey.delete(key);
        else byKey.set(key, { ...cur, count: cur.count - 1, mine: false, userIds: (cur.userIds ?? []).filter((u) => u !== viewerId) });
      }
    }
    const list = [...byKey.values()].sort((a, b) => (RX_ORDER.get(a.key) ?? 99) - (RX_ORDER.get(b.key) ?? 99));
    if (list.length) out.set(id, list);
  }
  return out;
}

/** MOT-X-10: the deleted row fades `opacity 1 > 0, scale .92` over 180 ms (held at the end) before the list closes the gap. */
export function fadeRowOut(messageId: string, reduced = false): Animation | null {
  const row = typeof document === 'undefined' ? null : document.getElementById(`ch-ms-message-${messageId}`);
  if (!row) return null;
  return msAnimate(row, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92)' }], null, { fill: 'forwards', reduced, timing: { ms: CH_DUR.quick * 1000, easing: 'linear' } });
}

/**
 * Package C: reactions, edit and delete of a message, read receipts (Seen by).
 * Part of the `ChMessagesApi` literal that Messages.tsx composes. Add keys here and nowhere else (docs/clubhouse/messages-v2/SEAMS.md).
 */
export function useOverlayApi(ctx: MessagesApiCtx): Pick<ChMessagesApi, 'edit' | 'remove' | 'reactions' | 'react' | 'receipts'> {
  const { attempt, msgs, reactionMap, reactions, refetch, toast, data } = ctx;
  const [overrides, setOverrides] = useState<ReactionOverrides>(new Map());
  // One write at a time, in tap order: the hook saves a single reaction at a time, and a queue keeps every tap (none is dropped).
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const base = useRef(reactionMap);
  base.current = reactionMap;
  const layered = useMemo(() => layerReactions(reactionMap, overrides, data.viewerUserId), [reactionMap, overrides, data.viewerUserId]);
  // An override the server now agrees with is done.
  useEffect(() => {
    if (!overrides.size) return;
    let changed = false;
    const next = new Map(overrides);
    for (const [k, want] of overrides) {
      const [mid, key] = k.split('|') as [string, ChReactionKey];
      const mine = (reactionMap.get(mid) ?? []).some((r) => r.key === key && r.mine);
      if (mine === want) {
        next.delete(k);
        changed = true;
      }
    }
    if (changed) setOverrides(next);
  }, [reactionMap, overrides]);
  return {
      edit: (id, text) =>
        attempt('edit', { failed: "Couldn’t edit the message", hint: 'Your edit is still in the box. Try again.', code: 'CH-7007' }, async () => {
          await msgs.editMessage(id, text);
          haptic('success');
          toast({ title: 'Message edited' });
          // The rail's preview may be this message.
          void refetch().catch(() => undefined);
        }),
      remove: async (id) => {
        // MOT-X-10: the row fades while the delete is on its way; a refusal brings it back.
        const fading = fadeRowOut(id);
        const ok = await attempt('remove', { failed: "Couldn’t delete the message", hint: 'It’s back in the thread. Try again in a moment.', code: 'CH-7008' }, async () => {
          await msgs.removeMessage(id);
          haptic('success');
          toast({ title: 'Deleted for everyone' });
          void refetch().catch(() => undefined);
        });
        if (!ok) {
          fading?.cancel();
          void msgs.refetch();
        }
        return ok;
      },
      reactions: layered,
      react: (messageId, key, active) => {
        const emoji = EMOJI_BY_KEY[key];
        if (!emoji) return;
        const tag = `${messageId}|${key}`;
        setOverrides((o) => new Map(o).set(tag, active));
        const undo = () => setOverrides((o) => {
          const n = new Map(o);
          n.delete(tag);
          return n;
        });
        chain.current = chain.current.then(
          () =>
            attempt('react', { failed: "Couldn’t save the reaction", hint: 'Try again in a moment.', code: 'CH-7009' }, async () => {
              // setReaction answers false (session gone, write refused) and never throws: that is a failure too.
              if ((await reactions.setReaction(messageId, emoji, active)) === false) throw new Error('Reaction was not saved');
            }).then((ok) => {
              if (!ok) undo();
            }),
        );
      },
      // P-1 Seen by: the open conversation's read map, from the thread's hook.
      receipts: msgs.readMarks ? { status: msgs.readMarks.status, marks: msgs.readMarks.byUser, retry: () => void msgs.refetchReadMarks?.() } : undefined
  };
}
