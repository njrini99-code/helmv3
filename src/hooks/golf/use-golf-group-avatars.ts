'use client';

/**
 * Real member faces for the conversation list's GROUP rows.
 *
 * The inbox already had every participant's photo available — it just never
 * asked for it. `FairwayMessages.fetchGroupParticipants` resolves exactly this
 * data, but only for the ONE conversation you have open, so the list fell back
 * to initials for every group. This is that same resolution, batched across the
 * whole inbox.
 *
 * One membership query plus an authorized batch identity lookup, never one
 * identity query per row. A per-conversation fetch would be an N+1 on the
 * first screen a coach sees every morning.
 *
 * Fails soft and SILENT-EMPTY: on any error this returns an empty map and the
 * rows keep their initials. A missing face is a cosmetic downgrade; a thrown
 * error would take the inbox with it.
 */

import * as React from 'react';
import { getGolfMessageParticipantIdentities } from '@/app/golf/actions/messages';
import { createClient } from '@/lib/supabase/client';

export interface GroupMember {
  name: string;
  avatar: string | null;
}

/** conversation_id -> members, capped at what the UI can actually show. */
export type GroupAvatarMap = ReadonlyMap<string, GroupMember[]>;

const EMPTY: GroupAvatarMap = new Map();

/**
 * TWO faces, and the number is geometry rather than taste.
 *
 * A group row has to occupy the SAME 48px avatar column as a DM row, or the
 * text beside it starts at a different x for half the list. Two 32px avatars
 * overlapped by 16px is exactly 48. Three plus AvatarGroup's "+N" chip is
 * ~130px, which is what the first version rendered — the stack hung out of the
 * row and over the screen edge.
 *
 * Nothing is lost by not showing a count here: the row already names the
 * conversation, and the details sheet lists every member.
 */
const MAX_FACES = 2;

/** PostgREST caps a response at 1000 rows regardless of `.limit()`. */
const PAGE = 1000;

export function useGolfGroupAvatars(groupConversationIds: string[]): GroupAvatarMap {
  const [map, setMap] = React.useState<GroupAvatarMap>(EMPTY);

  // Stable key: the id array is a fresh reference every render, so depending on
  // it directly would refetch on every keystroke in the inbox search field.
  const idKey = React.useMemo(
    () => [...groupConversationIds].sort().join(','),
    [groupConversationIds],
  );

  React.useEffect(() => {
    if (!idKey) {
      setMap(EMPTY);
      return;
    }
    let cancelled = false;

    void (async () => {
      const ids = idKey.split(',');
      const supabase = createClient();

      // The server action proves membership before resolving the small
      // display-only identity set. It is also where legacy records receive
      // their existing image from the avatars bucket when avatar_url is null.
      const identities = await getGolfMessageParticipantIdentities(ids);
      if (!identities.length) return;
      const identity = new Map(identities.map((member) => [member.userId, {
        name: member.name,
        avatar: member.avatarUrl,
      }]));

      // Retrieve membership only to retain the compact two-face group geometry.
      // This stays paginated because PostgREST silently caps large result sets.
      const rows: { conversation_id: string; user_id: string }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('golf_conversation_participants')
          .select('conversation_id, user_id')
          .in('conversation_id', ids)
          .range(from, from + PAGE - 1);
        if (error || !data) return;
        rows.push(...data);
        if (data.length < PAGE) break;
      }
      if (!rows.length) return;

      // 3. Group by conversation. Members WITH a photo sort first, because the
      //    stack shows only the first few and a real face beats initials in a
      //    slot that can only hold one of them.
      const byConversation = new Map<string, GroupMember[]>();
      for (const row of rows) {
        const member = identity.get(row.user_id);
        if (!member) continue;
        const list = byConversation.get(row.conversation_id);
        if (list) list.push(member);
        else byConversation.set(row.conversation_id, [member]);
      }
      for (const [id, members] of byConversation) {
        members.sort((a, b) => Number(Boolean(b.avatar)) - Number(Boolean(a.avatar)));
        byConversation.set(id, members.slice(0, MAX_FACES));
      }

      if (!cancelled) setMap(byConversation);
    })();

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return map;
}
