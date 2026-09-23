// @vitest-environment jsdom
/**
 * ============================================================================
 * G-23 — Enter is how an IME COMMITS, not only how a message sends
 * ----------------------------------------------------------------------------
 * With a Japanese, Chinese, Korean or Vietnamese input method open, the Enter
 * key confirms the highlighted candidate. The composer treated every
 * unshifted Enter as "send", so committing a word mid-sentence sent the
 * fragment typed so far and cleared the box.
 *
 * The audit's evidence was that grepping the whole messages tree for
 * `isComposing` and `229` returned nothing — while
 * `MessageComposer.enterKey.test.tsx` sat green beside it, never exercising
 * composition at all. That is the "gate that cannot fail" shape
 * `.claude/rules/quality-gates.md` warns about, so these tests pin each of the
 * three signals the guard reads SEPARATELY: a fix that only ever handled one
 * engine would leave the others failing here.
 *
 * The three, and why one is not enough:
 *   • `isComposing` on the native event — Chromium and Gecko dispatch the
 *     commit keydown while composition is still open.
 *   • `keyCode === 229` — the same engines' legacy signal, and all that some
 *     Android WebViews report.
 *   • compositionstart/compositionend — WebKit ends composition BEFORE the
 *     commit keydown, so the other two are already false by then.
 *
 * Every test runs with a FINE pointer, because that is the only configuration
 * where Enter sends at all (see the sibling enterKey suite); a touch keyboard
 * already falls through to a native newline.
 * ========================================================================== */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => true,
}));

vi.mock('@/components/golf/messages/AttachmentButton', () => ({
  AttachmentButton: () => null,
}));
vi.mock('@/components/golf/messages/AttachmentPreview', () => ({
  AttachmentPreview: () => null,
}));

import { MessageComposer } from './MessageComposer';

const DRAFT = 'ゴルフの練習';

function renderComposer() {
  const onSend = vi.fn().mockResolvedValue(true);
  render(<MessageComposer onSend={onSend} />);
  const textarea = screen.getByPlaceholderText('Type a message…') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: DRAFT } });
  return { onSend, textarea };
}

/** Let the deferred compositionend clear run. */
const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MessageComposer — Enter during IME composition commits, it does not send (G-23)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not send when the native event reports isComposing (Chromium, Gecko)', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false, isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on the legacy keyCode 229 an engine may report instead', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false, keyCode: 229 });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send while a composition is open, even with both other signals absent (WebKit)', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('swallows the commit keydown WebKit dispatches after compositionend, in the same tick', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.compositionStart(textarea);
    // WebKit's order: compositionend first, then the Enter that caused it.
    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on the NEXT Enter after composition finished — the guard is not sticky', async () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.compositionStart(textarea);
    fireEvent.compositionEnd(textarea);
    await nextMacrotask();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(DRAFT));
  });

  it('leaves a composing Enter undefaulted, so the IME still receives its commit key', () => {
    const { textarea } = renderComposer();

    // preventDefault() here would stop the IME committing the candidate at
    // all — the guard must decline to act, not consume the event.
    const notPrevented = fireEvent.keyDown(textarea, {
      key: 'Enter',
      shiftKey: false,
      isComposing: true,
    });

    expect(notPrevented).toBe(true);
  });

  it('leaves an ordinary Enter with no IME involved completely unchanged', async () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(DRAFT));
  });

  it('keeps Shift+Enter a newline during composition too', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });
});
