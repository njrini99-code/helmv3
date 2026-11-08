import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { chSpringCurve } from '../../../../lib/motion';
import { LAUNCH_RECEIPT_SHARE, playReceiptRise, receiptDelayAfter } from '../../motion/messages-beats';
import { SEND_STAMP_TTL_MS, stampSend, takeSendStamp } from '../send-stamps';
import { TYPING_REPLY_GRACE_MS, typingRecentlyShown, TypingRows } from '../TypingRows';

afterEach(() => cleanup());

/** MOT-SEND-8: Delivered rises after 70% of the launch, counted from the send, not from when the receipt mounts. */
describe('receipt delay (MOT-SEND-8)', () => {
  const full = Math.round(chSpringCurve('launch').ms * LAUNCH_RECEIPT_SHARE);
  it('is 70% of the launch spring (568 ms at 812), not the artifact\'s rounded 580', () => {
    expect(chSpringCurve('launch').ms).toBe(812);
    expect(full).toBe(568);
    expect(receiptDelayAfter(0)).toBe(568);
  });
  it('counts the wait from the send: a fast confirm waits out the rest, a slow one rises at once', () => {
    expect(receiptDelayAfter(100)).toBe(468);
    expect(receiptDelayAfter(568)).toBe(0);
    expect(receiptDelayAfter(2400)).toBe(0);
    expect(receiptDelayAfter(-50)).toBe(568);
  });
  it('plays 4 px / opacity 0 > 1 on the receipt beat after that delay, and not at all under Reduce Motion', () => {
    const el = document.createElement('span');
    const animate = vi.fn(() => ({}) as Animation);
    el.animate = animate as never;
    playReceiptRise(el, { receiptDelayMs: receiptDelayAfter(100) }, false);
    const [frames, timing] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ translate: '0 4px', opacity: 0 }, { translate: '0 0', opacity: 1 }]);
    expect(timing).toMatchObject({ duration: 260, delay: 468, fill: 'backwards' });
    expect(playReceiptRise(el, { receiptDelayMs: 0 }, true)).toBeNull();
  });
});

describe('send stamps', () => {
  it('a stamp is taken once, only for a message sent a moment ago', () => {
    stampSend('m1', 1000);
    expect(takeSendStamp('m1', 1500)).toBe(1000);
    expect(takeSendStamp('m1', 1500)).toBeNull();
    stampSend('m2', 1000);
    expect(takeSendStamp('m2', 1000 + SEND_STAMP_TTL_MS + 1)).toBeNull();
    expect(takeSendStamp('never-sent')).toBeNull();
  });
  it('stamps older than the TTL are dropped when the next send is stamped', () => {
    stampSend('old', 0);
    stampSend('new', SEND_STAMP_TTL_MS + 5);
    expect(takeSendStamp('old', SEND_STAMP_TTL_MS + 6)).toBeNull();
  });
});

describe('typingRecentlyShown (the reply row has its own arrival)', () => {
  it('is false with no dots, true while they show, and true for a beat after they leave', () => {
    const t = performance.now();
    expect(typingRecentlyShown(t + 100_000)).toBe(false);
    const api = { typing: true, typingUserIds: ['u2'], typingByConv: new Map(), directory: [], viewer: { role: 'coach' } } as never;
    const conv = { id: 'c', group: false, memberIds: ['u2'], title: 'Cole' } as never;
    const { unmount } = render(<TypingRows api={api} conv={conv} />);
    expect(typingRecentlyShown()).toBe(true);
    unmount();
    const ended = performance.now();
    expect(typingRecentlyShown(ended + TYPING_REPLY_GRACE_MS - 50)).toBe(true);
    expect(typingRecentlyShown(ended + TYPING_REPLY_GRACE_MS + 50)).toBe(false);
  });
});
