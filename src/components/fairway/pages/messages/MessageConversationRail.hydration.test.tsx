// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageConversationRail — required `now`, no internal clock read
 * ----------------------------------------------------------------------------
 * `formatTime` and `groupConversationsByTime` used to call `new Date()`
 * directly, so their output depended on the ambient wall clock at render
 * time — a server render and the client's first paint (evaluated moments
 * apart) could disagree on "Today" vs. not, or "3:00 PM" vs. a stale label
 * (React #418). The fix threads a required, caller-seeded `now: Date | null`
 * through instead.
 *
 * This test proves the regression is closed: hold the `now` PROP fixed and
 * flip the ambient system clock between two distant instants across a
 * re-render of the SAME tree — if the component still reads
 * `new Date()`/`Date.now()` internally, the two renders diverge; if it only
 * reads the prop, they are byte-identical. `rerender` (not a fresh
 * `render`/`cleanup`) is used deliberately, so unrelated per-mount id
 * generation (Base UI's `useId`-based input id) can't produce a false
 * difference unrelated to the clock.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MessageConversationRail } from './MessageConversationRail';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
}));

afterEach(() => {
  vi.useRealTimers();
});

function makeConversations(): GolfConversationWithMeta[] {
  return [
    {
      id: 'c1',
      is_group: false,
      title: null,
      unread_count: 0,
      other_participant: { id: 'u1', name: 'Jordan Lee', avatar: null },
      last_message: { content: 'See you at practice', created_at: '2026-09-01T14:58:00.000Z' },
    } as unknown as GolfConversationWithMeta,
    {
      id: 'c2',
      is_group: true,
      title: 'Travel team',
      unread_count: 2,
      last_message: { content: 'Bus leaves at 7am', created_at: '2026-08-30T09:00:00.000Z' },
    } as unknown as GolfConversationWithMeta,
  ];
}

function rail(now: Date | null) {
  return (
    <MessageConversationRail
      conversations={makeConversations()}
      selectedId={null}
      onSelect={vi.fn()}
      onNewMessage={vi.fn()}
      loading={false}
      error={false}
      now={now}
    />
  );
}

describe('MessageConversationRail — now: Date | null (no internal clock read)', () => {
  it('re-renders byte-identical markup for a fixed now prop no matter what the ambient system clock reads', () => {
    const now = new Date('2026-09-01T15:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const { container, rerender } = render(rail(now));
    const html1 = container.innerHTML;

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    rerender(rail(now));
    const html2 = container.innerHTML;

    expect(html2).toBe(html1);
  });

  it('re-renders the same pre-mount (now: null) markup regardless of the ambient system clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
    const { container, rerender } = render(rail(null));
    const html1 = container.innerHTML;

    vi.setSystemTime(new Date('2030-06-15T00:00:00.000Z'));
    rerender(rail(null));
    const html2 = container.innerHTML;

    expect(html2).toBe(html1);
  });
});
