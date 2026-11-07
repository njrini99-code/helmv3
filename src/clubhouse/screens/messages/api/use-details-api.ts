import type { ChMessagesApi } from './types';
import type { MessagesApiCtx } from './ctx';
import { tallyPoll, encodeChoice } from '@/lib/golf/message-polls';
import { haptic } from '../../../lib/haptics';
import { sendGolfPoll, closeGolfPoll } from '@/app/golf/actions/message-polls';
import { leaveGolfGroup, addGolfGroupMember, removeGolfGroupMember } from '@/app/golf/actions/messages';
import { hideGolfConversation } from '@/app/golf/actions/conversation-hide';
import { firstName, directWith } from '../model';

/**
 * Package D: polls, members and group admin, attachments and files, New message, mute of the open thread.
 * Part of the `ChMessagesApi` literal that Messages.tsx composes. Add keys here and nowhere else (docs/clubhouse/messages-v2/SEAMS.md).
 */
export function useDetailsApi(ctx: MessagesApiCtx): Pick<ChMessagesApi, 'attachments' | 'polls' | 'members' | 'membersError' | 'retryMembers' | 'leave' | 'deleteConversation' | 'addCandidates' | 'addMember' | 'removeMember' | 'files' | 'directory' | 'directoryError' | 'retryDirectory' | 'startDirect' | 'createGroup' | 'prefill' | 'clearPrefill' | 'mute' | 'muteError' | 'retryMute' | 'setMute'> {
  const { data, addCandidates, attempt, badges, canHide, convs, createGroup, landDraft, loadAttachments, loadFiles, mark, members, membersError, msgs, mute, muteConversation, muteError, pendingDraft, prefill, quietMembers, refetch, responses, router, selected, selectedId, setMembers, setMembersAttempt, setMuteAttempt, setPrefill, setSelectedId, setStarted, startDirect, toast } = ctx;
  return {
      attachments: loadAttachments,
      polls: {
        tally: (messageId, poll) => (responses.ready ? tallyPoll(poll, responses.rows, messageId, data.viewerUserId) : null),
        vote: (messageId, poll, optionIds) => {
          // A tap while this poll's vote is saving is not dropped: the hook writes the latest one when the first lands.
          const choice = optionIds.length ? encodeChoice(poll, optionIds) : null;
          if (optionIds.length && !choice) return;
          void attempt('vote', { failed: 'Your vote wasn’t saved', hint: 'Try again in a moment.', code: 'CH-7029' }, async () => {
            const res = await responses.vote(messageId, choice);
            if (res.ok) return;
            if (res.reason === 'closed' || res.reason === 'deleted') {
              // CH-7030: the poll ended (or its sender deleted it) between the tap and the write; the vote is put back.
              // A former member's 42501 is `member`, which throws below to the CH-7029 toast.
              haptic('error');
              toast({ tone: 'error', title: 'Voting has ended', body: res.reason === 'deleted' ? 'This poll was deleted.' : 'Your vote wasn’t counted. The result is final.', code: 'CH-7030' });
              return false;
            }
            throw new Error(res.reason === 'session' ? 'Sign in again to vote' : 'Vote was not saved');
          });
        },
        pending: responses.pending,
        error: responses.error,
        retry: () => void responses.refresh(),
        send: async (conversationId, draft, clientId, priorClientId) => {
          let reason = 'Try again in a moment.';
          let answered = false;
          let earlierCopy = false;
          const ok = await attempt('sendPoll', { failed: 'Couldn’t send the poll', hint: 'Try again in a moment.', code: 'CH-7028' }, async () => {
            const res = await sendGolfPoll(conversationId, draft, clientId, priorClientId);
            answered = true;
            if (!res.success) {
              reason = res.error;
              earlierCopy = res.earlierCopy === true;
              return false;
            }
            // D27: the saved row lands the card at once (deduped by id against the realtime insert that follows); a
            // background refetch still covers a channel that is reconnecting.
            if (res.row && conversationId === selectedId) msgs.insertConfirmed(res.row as Parameters<typeof msgs.insertConfirmed>[0]);
            void msgs.refetch();
            void refetch();
            return true;
          });
          // No answer at all (it threw, or offline): the sheet keeps the id so an edited retry can ask about it (D19).
          if (ok) return { ok: true };
          if (earlierCopy) return { ok: false, error: reason, earlierCopy: true };
          return answered ? { ok: false, error: reason } : { ok: false, error: reason, threw: true };
        },
        close: (messageId) =>
          attempt('closePoll', { failed: 'Couldn’t close the poll', hint: 'Try again in a moment.', code: 'CH-7027' }, async () => {
            const res = await closeGolfPoll(messageId);
            if (!res.success) throw new Error(res.error);
            void msgs.refetch();
          }),
      },
      members,
      membersError,
      retryMembers: () => setMembersAttempt((n) => n + 1),
      leave: async () => {
        if (!selectedId) return false;
        return attempt('leave', { failed: "Couldn’t leave the group", hint: 'Try again in a moment.', code: 'CH-7010' }, async () => {
          const res = await leaveGolfGroup(selectedId);
          if ('error' in res) throw new Error(res.error);
          haptic('success');
          toast({ title: 'You left the group' });
          // A thread started here stays pinned to the list until it loads; it must not outlive leaving it.
          setStarted((s) => (s?.id === selectedId ? null : s));
          setSelectedId(null);
          await refetch();
        });
      },
      // By id: the open conversation's details and any row's menu or swipe (owner decision 14).
      deleteConversation: canHide
        ? async (id) =>
            attempt('deleteConversation', { failed: "Couldn’t delete the conversation", hint: 'Try again in a moment.', code: 'CH-7025' }, async () => {
              const res = await hideGolfConversation(id);
              if (!res.success) throw new Error(res.error);
              haptic('success');
              toast({ title: 'Conversation deleted' });
              setStarted((s) => (s?.id === id ? null : s));
              mark(id, false);
              if (id === selectedId) setSelectedId(null);
              await refetch();
              void badges.refetch();
            })
        : null,
      addCandidates,
      addMember: (userId, name) =>
        attempt('addMember', { failed: `Couldn’t add ${firstName(name)}`, hint: 'Try again in a moment.', code: 'CH-7018' }, async () => {
          if (!selectedId) throw new Error('No conversation open');
          const res = await addGolfGroupMember(selectedId, userId);
          if ('error' in res) throw new Error(res.error);
          haptic('success');
          toast({ title: `Added ${firstName(name)} to ${selected?.title ?? 'the group'}` });
          setMembersAttempt((n) => n + 1);
          await refetch();
        }),
      removeMember: async (userId, name) => {
        if (!selectedId) return false;
        // The row leaves at once; a refusal puts the list back as it was (removeGolfGroupMember: the creator only, never
        // their own row, a team group only).
        const before = members;
        setMembers((list) => list?.filter((m) => m.userId !== userId) ?? list);
        const ok = await attempt('removeMember', { failed: `Couldn’t remove ${firstName(name)}`, hint: 'They’re still in the group. Try again in a moment.', code: 'CH-7024' }, async () => {
          const res = await removeGolfGroupMember(selectedId, userId);
          if ('error' in res) throw new Error(res.error);
          haptic('success');
          toast({ title: `Removed ${firstName(name)} from ${selected?.title ?? 'the group'}` });
          // As Fairway does after a removal: the list and the group's members are read again.
          quietMembers.current = true;
          setMembersAttempt((n) => n + 1);
          await refetch();
        });
        if (!ok) setMembers(before);
        return ok;
      },
      files: loadFiles,
      directory: data.directory,
      directoryError: data.directoryError,
      retryDirectory: () => router.refresh(),
      startDirect: async (userId) => {
        const existing = directWith(convs, userId);
        if (existing) landDraft(existing.id);
        return startDirect(userId);
      },
      createGroup,
      prefill,
      clearPrefill: () => {
        pendingDraft.current = null;
        setPrefill(null);
      },
      mute,
      muteError,
      retryMute: () => setMuteAttempt((n) => n + 1),
      setMute: async (muted, hours) => (selectedId ? muteConversation(selectedId, muted, hours) : false)
  };
}
