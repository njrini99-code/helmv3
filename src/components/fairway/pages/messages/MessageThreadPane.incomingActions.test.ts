// @vitest-environment jsdom
//
// G-42 — an incoming message had no action surface, and desktop had none at all.
//
// Two halves, both recorded in `audit/M03D-overlays.md`:
//
// F7 (`:83`) — the long-press spread was `{...(isOwn ? longPressHandlers(id) :
// {})}` and the whole controls block was `isOwn && …`. §12.4 asks incoming
// messages to omit EDIT AND DELETE. Omitting the entire menu is a stronger
// claim than the plan makes, and its practical effect was that the one thing
// in a thread you could not copy was the message somebody else sent you.
//
// F8 (`:89`) — the desktop hover row is `opacity-0 group-hover:opacity-100`
// with no focus variant, and `onContextMenu` was an unconditional
// `preventDefault()` while the tap row was `lg:hidden`. So on a desktop:
// right-click suppressed the native menu and opened nothing, and Tab reached
// buttons that stayed invisible. §12.2 — "do not make a long press the only
// path to reply or copy" — and §15.3.
//
// ASSERTED BEHAVIOURALLY. Every claim here is something jsdom models honestly:
// which handlers fire, what the timer does, which buttons exist, and what the
// responsive class list says. Nothing here needs layout.
//
// One thing deliberately NOT asserted: that the row is *visible* at ≥1024px.
// jsdom applies no Tailwind, so `lg:hidden` is a string to it. The test states
// the class is absent, which is the property the fix actually changed; the
// rendered result is the W8 pass's to confirm.

import { createElement } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessageThreadPane, type MessageThreadPaneProps } from './MessageThreadPane';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

vi.mock('@/app/golf/actions/messages', () => ({
  getGolfMessageAttachments: vi.fn(),
}));

/**
 * Mirrors the component's own constant. Kept as a literal on purpose: importing
 * it would make this suite agree with whatever the component says, which is not
 * a test. 500 is UIKit's `minimumPressDuration`, and pinning it here means a
 * silent retune fails rather than passes.
 */
const LONG_PRESS_MS = 500;

const conversation = {
  id: 'dm-1',
  is_group: false,
  title: null,
  unread_count: 0,
} as GolfConversationWithMeta;

const MESSAGE_ID = 'msg-1';
const BODY = 'Range is booked for 4pm';

/**
 * `isOwn` is `sender_id === userId || sender_id === currentUserId`
 * (MessageThreadPane.tsx:1007), so an incoming fixture has to move BOTH
 * identities. Moving one leaves the message own and every assertion below
 * passes for the wrong reason.
 */
function baseProps(own: boolean, overrides: Partial<MessageThreadPaneProps> = {}): MessageThreadPaneProps {
  const reader = own ? 'coach-1' : 'player-2';
  return {
    conversation,
    messages: [
      {
        id: MESSAGE_ID,
        conversation_id: 'dm-1',
        sender_id: 'coach-1',
        content: BODY,
        created_at: '2026-08-22T11:00:00.000Z',
        read: false,
        is_deleted: false,
        edited_at: null,
        has_attachments: false,
      },
    ] as MessageWithReadStatus[],
    loading: false,
    userId: reader,
    currentUserId: reader,
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
    ...overrides,
  } as MessageThreadPaneProps;
}

/**
 * The bubble carrying the message body — the element the gestures are on: the
 * INNERMOST element holding the text, which is the `<div>` the long-press and
 * context-menu handlers are spread onto. If a later finding wraps the text in
 * another element, this starts selecting a different node and the gesture
 * assertions would quietly test nothing, so it asserts it found one.
 */
function bubble(container: HTMLElement): HTMLElement {
  const match = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
    (el) => el.textContent?.includes(BODY) && !el.querySelector('div'),
  );
  expect(match.length, 'expected exactly one leaf element holding the body').toBeGreaterThan(0);
  return match[match.length - 1]!;
}

const labelsIn = (row: Element) =>
  Array.from(row.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label'));

describe('G-42 — an incoming message can be acted on', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the action row on a long press — the spread is no longer own-only', () => {
    vi.useFakeTimers();
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })),
    );

    fireEvent.pointerDown(bubble(container));
    expect(onSetMobileActions, 'must not fire before the hold completes').not.toHaveBeenCalled();
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(onSetMobileActions).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('holds for UIKit\u2019s full duration — a shorter hold opens nothing', () => {
    // ADVANCING TO LONG_PRESS_MS ALONE PINS NOTHING: it would also fire at the
    // old 450. What pins the duration is the tick BEFORE it staying silent.
    // 500 is `minimumPressDuration`, the value every other long press on an
    // iPhone uses, and this is an Apple app first — a menu that opens early
    // appears under a thumb that had not finished asking for one.
    vi.useFakeTimers();
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })),
    );

    fireEvent.pointerDown(bubble(container), { clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onSetMobileActions, 'must still be silent one tick early').not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSetMobileActions).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('cancels on a SCROLL, so a drag starting on a bubble opens nothing', () => {
    // The property that made long-press safe to attach at all. Attaching it to
    // every message doubles how often a scroll begins on a listening element,
    // so it is pinned rather than assumed to have carried over.
    vi.useFakeTimers();
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })),
    );

    const el = bubble(container);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { clientX: 100, clientY: 160 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);

    expect(onSetMobileActions).not.toHaveBeenCalled();
  });

  it('survives finger jitter — the move cancel has a touch slop, it is not zero-tolerance', () => {
    // THE DEFECT THIS FOUND. The handler cancelled on ANY `pointermove`, and a
    // finger resting on glass never emits zero of them: a real 450ms hold is a
    // stream of sub-pixel jitter, every event of which killed the timer. So the
    // menu opened only for a user who held perfectly still — and after G-42
    // that is the ONLY action surface an incoming message has on touch.
    // The authority is UIKit — this ships as a Capacitor app, so the surface is
    // a WKWebView on a phone where every other long press is a
    // UILongPressGestureRecognizer, whose `allowableMovement` is the property
    // the 10px mirrors. Corroborated by Android's ~8dp scaled touch slop and
    // the 6–10px web band; it ships to @capacitor/android as well.
    vi.useFakeTimers();
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })),
    );

    const el = bubble(container);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 });
    for (const [x, y] of [[101, 100], [102, 101], [101, 103], [103, 102]]) {
      fireEvent.pointerMove(el, { clientX: x, clientY: y });
    }
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(onSetMobileActions).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('measures the slop as a radius, not per axis', () => {
    // 8px on each axis is 11.3px of travel — past the 10px slop. A per-axis
    // check would read it as two small moves and keep the timer alive.
    vi.useFakeTimers();
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })),
    );

    const el = bubble(container);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { clientX: 108, clientY: 108 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);

    expect(onSetMobileActions).not.toHaveBeenCalled();
  });

  it('gives the sheet Copy, and withholds only Edit and Delete', () => {
    render(createElement(MessageThreadPane, baseProps(false, { mobileActionsId: MESSAGE_ID })));
    // G-56 moved the actions into the shared `Sheet`, a fixed panel outside the
    // render container, and removed the Close row — it had no counterpart in
    // either artboard, and the sheet dismisses by grip, scrim and Escape.
    const copy = document.body.querySelector('[aria-label="Copy message"]');
    expect(copy, 'an incoming message must be copyable').not.toBeNull();

    expect(labelsIn(copy!.parentElement!)).toEqual(['Copy message']);
  });

  it('keeps the own-message sheet in G-55\u2019s decided order', () => {
    render(createElement(MessageThreadPane, baseProps(true, { mobileActionsId: MESSAGE_ID })));
    const copy = document.body.querySelector('[aria-label="Copy message"]');
    expect(labelsIn(copy!.parentElement!)).toEqual([
      'Copy message',
      'Edit message',
      'Delete message',
    ]);
  });

  it('suppresses the iOS callout on an incoming bubble too, now that it owns the gesture', () => {
    // THE BUG THIS SUITE ALMOST SHIPPED. `-webkit-touch-callout: none` and
    // `select-none` were `isOwn &&` — and they, not `onContextMenu`, are what
    // actually suppresses the native callout on iOS: iOS Safari has not fired
    // `contextmenu` on a long press since iOS 13
    // (https://github.com/react/react/issues/21812). Extending the gesture to
    // incoming messages without extending the suppression would have raced our
    // menu against the native callout on exactly the messages G-42 is about.
    const incoming = render(createElement(MessageThreadPane, baseProps(false)));
    const own = render(createElement(MessageThreadPane, baseProps(true)));
    for (const { container } of [incoming, own]) {
      const el = bubble(container);
      expect(el.className).toContain('select-none');
      expect(el.className).toContain('[-webkit-touch-callout:none]');
    }
  });

  it('draws no hover row on an incoming message — Edit and Delete are the own-only pair', () => {
    const { container } = render(createElement(MessageThreadPane, baseProps(false)));
    expect(container.querySelector('[aria-label="Edit message"]')).toBeNull();
    expect(container.querySelector('[aria-label="Delete message"]')).toBeNull();
  });
});

describe('G-42 — desktop has a path to the actions', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('substitutes the action row for the native context menu instead of only suppressing it', () => {
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })),
    );

    const opened = fireEvent.contextMenu(bubble(container));
    // fireEvent returns false when a handler called preventDefault. Both halves
    // matter: suppressing the native callout is still right on iOS, and it is
    // only defensible now that something opens in its place.
    expect(opened, 'the native callout must still be suppressed').toBe(false);
    expect(onSetMobileActions).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('right-click works on an own message too', () => {
    const onSetMobileActions = vi.fn();
    const { container } = render(
      createElement(MessageThreadPane, baseProps(true, { onSetMobileActions })),
    );
    fireEvent.contextMenu(bubble(container));
    expect(onSetMobileActions).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('does not gate the action surface on viewport width', () => {
    // The other half of F8: the only thing that could substitute for the native
    // menu refused to render on the viewport that had lost it. G-42 deleted the
    // `lg:hidden`; G-56 replaced the row with a `Sheet`, which has no
    // breakpoint gate of its own. The property is the same one either way, so
    // it is re-anchored rather than dropped — asserted on the panel that now
    // owns it, and on the whole responsive prefix rather than one class, so a
    // `lg:invisible` or `max-lg:flex` would fail too.
    render(createElement(MessageThreadPane, baseProps(false, { mobileActionsId: MESSAGE_ID })));
    const panel = document.body.querySelector('[aria-label="Copy message"]')!
      .parentElement!.parentElement!;
    expect(panel.className, 'expected the Sheet panel').toContain('rounded-t-fw-lg');
    expect(panel.className).not.toMatch(/(^|\s)(lg:|max-lg:)/);
  });

  it('closes the row on Escape, because a menu a keyboard cannot leave is not a path', () => {
    const onSetMobileActions = vi.fn();
    render(
      createElement(
        MessageThreadPane,
        baseProps(false, { mobileActionsId: MESSAGE_ID, onSetMobileActions }),
      ),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSetMobileActions).toHaveBeenCalledWith(null);
    // Checked before adding this: `Escape` appears nowhere else on the messages
    // surface as a key binding, so one press does one thing. That is the
    // convention `.claude/rules/design-system.md` states — one level per
    // keypress — and it holds here because there is no second level yet.
  });

  it('does not listen for Escape while no row is open', () => {
    // The listener is window-level, so leaving it armed would swallow Escape
    // for whatever else owns it — the edit field, a dialog above the thread.
    const onSetMobileActions = vi.fn();
    render(createElement(MessageThreadPane, baseProps(false, { onSetMobileActions })));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSetMobileActions).not.toHaveBeenCalled();
  });

  it('shows the hover row to a keyboard, not only to a mouse', () => {
    // `opacity-0` keeps its children FOCUSABLE — unlike `hidden` or
    // `visibility` — so Tab always reached these buttons. It landed on
    // something invisible, which is the §15.3 defect rather than a fix for it.
    const { container } = render(createElement(MessageThreadPane, baseProps(true)));
    const row = container.querySelector('[aria-label="Edit message"]')!.parentElement!;
    expect(row.className).toContain('opacity-0');
    expect(row.className).toContain('group-hover:opacity-100');
    expect(row.className).toContain('focus-within:opacity-100');
  });
});
