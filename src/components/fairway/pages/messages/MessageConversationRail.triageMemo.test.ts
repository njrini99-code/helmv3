/**
 * ============================================================================
 * MessageConversationRail.tsx — the triage split is memoized (Row 14)
 * ----------------------------------------------------------------------------
 * Row 14 of the Fairway perf audit: the unread-first / Today-Earlier triage
 * split ran as plain `const`s on every render — including every keystroke in
 * the search box, which re-renders this component via `searchQuery` state but
 * has NOTHING to do with the triage list (the search-results view replaces it
 * entirely while `isSearching` is true).
 *
 * The fix wraps the split in a `useMemo` keyed on exactly what it reads:
 * `conversations`, `filter`, and `now` (the minute clock) — not `searchQuery`.
 *
 * Source-string matching, not a render test — same rationale as the sibling
 * FairwayMessages.composerScope.test.ts / groupParticipantsScope.test.ts: the
 * split's internals (`groupConversationsByTime`) are module-private, so the
 * only reliable outside signal that recomputation is actually being skipped
 * is the memo's own dependency array, and pinning it directly is more honest
 * than a behavioral proxy that could pass for the wrong reason.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/components/fairway/pages/messages/MessageConversationRail.tsx';
const source = readFileSync(join(process.cwd(), SRC), 'utf-8');

/** The triage `useMemo` block, from `const triage = React.useMemo(` to its closing `);`. */
function triageMemo(): string {
  const start = source.indexOf('const triage = React.useMemo(');
  expect(start, 'expected a `const triage = React.useMemo(...)` block').toBeGreaterThan(-1);
  const end = source.indexOf('\n  }, [', start);
  const depsEnd = source.indexOf(');', end);
  expect(end).toBeGreaterThan(start);
  expect(depsEnd).toBeGreaterThan(end);
  return source.slice(start, depsEnd + 2);
}

describe('MessageConversationRail — triage split memoization (Row 14)', () => {
  it('wraps the unread/grouped split in useMemo, not plain consts', () => {
    expect(triageMemo()).toContain('groupConversationsByTime');
  });

  it('depends on conversations, filter and now — not on searchQuery', () => {
    const memo = triageMemo();
    const deps = memo.match(/\}, \[([^\]]*)\]\);/)?.[1] ?? '';
    expect(deps).toMatch(/\bconversations\b/);
    expect(deps).toMatch(/\bfilter\b/);
    expect(deps).toMatch(/\bnow\b/);
    expect(deps).not.toMatch(/searchQuery/);
  });

  it('sits before the loading/error/empty early returns, as an unconditional hook call', () => {
    const memoStart = source.indexOf('const triage = React.useMemo(');
    const loadingReturn = source.indexOf('if (loading && conversations.length === 0)');
    expect(memoStart).toBeGreaterThan(-1);
    expect(loadingReturn).toBeGreaterThan(-1);
    expect(memoStart).toBeLessThan(loadingReturn);
  });

  it('the render path reads visibleConversations/unread/grouped off the memo, not fresh filters', () => {
    // Guards against someone reintroducing a parallel, unmemoized computation
    // further down while leaving the memo orphaned above it.
    expect(source).toMatch(/const \{ visibleConversations, unread, grouped \} = triage;/);
    expect(source).not.toMatch(/const unread = visibleConversations\.filter/);
  });
});
