// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerStage } from '../screens/stats/PlayerStage';
import { nearestIndex, readRound, stepIndex } from '../screens/stats/scrub';

afterEach(cleanup);

describe('scrub snapping', () => {
  it('the nearest round is the column the pointer is in, clamped at both ends', () => {
    // Ten columns across 500px starting at x = 100: each is 50px wide.
    expect(nearestIndex(100, 100, 500, 10)).toBe(0);
    expect(nearestIndex(149, 100, 500, 10)).toBe(0);
    expect(nearestIndex(150, 100, 500, 10)).toBe(1);
    expect(nearestIndex(599, 100, 500, 10)).toBe(9);
    expect(nearestIndex(40, 100, 500, 10)).toBe(0);
    expect(nearestIndex(900, 100, 500, 10)).toBe(9);
    expect(nearestIndex(300, 100, 500, 1)).toBe(0);
    expect(nearestIndex(300, 100, 500, 0)).toBe(-1);
    expect(nearestIndex(300, 100, 0, 5)).toBe(0);
  });

  it('arrow keys step one round and stop at the ends; Home and End jump; nothing selected lands on the newest', () => {
    expect(stepIndex(3, 'ArrowRight', 10)).toBe(4);
    expect(stepIndex(3, 'ArrowLeft', 10)).toBe(2);
    expect(stepIndex(0, 'ArrowLeft', 10)).toBe(0);
    expect(stepIndex(9, 'ArrowRight', 10)).toBe(9);
    expect(stepIndex(4, 'Home', 10)).toBe(0);
    expect(stepIndex(4, 'End', 10)).toBe(9);
    expect(stepIndex(null, 'ArrowLeft', 10)).toBe(9);
    expect(stepIndex(null, 'a', 10)).toBeNull();
    expect(stepIndex(2, 'Tab', 10)).toBeNull();
    expect(stepIndex(0, 'ArrowRight', 0)).toBeNull();
  });

  it('a round reads as its date, course and score with to par, an em dash dropped when it has no par', () => {
    expect(readRound({ label: 'Sep 23', course: 'Lonnie Poole GC', score: 73, toPar: 1, holes: 18 })).toBe('Sep 23 · Lonnie Poole GC · 73, +1');
    expect(readRound({ label: 'Sep 9', course: 'Pinehurst No. 8', score: 72, toPar: 0, holes: 18 })).toBe('Sep 9 · Pinehurst No. 8 · 72, E');
    expect(readRound({ label: 'Sep 6', score: 74, toPar: null, holes: 9 })).toBe('Sep 6 · 74 (9 holes, doubled)');
  });
});

const rounds = [
  { label: 'Sep 6', course: 'Finley GC', score: 72, toPar: 0, holes: 18 },
  { label: 'Sep 13', course: 'Finley GC', score: 73, toPar: 1, holes: 18 },
  { label: 'Sep 20', course: 'Oakmont CC', score: 75, toPar: 3, holes: 18 },
];

describe('PlayerStage scrub', () => {
  it('arrow keys read a round in the header line and in the live region; Escape gives the note back', () => {
    render(<PlayerStage rounds={rounds} first="Jonah" coach teamAvg={73} meta="Last 3 rounds" note="Jonah is steady." />);
    const bars = screen.getByRole('list', { name: /arrow keys/i });
    expect(screen.getByText('Jonah is steady.')).toBeTruthy();
    fireEvent.keyDown(bars, { key: 'ArrowLeft' });
    expect(screen.getAllByText('Sep 20 · Oakmont CC · 75, +3')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('Sep 20 · Oakmont CC · 75, +3');
    fireEvent.keyDown(bars, { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toBe('Sep 13 · Finley GC · 73, +1');
    fireEvent.keyDown(bars, { key: 'Home' });
    expect(screen.getByRole('status').textContent).toBe('Sep 6 · Finley GC · 72, E');
    fireEvent.keyDown(bars, { key: 'Escape' });
    expect(screen.getByText('Jonah is steady.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('a pointer over the columns snaps to the nearest round and leaving clears it', () => {
    render(<PlayerStage rounds={rounds} first="Jonah" coach={false} teamAvg={null} meta="Last 3 rounds" />);
    const bars = screen.getByRole('list', { name: /arrow keys/i });
    bars.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, right: 300, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(bars, { clientX: 150 });
    expect(screen.getByRole('status').textContent).toBe('Sep 13 · Finley GC · 73, +1');
    fireEvent.pointerMove(bars, { clientX: 290 });
    expect(screen.getByRole('status').textContent).toBe('Sep 20 · Oakmont CC · 75, +3');
    fireEvent.pointerLeave(bars);
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
