import { describe, expect, it } from 'vitest';
import { wholeFacts } from '../facts';

const NBSP = '\u00a0';
/** Where a line may break: at an ordinary space only. */
const pieces = (line: string) => line.split(' ');

describe('a line of facts that may wrap', () => {
  it('breaks only after a separator: a line never starts with the dot, and a day, a time and a short place stay whole', () => {
    expect(pieces(wholeFacts('Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Club'))).toEqual([`Thu,${NBSP}Nov${NBSP}5${NBSP}·`, `2:00${NBSP}to${NBSP}5:00${NBSP}PM${NBSP}·`, `Lakeside${NBSP}Golf${NBSP}Club`]);
  });
  it('reads as the same words', () => {
    const line = 'Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Club';
    expect(wholeFacts(line).replace(/\u00a0/g, ' ')).toBe(line);
    expect(wholeFacts('Wrap')).toBe('Wrap');
    expect(wholeFacts('')).toBe('');
  });
  it('lets a long fact wrap inside, so nothing can run off a phone, and still keeps a clock with its AM or PM', () => {
    const long = wholeFacts('The Country Club of North Carolina, Dogwood Course · Starts 10:00 AM sharp, every day');
    expect(pieces(long).slice(0, 3)).toEqual(['The', 'Country', 'Club']);
    expect(long).toContain(`Course${NBSP}· Starts`);
    expect(long).toContain(`10:00${NBSP}AM`);
    for (const piece of pieces(long)) expect(piece.length).toBeLessThanOrEqual(20);
  });
});
