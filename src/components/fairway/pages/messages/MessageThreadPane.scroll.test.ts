// @vitest-environment jsdom
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MessageThreadPane,
  shouldScrollThreadToLatestOnOpen,
  type MessageThreadPaneProps,
} from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

describe('MessageThreadPane initial thread position', () => {
  const groupMessages = [
    { conversation_id: 'group-1' },
    { conversation_id: 'group-1' },
  ];

  it('opens a loaded group thread at its newest message', () => {
    expect(shouldScrollThreadToLatestOnOpen('group-1', 'group-1', false, groupMessages)).toBe(true);
  });

  it('waits for the requested conversation instead of scrolling stale prior-thread rows', () => {
    const staleMessages = [{ conversation_id: 'direct-message-1' }];

    expect(shouldScrollThreadToLatestOnOpen('group-1', 'group-1', false, staleMessages)).toBe(false);
    expect(shouldScrollThreadToLatestOnOpen('group-1', 'group-1', true, groupMessages)).toBe(false);
  });

  it('does not force-scroll messages that arrive after the opening position is set', () => {
    expect(shouldScrollThreadToLatestOnOpen(null, 'group-1', false, groupMessages)).toBe(false);
  });

  it('sets the thread scroll container to its bottom after a group thread finishes loading', () => {
    const conversation: GolfConversationWithMeta = {
      id: 'group-1',
      is_group: true,
      title: 'Team group',
      unread_count: 0,
    } as GolfConversationWithMeta;
    const messages: MessageWithReadStatus[] = [
      {
        id: 'm1',
        conversation_id: 'group-1',
        sender_id: 'player-1',
        content: 'Earlier message',
        created_at: '2026-08-22T11:00:00.000Z',
        read: false,
        is_deleted: false,
        edited_at: null,
        has_attachments: false,
      },
      {
        id: 'm2',
        conversation_id: 'group-1',
        sender_id: 'player-2',
        content: 'Newest message',
        created_at: '2026-08-22T11:01:00.000Z',
        read: false,
        is_deleted: false,
        edited_at: null,
        has_attachments: false,
      },
    ] as MessageWithReadStatus[];
    const props: MessageThreadPaneProps = {
      conversation,
      messages,
      loading: true,
      userId: 'coach-1',
      currentUserId: 'coach-1',
      isOtherTyping: false,
      onBack: vi.fn(),
      onNewMessage: vi.fn(),
      editingMessageId: null,
      editContent: '',
      isEditSaving: false,
      deleteConfirmId: null,
      mobileActionsId: null,
      onStartEdit: vi.fn(),
      onEditContentChange: vi.fn(),
      onCancelEdit: vi.fn(),
      onSaveEdit: vi.fn(),
      onDeleteClick: vi.fn(),
      onConfirmDelete: vi.fn(),
      onCancelDelete: vi.fn(),
      onSetMobileActions: vi.fn(),
    };

    const { container, rerender } = render(createElement(MessageThreadPane, props));
    const scrollContainer = container.querySelector<HTMLElement>('[data-scroll-container]');
    expect(scrollContainer).not.toBeNull();
    Object.defineProperty(scrollContainer!, 'scrollHeight', { configurable: true, value: 640 });
    Object.defineProperty(scrollContainer!, 'clientHeight', { configurable: true, value: 180 });

    rerender(createElement(MessageThreadPane, { ...props, loading: false }));

    expect(scrollContainer!.scrollTop).toBe(640);
  });

  it('stays pinned to the newest message when the scroll region shrinks under it (keyboard opening)', () => {
    // jsdom has no ResizeObserver; capture the callback the pane registers.
    // It has no scrollIntoView either, and the new-message effect calls it.
    const callbacks: Array<() => void> = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    try {
      const conversation = { id: 'group-1', is_group: true, title: 'Team group', unread_count: 0 } as GolfConversationWithMeta;
      const messages = [
        { id: 'm1', conversation_id: 'group-1', sender_id: 'p1', content: 'a', created_at: '2026-09-01T00:00:00Z', read: false, is_deleted: false, edited_at: null, has_attachments: false },
      ] as MessageWithReadStatus[];
      const props: MessageThreadPaneProps = {
        conversation, messages, loading: false, userId: 'coach-1', currentUserId: 'coach-1', isOtherTyping: false,
        onBack: vi.fn(), onNewMessage: vi.fn(), editingMessageId: null, editContent: '', isEditSaving: false,
        deleteConfirmId: null, mobileActionsId: null, onStartEdit: vi.fn(), onEditContentChange: vi.fn(),
        onCancelEdit: vi.fn(), onSaveEdit: vi.fn(), onDeleteClick: vi.fn(), onConfirmDelete: vi.fn(),
        onCancelDelete: vi.fn(), onSetMobileActions: vi.fn(),
      };
      const { container } = render(createElement(MessageThreadPane, props));
      const region = container.querySelector<HTMLElement>('[data-scroll-container]')!;
      // TWO observers now, and both are legitimate:
      //   • the stick-to-bottom hold, which re-pins a freshly opened thread
      //     while its content is still growing (late images, font swap, day
      //     separators) — the "it opened at the top" fix;
      //   • this test's subject, the keyboard-shrink pin.
      // A real resize notifies both, so the simulation fires both.
      expect(callbacks).toHaveLength(2);
      const resizeAll = () => callbacks.forEach((cb) => cb());

      // Pinned to the bottom of a 640px thread in a 400px-tall region. A real
      // ResizeObserver reports the initial size right after observe(); jsdom's
      // clientHeight is 0 until we define it, so deliver that first report.
      let clientHeight = 400;
      Object.defineProperty(region, 'scrollHeight', { configurable: true, value: 640 });
      Object.defineProperty(region, 'clientHeight', { configurable: true, get: () => clientHeight });
      resizeAll();
      region.scrollTop = 240;

      // ...then the keyboard opens and the region loses 300px. scrollTop does
      // not move on its own, so 240 would now show the middle of the thread.
      clientHeight = 100;
      resizeAll();
      expect(region.scrollTop).toBe(640);

      // A reader scrolled up into history is left alone — by BOTH mechanisms.
      // The scroll event is dispatched explicitly because assigning `scrollTop`
      // in jsdom does not emit one, where a real browser always does; that
      // event is what releases the stick-to-bottom hold, so without it this
      // would be testing a state the browser never reaches.
      clientHeight = 400;
      region.scrollTop = 0;
      region.dispatchEvent(new Event('scroll'));
      clientHeight = 100;
      resizeAll();
      expect(region.scrollTop).toBe(0);
    } finally {
      (globalThis as { ResizeObserver: unknown }).ResizeObserver = OriginalResizeObserver;
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  // ── N-04 ─────────────────────────────────────────────────────────────────
  // A thread opened at its OLDEST message once it was tall enough to overflow.
  // Reproduced in a real browser at 390x844: scrollTop 0, newest message 129px
  // below the fold; instrumenting the `scrollTop` setter across a cold load
  // recorded ONE write, `{set: 0, scrollHeight: 0, clientHeight: 0}`, while
  // switching conversations pinned correctly. Two independent defects, one
  // test each — neither is observable through the class list, so both render.
  const n04Props = (over: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps => ({
    conversation: { id: 'group-1', is_group: true, title: 'Team group', unread_count: 0 } as GolfConversationWithMeta,
    messages: [
      { id: 'm1', conversation_id: 'group-1', sender_id: 'p1', content: 'oldest', created_at: '2026-09-01T00:00:00Z', read: false, is_deleted: false, edited_at: null, has_attachments: false },
      { id: 'm2', conversation_id: 'group-1', sender_id: 'p2', content: 'newest', created_at: '2026-09-01T00:01:00Z', read: false, is_deleted: false, edited_at: null, has_attachments: false },
    ] as MessageWithReadStatus[],
    loading: false, userId: 'coach-1', currentUserId: 'coach-1', isOtherTyping: false,
    onBack: vi.fn(), onNewMessage: vi.fn(), editingMessageId: null, editContent: '', isEditSaving: false,
    deleteConfirmId: null, mobileActionsId: null, onStartEdit: vi.fn(), onEditContentChange: vi.fn(),
    onCancelEdit: vi.fn(), onSaveEdit: vi.fn(), onDeleteClick: vi.fn(), onConfirmDelete: vi.fn(),
    onCancelDelete: vi.fn(), onSetMobileActions: vi.fn(),
    ...over,
  });

  it('does not spend its one opening scroll on a pane that has no layout yet', () => {
    // The phone mounts this pane while the RAIL is the visible half and the
    // page has already auto-selected a conversation, so the opening effect runs
    // against `clientHeight === 0`. jsdom reports 0 for an unstyled element,
    // which is exactly that state — no mocking needed to reach it.
    const callbacks: Array<() => void> = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    class FakeResizeObserver {
      constructor(cb: () => void) { callbacks.push(cb); }
      observe() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    try {
      const { container } = render(createElement(MessageThreadPane, n04Props({ loading: true })));
      const region = container.querySelector<HTMLElement>('[data-scroll-container]')!;

      // Messages land. Still no layout: nothing to pin, and nothing decided.
      render(createElement(MessageThreadPane, n04Props()), { container });
      expect(region.scrollTop).toBe(0);

      // Now the reader taps that already-selected row and the pane is revealed.
      // `conversation.id` did NOT change, so the opening effect cannot re-run —
      // the resize is the only signal, and it has to be enough.
      Object.defineProperty(region, 'scrollHeight', { configurable: true, value: 750 });
      Object.defineProperty(region, 'clientHeight', { configurable: true, value: 621 });
      callbacks.forEach((cb) => cb());

      expect(region.scrollTop).toBe(750);
    } finally {
      (globalThis as { ResizeObserver: unknown }).ResizeObserver = OriginalResizeObserver;
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('attaches the stick-to-bottom observer on a thread that mounts while loading', () => {
    // The node it observes lives in the LOADED branch, so on a real open it is
    // null when the effect first runs. Keyed on `conversation.id` alone the
    // effect never re-ran, so the observer was never attached in production at
    // all — which is why growing a live thread's content moved nothing. The
    // sibling keyboard-shrink test renders with `loading: false` from the
    // start and so never saw this.
    const callbacks: Array<() => void> = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    class FakeResizeObserver {
      constructor(cb: () => void) { callbacks.push(cb); }
      observe() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    try {
      const { container } = render(createElement(MessageThreadPane, n04Props({ loading: true })));
      const whileLoading = callbacks.length;
      render(createElement(MessageThreadPane, n04Props()), { container });

      // Only the container-height observer can attach while loading; the
      // content one has no node yet. Both must be live once the thread renders.
      expect(whileLoading).toBe(1);
      expect(callbacks.length).toBe(2);
    } finally {
      (globalThis as { ResizeObserver: unknown }).ResizeObserver = OriginalResizeObserver;
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('yields the first scroll to an explicit search target instead of retaining an old-thread sentinel', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/fairway/pages/messages/MessageThreadPane.tsx'),
      'utf8',
    );
    const initialScrollStart = source.indexOf('React.useLayoutEffect(() => {');
    const initialScrollSource = source.slice(initialScrollStart, source.indexOf('// Auto-scroll to bottom'));

    expect(initialScrollStart).toBeGreaterThanOrEqual(0);
    expect(initialScrollSource).toContain('if (scrollToMessageId) {');
    expect(initialScrollSource).toContain('pendingInitialScrollConversationIdRef.current = null');
  });
});
