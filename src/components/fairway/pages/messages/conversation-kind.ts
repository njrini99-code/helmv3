/**
 * ============================================================================
 * Is this conversation actually a GROUP?
 * ----------------------------------------------------------------------------
 * `is_group` cannot answer that, and every surface that asked it got the wrong
 * answer for two-person threads.
 *
 * The flag is set for anything carrying `is_team_chat`, and a broadcast sent to
 * ONE player carries it too — it is load-bearing for the conversation-create
 * RLS workaround, so it cannot simply be dropped at the source. The result is
 * that a plain two-person thread reports itself as a group.
 *
 * `MessageThreadPane`'s header already worked around this locally by reading
 * `participant_count`, which is why it correctly says "Direct message". But it
 * was the only consumer that did. Everything else — the conversation row's
 * avatar, the thread header's avatar, whether a bubble shows a sender name —
 * still asked `is_group` and rendered a group glyph for a DM with one other
 * person in it.
 *
 * One derivation, used everywhere:
 *
 *   • participant_count is the truth when we have it. More than two people is a
 *     group; exactly two is a direct message, whatever the flag says.
 *   • when the count is unknown (0/null — the rail's RPC does not always carry
 *     it) fall back to `is_group`, because a wrong-but-plausible glyph beats no
 *     glyph, and that is the only case where the old behaviour survives.
 * ========================================================================== */

export interface ConversationKindInput {
  is_group?: boolean | null;
  participant_count?: number | null;
}

/** True when the conversation genuinely has more than two people in it. */
export function isGroupConversation(conv: ConversationKindInput | null | undefined): boolean {
  if (!conv) return false;
  const count = conv.participant_count ?? 0;
  if (count > 0) return count > 2;
  return Boolean(conv.is_group);
}
