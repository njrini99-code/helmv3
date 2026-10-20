import { describe, expect, it } from 'vitest';
import { createTipClock, TIP_GRACE_MS, TIP_OPEN_DELAY_MS, type TipTimers } from '../tooltip-clock';

/** A clock a test drives by hand. */
function fakeTimers() {
  let t = 0;
  let next = 1;
  const queue = new Map<number, { at: number; fn: () => void }>();
  const timers: TipTimers = {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = next++;
      queue.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout: (id) => void queue.delete(id as number),
  };
  const advance = (ms: number) => {
    const to = t + ms;
    for (;;) {
      const due = [...queue.entries()].filter(([, q]) => q.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      queue.delete(due[0]);
      t = due[1].at;
      due[1].fn();
    }
    t = to;
  };
  return { timers, advance };
}

describe('tooltip timing', () => {
  it('opens after the rest, not before', () => {
    const { timers, advance } = fakeTimers();
    const clock = createTipClock(timers);
    let open = 0;
    clock.request(() => open++, true);
    advance(TIP_OPEN_DELAY_MS - 1);
    expect(open).toBe(0);
    advance(1);
    expect(open).toBe(1);
  });

  it('never opens when the pointer leaves first', () => {
    const { timers, advance } = fakeTimers();
    const clock = createTipClock(timers);
    let open = 0;
    clock.request(() => open++, true);
    advance(200);
    clock.release(false);
    advance(2000);
    expect(open).toBe(0);
    expect(clock.waiting).toBe(false);
  });

  it('opens the next one at once when moving between neighbours inside the grace window', () => {
    const { timers, advance } = fakeTimers();
    const clock = createTipClock(timers);
    clock.request(() => {}, true);
    advance(TIP_OPEN_DELAY_MS);
    clock.release(true);
    advance(TIP_GRACE_MS - 50);
    let second = 0;
    clock.request(() => second++, true);
    expect(second).toBe(1);
  });

  it('waits the full rest again once the grace window has passed', () => {
    const { timers, advance } = fakeTimers();
    const clock = createTipClock(timers);
    clock.request(() => {}, true);
    advance(TIP_OPEN_DELAY_MS);
    clock.release(true);
    advance(TIP_GRACE_MS + 1);
    let second = 0;
    clock.request(() => second++, true);
    expect(second).toBe(0);
    advance(TIP_OPEN_DELAY_MS);
    expect(second).toBe(1);
  });

  it('a tip that never opened starts no grace window', () => {
    const { timers, advance } = fakeTimers();
    const clock = createTipClock(timers);
    clock.request(() => {}, true);
    advance(100);
    clock.release(false);
    let second = 0;
    clock.request(() => second++, true);
    expect(second).toBe(0);
    advance(TIP_OPEN_DELAY_MS);
    expect(second).toBe(1);
  });

  it('keyboard focus opens at once, with no rest', () => {
    const { timers } = fakeTimers();
    const clock = createTipClock(timers);
    let open = 0;
    clock.request(() => open++, false);
    expect(open).toBe(1);
  });

  it('entering a second control cancels the first one\'s wait', () => {
    const { timers, advance } = fakeTimers();
    const clock = createTipClock(timers);
    let a = 0;
    let b = 0;
    clock.request(() => a++, true);
    advance(100);
    clock.request(() => b++, true);
    advance(TIP_OPEN_DELAY_MS * 2);
    expect(a).toBe(0);
    expect(b).toBe(1);
  });
});
