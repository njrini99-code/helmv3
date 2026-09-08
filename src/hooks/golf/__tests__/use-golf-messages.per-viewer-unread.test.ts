/**
 * G-40 — a group's unread badge belongs to the viewer, not to the thread.
 *
 * `get_golf_conversations_with_details` computes `unread_count` as
 * `COUNT(*) WHERE read = FALSE AND sender_id <> me` — running on
 * `golf_messages.read`, ONE boolean shared by every participant.
 * `mark_golf_messages_read` flips that boolean on every message the opener did
 * not send, so in a 3+ person team chat one member opening the thread cleared
 * the badge for everyone, including members who never saw those messages
 * (§17.2, M-T06 FAIL).
 *
 * A correct per-viewer computation already existed in the hook — but only on
 * the supplemental path, reached for team chats the RPC MISSED. The normal
 * path was the broken one. The fix runs the same computation over every group
 * conversation the RPC returns.
 *
 * The two decisions that make it correct are pure and are exercised directly
 * below: WHICH conversations get recomputed, and what happens to a
 * conversation whose recompute did not produce a number. The queries in
 * between are mechanical, and reaching them behaviourally would need a full
 * supabase + auth + realtime harness — the same reasoning the sibling
 * send-integrity suite states.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPerViewerUnread,
  perViewerUnreadTargets,
  resolveConversationParticipant,
  type GolfConversationRpcRow,
} from '@/hooks/golf/use-golf-messages';

function row(over: Partial<GolfConversationRpcRow> & { id: string }): GolfConversationRpcRow {
  return {
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    creator_id: null,
    last_message_content: null,
    last_message_at: null,
    last_message_sender_id: null,
    unread_count: 0,
    participant_ids: [],
    participant_names: [],
    ...over,
  };
}

describe('perViewerUnreadTargets — which badges are not the viewer\'s own', () => {
  it('selects group conversations, which is where the shared boolean is wrong', () => {
    const rows = [row({ id: 'team-1', is_group: true }), row({ id: 'team-2', is_group: true })];
    expect(perViewerUnreadTargets(rows, new Set())).toEqual(['team-1', 'team-2']);
  });

  it('leaves DMs alone — with two people the shared boolean IS per-viewer', () => {
    // And it is what DM read receipts are built on, so recomputing there would
    // change a working behaviour for no gain.
    const rows = [row({ id: 'dm-1', is_group: false }), row({ id: 'dm-2' })];
    expect(perViewerUnreadTargets(rows, new Set())).toEqual([]);
  });

  it('skips conversations the supplemental path already counted per viewer', () => {
    const rows = [row({ id: 'team-1', is_group: true }), row({ id: 'team-2', is_group: true })];
    expect(perViewerUnreadTargets(rows, new Set(['team-1']))).toEqual(['team-2']);
  });

  it('handles a null row set without throwing', () => {
    expect(perViewerUnreadTargets(null, new Set())).toEqual([]);
  });

  it('does not treat an absent is_group as a group', () => {
    // `is_group` is optional on the row; only an explicit true qualifies, so a
    // shape that lost the column cannot quietly pull every DM into the recount.
    expect(perViewerUnreadTargets([row({ id: 'c1' })], new Set())).toEqual([]);
  });
});

describe('applyPerViewerUnread — the recomputed number replaces the shared one', () => {
  it('overwrites the RPC count for a conversation that was recomputed', () => {
    const rows = [row({ id: 'team-1', is_group: true, unread_count: 0 })];
    const applied = applyPerViewerUnread(rows, new Map([['team-1', 4]]));
    expect(applied[0]?.unread_count).toBe(4);
  });

  it('writes a genuine zero, not just a non-zero correction', () => {
    // The badge must be able to clear as well as appear.
    const rows = [row({ id: 'team-1', is_group: true, unread_count: 9 })];
    expect(applyPerViewerUnread(rows, new Map([['team-1', 0]]))[0]?.unread_count).toBe(0);
  });

  it('KEEPS the previous number when the recompute produced nothing for that row', () => {
    // The important half. A failed count must degrade to the shared-boolean
    // number, never to 0 — a silent 0 reads as "you are caught up".
    const rows = [row({ id: 'team-1', is_group: true, unread_count: 3 })];
    expect(applyPerViewerUnread(rows, new Map())[0]?.unread_count).toBe(3);
  });

  it('leaves every other field of the row untouched', () => {
    const rows = [row({ id: 'team-1', is_group: true, title: 'Varsity', unread_count: 1, participant_count: 12 })];
    const applied = applyPerViewerUnread(rows, new Map([['team-1', 7]]));
    expect(applied[0]).toEqual({ ...rows[0], unread_count: 7 });
  });

  it('does not mutate the rows it was given', () => {
    const rows = [row({ id: 'team-1', is_group: true, unread_count: 1 })];
    applyPerViewerUnread(rows, new Map([['team-1', 5]]));
    expect(rows[0]?.unread_count).toBe(1);
  });

  it('handles a null row set without throwing', () => {
    expect(applyPerViewerUnread(null, new Map([['x', 1]]))).toEqual([]);
  });
});

describe('resolveConversationParticipant — the DM counterpart lookup', () => {
  it('resolves the other member for a flagged two-person broadcast', () => {
    const participant = resolveConversationParticipant(
      'player-2',
      new Map(),
      new Map([
        ['player-2', {
          id: 'profile-2',
          user_id: 'player-2',
          first_name: 'Jordan',
          last_name: 'Lee',
          graduation_year: 2028,
          avatar_url: null,
        }],
      ]),
    );

    expect(participant).toMatchObject({
      id: 'player-2',
      name: 'Jordan Lee',
      type: 'player',
    });
  });

  it('uses an honest generic member when no profile row is available', () => {
    expect(resolveConversationParticipant('missing-user', new Map(), new Map())).toEqual({
      id: 'missing-user',
      name: 'Conversation member',
      subtitle: '',
      avatar: null,
      type: 'member',
    });
  });
});

/** Comment-stripped, so a fix's own docstring cannot satisfy a source assertion. */
const source = readFileSync(join(process.cwd(), 'src/hooks/golf/use-golf-messages.ts'), 'utf-8');
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

/**
 * The wiring, asserted on the source. What distinguishes fixed from broken is
 * whether the recompute runs on the NORMAL path at all.
 */
describe('the recompute is wired into the normal conversations fetch', () => {
  it('calls both helpers inside fetchConversations', () => {
    expect(code).toContain('perViewerUnreadTargets(conversationsData, perViewerUnreadIds)');
    expect(code).toContain('conversationsData = applyPerViewerUnread(conversationsData, perViewerCounts)');
  });

  it('counts with head-only exact count, so the 1000-row cap cannot under-count', () => {
    const idx = code.indexOf("action: 'count-per-viewer-unread'");
    expect(idx).toBeGreaterThan(-1);
    const preceding = code.slice(Math.max(0, idx - 900), idx);
    expect(preceding).toContain("{ count: 'exact', head: true }");
    expect(preceding).toContain("neq('sender_id', userId)");
    expect(preceding).toContain("eq('is_deleted', false)");
  });

  it('chunks the id list, because PostgREST filters travel in the URL', () => {
    expect(code).toContain('const ID_CHUNK = 200;');
  });

  it('registers the supplemental path\'s conversations so they are not counted twice', () => {
    expect(code).toContain('perViewerUnreadIds.add(conv.id)');
  });
});

/**
 * The badge now clears on a signal it did not previously depend on.
 *
 * Before G-40 a group badge fell because `mark_golf_messages_read` flipped
 * `golf_messages.read` and the RPC's own count dropped. Now the number is
 * derived from the viewer's `last_read_at`, so what clears it is the
 * participant-row UPDATE that `markMessagesAsRead` performs — and only if
 * `useGolfConversations` actually refetches on the viewer's OWN row.
 *
 * That is easy to break by copying the receipts subscription in
 * `useGolfMessages`, which deliberately ignores the current user
 * (`updated.user_id !== currentUserIdRef.current`). Excluding the viewer here
 * would leave a stale badge shipped as the fix for a wrong one.
 */
describe('the viewer\'s own read write is what clears the recomputed badge (G-40)', () => {
  /**
   * Anchored on the rail's OWN channel — `golf_conversation_participants`
   * appears earlier in the file, in the read-receipts subscription, and a
   * whole-file search finds that one instead.
   */
  const railChannel = code.slice(code.indexOf('.channel(`golf-conversations:${userId}`)'));

  it('subscribes the conversation rail to the viewer\'s own participant row', () => {
    expect(railChannel).not.toBe('');
    const idx = railChannel.indexOf("table: 'golf_conversation_participants',");
    expect(idx).toBeGreaterThan(-1);
    const block = railChannel.slice(idx, idx + 200);
    // Own row, all events — an INSERT-only or other-users filter would not fire.
    expect(block).toContain('filter: `user_id=eq.${userId}`');
    expect(railChannel.slice(Math.max(0, idx - 200), idx)).toContain("event: '*'");
  });

  it('does not exclude the current user from that subscription', () => {
    const idx = railChannel.indexOf('filter: `user_id=eq.${userId}`');
    expect(railChannel.slice(idx, idx + 300)).not.toContain('currentUserIdRef');
  });

  it('marks read through the action that writes last_read_at, not only the read flag', () => {
    expect(code).toContain('await markGolfMessagesAsRead(conversationId);');
  });
});
