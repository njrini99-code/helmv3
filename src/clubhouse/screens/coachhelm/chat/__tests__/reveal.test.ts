import { describe, expect, it } from 'vitest';
import { advance, REVEAL_CLEAR_MS, REVEAL_FLOOR_CPS, wordEdge } from '../reveal';

describe('the smoothed reveal: how the release point moves', () => {
  it('follows the backlog: a big one is cleared in about the clear time, a small one at the floor rate, never past the end', () => {
    // A burst of 400 characters: one 16 ms frame releases 16/200 of it.
    expect(advance(0, 400, 16)).toBeCloseTo(32, 5);
    // A few characters left: the floor, not a twentieth of a character a frame.
    expect(advance(96, 100, 16)).toBeCloseTo(96 + (REVEAL_FLOOR_CPS / 1000) * 16, 5);
    expect(advance(99.9, 100, 16)).toBe(100);
    expect(advance(100, 100, 16)).toBe(100);
    // A stalled tab comes back with one long frame: it catches up, it does not overshoot.
    expect(advance(0, 400, 5000)).toBe(400);
  });

  it('an even clock over an uneven stream: within the clear time almost all of a burst is out', () => {
    let pos = 0;
    for (let t = 0; t < REVEAL_CLEAR_MS * 3; t += 16) pos = advance(pos, 300, 16);
    expect(pos).toBeGreaterThan(300 * 0.94);
  });

  it('releases whole words: the edge is the last word boundary behind the release point', () => {
    const text = 'Jonah is trending the right way';
    expect(wordEdge(text, 0)).toBe(0);
    expect(wordEdge(text, 3)).toBe(0);
    expect(wordEdge(text, 6)).toBe(6);
    expect(wordEdge(text, 8.7)).toBe(6);
    expect(wordEdge(text, 9)).toBe(9);
    expect(wordEdge(text, text.length - 0.5)).toBe(text.lastIndexOf(' ') + 1);
    // Nothing is held once the point reaches the end.
    expect(wordEdge(text, text.length)).toBe(text.length);
  });
});
