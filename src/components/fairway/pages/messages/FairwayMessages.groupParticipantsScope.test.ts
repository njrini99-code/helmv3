/**
 * ============================================================================
 * FairwayMessages.tsx — group participants refetch scoped to the selection
 * ----------------------------------------------------------------------------
 * Row 13 of the Fairway perf audit: the group-participants effect depended on
 * the WHOLE `conversations` array, so any inbox change anywhere — an unread
 * count ticking on a totally different thread, a new message arriving in a
 * conversation the reader isn't even looking at — refetched
 * golf_conversation_participants + golf_messages senders + golf_coaches +
 * golf_players for whichever conversation happened to be open, every time.
 *
 * The fix derives a primitive boolean (`selectedConversationIsGroup`, reading
 * only what `isGroupConversation` actually needs off the selected
 * conversation) and depends on THAT instead of the array reference, so the
 * effect only re-runs when the selection changes or that conversation's own
 * kind changes.
 *
 * Source-string matching, not a render test — same rationale as the sibling
 * FairwayMessages.composerScope.test.ts: mounting this component needs a
 * large hook/context/Supabase mock surface for no additional signal over
 * pinning the dependency array and the derivation directly.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/components/fairway/pages/messages/FairwayMessages.tsx';
const source = readFileSync(join(process.cwd(), SRC), 'utf-8');

/** The group-participants effect, from its `useEffect(` to the matching `}, [...]);`. */
function groupParticipantsEffect(): string {
  const anchor = source.indexOf('Invalidate in-flight results when the selected conversation changes');
  expect(anchor, 'expected the group-participants effect comment').toBeGreaterThan(-1);
  const start = source.indexOf('React.useEffect(', anchor);
  expect(start).toBeGreaterThan(anchor);
  const end = source.indexOf('\n  }, [', start);
  const depsEnd = source.indexOf(');', end);
  expect(end).toBeGreaterThan(start);
  expect(depsEnd).toBeGreaterThan(end);
  return source.slice(start, depsEnd + 2);
}

describe('FairwayMessages — group participants effect scope (Row 13)', () => {
  it('derives a primitive "is the selection a group" scalar from conversations', () => {
    expect(source).toMatch(
      /const selectedConversationIsGroup = isGroupConversation\(\s*conversations\.find/,
    );
  });

  it('does not depend on the whole conversations array', () => {
    const effect = groupParticipantsEffect();
    const deps = effect.match(/\}, \[([^\]]*)\]\);/)?.[1] ?? '';
    expect(deps, 'dependency array').not.toMatch(/\bconversations\b/);
  });

  it('depends on the selected conversation id and its derived group-ness', () => {
    const effect = groupParticipantsEffect();
    const deps = effect.match(/\}, \[([^\]]*)\]\);/)?.[1] ?? '';
    expect(deps).toMatch(/\bselectedConversationId\b/);
    expect(deps).toMatch(/\bselectedConversationIsGroup\b/);
  });

  it('still gates the fetch on the derived scalar, not a fresh lookup', () => {
    const effect = groupParticipantsEffect();
    expect(effect).toMatch(/if \(selectedConversationIsGroup\)/);
  });
});
