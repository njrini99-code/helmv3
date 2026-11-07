import type { ChMessagesApi } from './types';
import type { MessagesApiCtx } from './ctx';
import type { ChReactionKey } from '../model';
import { haptic } from '../../../lib/haptics';
import { MESSAGE_REACTIONS } from '@/hooks/golf/use-message-reactions';

export const EMOJI_BY_KEY = Object.fromEntries(MESSAGE_REACTIONS.map((r) => [r.label, r.emoji])) as Record<ChReactionKey, string>;
export const KEY_BY_EMOJI = Object.fromEntries(MESSAGE_REACTIONS.map((r) => [r.emoji, r.label])) as Record<string, ChReactionKey>;

/**
 * Package C: reactions, edit and delete of a message, read receipts (Seen by).
 * Part of the `ChMessagesApi` literal that Messages.tsx composes. Add keys here and nowhere else (docs/clubhouse/messages-v2/SEAMS.md).
 */
export function useOverlayApi(ctx: MessagesApiCtx): Pick<ChMessagesApi, 'edit' | 'remove' | 'reactions' | 'react' | 'receipts'> {
  const { attempt, msgs, reactionMap, reactions, refetch, toast } = ctx;
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
        const ok = await attempt('remove', { failed: "Couldn’t delete the message", hint: 'It’s back in the thread. Try again in a moment.', code: 'CH-7008' }, async () => {
          await msgs.removeMessage(id);
          haptic('success');
          toast({ title: 'Message deleted' });
          void refetch().catch(() => undefined);
        });
        if (!ok) void msgs.refetch();
        return ok;
      },
      reactions: reactionMap,
      react: (messageId, key, active) => {
        const emoji = EMOJI_BY_KEY[key];
        // The hook takes one reaction at a time; a tap while one is saving is dropped, not reported as a failure.
        if (!emoji || reactions.pending) return;
        void attempt('react', { failed: "Couldn’t save the reaction", hint: 'Try again in a moment.', code: 'CH-7009' }, async () => {
          // setReaction answers false (session gone, write refused) and never throws: that is a failure too.
          if ((await reactions.setReaction(messageId, emoji, active)) === false) throw new Error('Reaction was not saved');
        });
      },
      // P-1 Seen by: the open conversation's read map, from the thread's hook.
      receipts: msgs.readMarks ? { status: msgs.readMarks.status, marks: msgs.readMarks.byUser, retry: () => void msgs.refetchReadMarks?.() } : undefined
  };
}
