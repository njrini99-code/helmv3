import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { CH_DUR_MS } from '../../../../lib/motion';
import { playReceiptFade, receiptDelayAfter } from '../../motion/messages-beats';
import { SEND_STAMP_TTL_MS, stampSend, takeSendStamp } from '../send-stamps';

afterEach(() => cleanup());

/** MOT-SEND-8, MOTION-AND-VISUAL 3.5: Delivered is late content, faded in once the bubble's rise has landed, counted from the send. */
describe('receipt delay (MOT-SEND-8)', () => {
  it('is the base beat, the insert rise the bubble takes (260 ms)', () => {
    expect(receiptDelayAfter(0)).toBe(CH_DUR_MS.base);
    expect(CH_DUR_MS.base).toBe(260);
  });
  it('counts the wait from the send: a fast confirm waits out the rest, a slow one fades in at once', () => {
    expect(receiptDelayAfter(100)).toBe(160);
    expect(receiptDelayAfter(260)).toBe(0);
    expect(receiptDelayAfter(2400)).toBe(0);
    expect(receiptDelayAfter(-50)).toBe(260);
  });
  it('fades opacity 0 > 1 over the quick beat after that delay, never moving, and not at all under Reduce Motion', () => {
    const el = document.createElement('span');
    const animate = vi.fn(() => ({}) as Animation);
    el.animate = animate as never;
    playReceiptFade(el, receiptDelayAfter(100), false);
    const [frames, timing] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(timing).toMatchObject({ duration: CH_DUR_MS.quick, delay: 160, fill: 'backwards' });
    expect(playReceiptFade(el, 0, true)).toBeNull();
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
