// @vitest-environment jsdom
/**
 * ============================================================================
 * MessageComposer — Enter is a hardware-keyboard affordance
 * ----------------------------------------------------------------------------
 * The composer's documented contract is "Enter sends, Shift+Enter makes a new
 * line". That contract silently assumed a keyboard with a Shift key.
 *
 * An iOS software keyboard has no Shift+Enter — its return key reports as a
 * plain `Enter` — so on a phone the newline branch was unreachable and every
 * attempt at a second line sent the message instead. A player could not put a
 * line break in a team message at all.
 *
 * These tests pin BOTH halves, because a fix that only ever ran one of them
 * would be a gate that cannot fail: with a fine pointer Enter must still send
 * (desktop is unchanged), and with a coarse pointer Enter must reach the
 * textarea as an ordinary newline and must NOT send.
 * ========================================================================== */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/components/fairway/pages/messages/MessageComposer.tsx'),
  'utf8',
);

/** Swapped per test to stand in for `(pointer: fine)`. */
let pointerIsFine = true;

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => pointerIsFine,
}));

// The attachment controls pull in storage/upload plumbing that is irrelevant
// to the key handling under test.
vi.mock('@/components/golf/messages/AttachmentButton', () => ({
  AttachmentButton: () => null,
}));
vi.mock('@/components/golf/messages/AttachmentPreview', () => ({
  AttachmentPreview: () => null,
}));

import { MessageComposer } from './MessageComposer';

function renderComposer() {
  const onSend = vi.fn().mockResolvedValue(true);
  render(<MessageComposer onSend={onSend} />);
  const textarea = screen.getByPlaceholderText('Type a message…');
  fireEvent.change(textarea, { target: { value: 'meet at the clubhouse' } });
  return { onSend, textarea };
}

describe('MessageComposer — Enter key by pointer type', () => {
  beforeEach(() => {
    pointerIsFine = true;
    vi.clearAllMocks();
  });

  it('sends on Enter with a fine pointer (desktop behavior is unchanged)', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('meet at the clubhouse');
  });

  it('does NOT send on Shift+Enter with a fine pointer', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does NOT send on Enter with a coarse pointer — the phone needs the newline', () => {
    pointerIsFine = false;
    const { onSend, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('leaves Enter undefaulted on a coarse pointer so the textarea inserts a newline', () => {
    pointerIsFine = false;
    const { textarea } = renderComposer();

    // `preventDefault()` is what would rob the textarea of its native newline.
    // fireEvent returns false only when the event WAS defaulted.
    const notPrevented = fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(notPrevented).toBe(true);
  });

  it('still sends from the send button on a coarse pointer', async () => {
    pointerIsFine = false;
    const { onSend } = renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).toHaveBeenCalledWith('meet at the clubhouse');
  });
});

describe('MessageComposer — desktop helper text is pointer-gated', () => {
  beforeEach(() => {
    pointerIsFine = true;
    vi.clearAllMocks();
  });

  it('shows the Enter/Shift+Enter hint with a fine pointer', () => {
    renderComposer();
    expect(screen.getByText(/Press Enter to send/i)).toBeInTheDocument();
  });

  it('renders no keyboard hint on a touch device (Doctrine Rule 7)', () => {
    pointerIsFine = false;
    renderComposer();
    expect(screen.queryByText(/Press Enter to send/i)).not.toBeInTheDocument();
  });
});

describe('MessageComposer — native Fairway control contract', () => {
  it('uses one native textarea with Fairway press and icon controls', () => {
    expect(source.match(/<textarea\b/g) ?? []).toHaveLength(1);
    expect(source).toContain("from '@/components/fairway/controls/press-target'");
    expect(source).toContain("from '@/components/fairway/controls/button'");
    expect(source).toContain('<PressTarget');
    expect(source).toContain('<IconButton');
  });

  it('does not import generic UI textarea or button controls', () => {
    expect(source).not.toContain("from '@/components/ui/button'");
    expect(source).not.toContain("from '@/components/ui/input'");
  });
});
