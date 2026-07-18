/**
 * AnimatedNumber.tsx tests — mount-roll behavior + prefers-reduced-motion.
 *
 * Fixes #906: under reduced motion, the component used to still hold the
 * displayed value at `0` for the staggerIndex delay window (the "NumberFlow
 * frozen mid-roll" symptom from live QA on the Command Center) even though
 * NumberFlow itself disables its internal spin. Reduced-motion users must
 * see the FINAL value on the very first render, synchronously — no 0, no
 * setTimeout wait.
 *
 * `@number-flow/react` is mocked globally in src/test/setup.tsx (renders
 * `{prefix}{value}{suffix}` as a plain span) — matches the repo convention
 * for testing framer-motion/NumberFlow driven components (see Reveal.test.tsx).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => state.reduced,
}));

import { AnimatedNumber } from '../animated-number';

describe('AnimatedNumber — mount roll + reduced-motion gating', () => {
  beforeEach(() => {
    state.reduced = false;
    vi.useRealTimers();
  });

  it('normal motion: starts the mount roll at 0, not the final value', () => {
    render(<AnimatedNumber value={42} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
  });

  it('normal motion: rolls up to the final value after the mount-roll tick', async () => {
    vi.useFakeTimers();
    render(<AnimatedNumber value={42} />);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(screen.getByText('42')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('reduced motion: renders the final value immediately — no 0, no wait', () => {
    state.reduced = true;
    render(<AnimatedNumber value={42} staggerIndex={3} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('reduced motion: ignores staggerIndex entirely (no held-at-0 delay window)', () => {
    state.reduced = true;
    render(<AnimatedNumber value={7} staggerIndex={5} />);
    // No timer needed at all — the real value is there on the very first render.
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('reduced motion: prefix/suffix still render alongside the immediate value', () => {
    state.reduced = true;
    render(<AnimatedNumber value={3.5} decimals={1} prefix="$" suffix="k" />);
    expect(screen.getByText(/\$3\.5k/)).toBeInTheDocument();
  });

  it('reduced motion: subsequent value updates still pass through', () => {
    state.reduced = true;
    const { rerender } = render(<AnimatedNumber value={10} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    rerender(<AnimatedNumber value={20} />);
    expect(screen.getByText('20')).toBeInTheDocument();
  });
});
