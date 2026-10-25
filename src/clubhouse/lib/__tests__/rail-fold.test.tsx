/**
 * The sidebar's fold as one moment the page waits out (motion pass 2026-10-22, mot-01): size readers run once, after
 * the width transition ends, or after its own duration when no transitionend comes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterRailMove, chRailMoving, startRailMove } from '../rail-fold';

function shell(duration: string) {
  document.body.innerHTML = '<div class="ch-app"><aside class="ch-sidebar"></aside></div>';
  const sidebar = document.querySelector<HTMLElement>('.ch-sidebar')!;
  sidebar.style.transitionProperty = 'width';
  sidebar.style.transitionDuration = duration;
  return { app: document.querySelector<HTMLElement>('.ch-app')!, sidebar };
}

function widthEnd(target: HTMLElement) {
  const e = new Event('transitionend', { bubbles: true }) as TransitionEvent;
  Object.defineProperty(e, 'propertyName', { value: 'width' });
  target.dispatchEvent(e);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the sidebar fold', () => {
  it('runs a read at once when nothing is folding', () => {
    shell('462ms');
    const read = vi.fn();
    afterRailMove(read);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('marks the app while it moves and holds reads, each once, until the width transition ends', () => {
    const { app, sidebar } = shell('462ms');
    startRailMove();
    expect(chRailMoving()).toBe(true);
    expect(app.hasAttribute('data-ch-rail-moving')).toBe(true);
    const read = vi.fn();
    afterRailMove(read);
    afterRailMove(read);
    expect(read).not.toHaveBeenCalled();
    widthEnd(sidebar);
    expect(read).toHaveBeenCalledTimes(1);
    expect(chRailMoving()).toBe(false);
    expect(app.hasAttribute('data-ch-rail-moving')).toBe(false);
  });

  it('ignores a child transition ending, and settles after its own duration without a transitionend', () => {
    const { sidebar } = shell('462ms');
    const child = document.createElement('span');
    sidebar.appendChild(child);
    startRailMove();
    const read = vi.fn();
    afterRailMove(read);
    widthEnd(child);
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(461);
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('with motion off (a 0ms transition) settles on the next task', () => {
    shell('0s');
    startRailMove();
    const read = vi.fn();
    afterRailMove(read);
    vi.advanceTimersByTime(0);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a second toggle mid-fold ends the first and starts again', () => {
    const { sidebar } = shell('462ms');
    startRailMove();
    const read = vi.fn();
    afterRailMove(read);
    vi.advanceTimersByTime(200);
    startRailMove();
    expect(read).toHaveBeenCalledTimes(1);
    expect(chRailMoving()).toBe(true);
    widthEnd(sidebar);
    expect(chRailMoving()).toBe(false);
  });
});
