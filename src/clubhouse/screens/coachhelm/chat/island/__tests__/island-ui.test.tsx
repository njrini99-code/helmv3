import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskStep } from '../../../../../data/coachhelm-chat-thread';
import { ActivityIsland } from '../ActivityIsland';
import { islandModel, type IslandModel } from '../model';
import type { Island } from '../useIsland';

const turn = (steps: AskStep[]) => ({ role: 'assistant' as const, id: 't1', steps, envelopes: [], blocks: [], note: null, answerText: '', work: null, followUps: [], active: true });
const model = (steps: AskStep[], live = true): IslandModel => islandModel(turn(steps), { live, hasText: false, waitingForCoach: false, seconds: live ? null : 6, ended: false });
const island = (m: IslandModel | null, over: Partial<Island> = {}): Island => ({ model: m, open: false, pinned: false, since: null, toggle: vi.fn(), close: vi.fn(), openFor: vi.fn(), ...over });

const STEPS: AskStep[] = [
  { id: 'a', label: 'Reading Jonah’s strokes gained', state: 'done', detail: '8 rounds', ref: 'e1', subjects: [{ kind: 'player', id: 'p-jonah', label: 'Jonah Okafor' }] },
  { id: 'b', label: 'Reading his last 7 rounds', state: 'active', count: { n: 3, unit: 'rounds', more: true } },
  { id: 'c', label: 'Checking the CoachHelm board', state: 'next' },
];

describe('the activity island on screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  /** It is drawn as one line for a frame, then takes its open form. */
  const settle = () => act(() => void vi.advanceTimersByTime(50));

  it('folded: one button that says what is being done and how far along, and steps nothing can reach', () => {
    const { container } = render(<ActivityIsland island={island(model(STEPS))} />);
    settle();
    const head = screen.getByRole('button', { name: /Reading his last 7 rounds/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(head.textContent).toContain('1 of 3');
    expect(container.querySelector('.ch-isl')?.className).not.toContain('is-open');
    expect(container.querySelector('.bd')?.hasAttribute('inert')).toBe(true);
    expect(container.textContent).not.toMatch(/thinking/i);
  });

  it('open: each step in its state, what it found and touched, and only a finished read can be opened', () => {
    const onOpenStep = vi.fn();
    const { container } = render(<ActivityIsland island={island(model(STEPS), { open: true })} onOpenStep={onOpenStep} />);
    settle();
    expect(container.querySelector('.ch-isl')?.className).toContain('is-open');
    expect(container.querySelector('.bd')?.hasAttribute('inert')).toBe(false);
    const rows = [...container.querySelectorAll('.st')];
    expect(rows.map((r) => r.className.match(/is-(done|active|waiting|failed|stopped)/)?.[1])).toEqual(['done', 'active', 'waiting']);
    expect(rows[0]?.textContent).toContain('Read Jonah’s strokes gained');
    expect(rows[0]?.textContent).toContain('8 rounds');
    expect(rows[1]?.textContent).toContain('3 rounds and counting');
    expect(rows[1]?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('img', { name: '1 player so far' })).toBeTruthy();
    // One row opens what it found; the running and the waiting ones are not controls.
    const opens = container.querySelectorAll('.st .op');
    expect(opens).toHaveLength(1);
    fireEvent.click(opens[0]!);
    expect(onOpenStep).toHaveBeenCalledWith('t1', 'e1', 'Read Jonah’s strokes gained');
  });

  it('a step keeps its mark when it finishes (the ring that turned is the ring that closes), and a screen reader hears it once', () => {
    const view = render(<ActivityIsland island={island(model(STEPS), { open: true })} />);
    settle();
    const mark = view.container.querySelectorAll('.st')[1]?.querySelector('.mk');
    expect(mark?.className).toContain('is-active');
    const done = STEPS.map((s) => (s.id === 'b' ? { ...s, state: 'done' as const, detail: '7 rounds', ref: 'e2' } : s));
    view.rerender(<ActivityIsland island={island(model(done), { open: true })} onOpenStep={vi.fn()} />);
    const after = view.container.querySelectorAll('.st')[1]?.querySelector('.mk');
    expect(after).toBe(mark);
    expect(after?.className).toContain('is-done');
    expect(after?.className).not.toContain('is-rest');
    expect(after?.querySelector('.ck')).toBeTruthy();
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Read his last 7 rounds, 7 rounds');
    // Once the check is drawn the ring rests.
    act(() => void vi.advanceTimersByTime(700));
    expect(after?.className).toContain('is-rest');
  });

  it('Escape and a press elsewhere fold it; the head toggles; a finished turn says how it ended and leaves when its model goes', () => {
    const isl = island(model(STEPS), { open: true });
    const view = render(<ActivityIsland island={isl} />);
    settle();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isl.close).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(isl.close).toHaveBeenCalledTimes(2);
    fireEvent.click(view.container.querySelector('.hd')!);
    expect(isl.toggle).toHaveBeenCalledTimes(1);
    const finished = model(STEPS.map((s) => ({ ...s, state: 'done' as const })), false);
    view.rerender(<ActivityIsland island={island(finished)} />);
    expect(view.container.querySelector('.hd')?.textContent).toContain('Done · 3 steps · 6s');
    view.rerender(<ActivityIsland island={island(null)} />);
    expect(view.container.querySelector('.ch-isl')?.className).toContain('is-leaving');
    act(() => void vi.advanceTimersByTime(250));
    expect(view.container.querySelector('.ch-isl')).toBeNull();
  });
});
