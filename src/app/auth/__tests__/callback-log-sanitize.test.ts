import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from '../callback/route';

/**
 * js/log-injection (#112, #113, #114): the callback route logs a rejected
 * `?next=` redirect target verbatim in three places. Without stripping
 * control characters, an attacker-controlled value carrying a newline could
 * make a single log call read as multiple, forged log lines to anyone
 * viewing raw log output.
 */
describe('sanitizeForLog', () => {
  it('strips newlines that would forge a fake log line', () => {
    const value = 'ok\n[Security] fake info: nothing to see here';
    expect(sanitizeForLog(value)).toBe('ok[Security] fake info: nothing to see here');
  });

  it('strips other control characters (CR, tab, NUL, DEL)', () => {
    expect(sanitizeForLog('a\rb\tc\x00d\x7fe')).toBe('abcde');
  });

  it('caps length so a huge value cannot flood logs', () => {
    const huge = 'x'.repeat(500);
    expect(sanitizeForLog(huge).length).toBe(200);
  });

  it('leaves an ordinary path untouched', () => {
    expect(sanitizeForLog('/golf/dashboard')).toBe('/golf/dashboard');
  });
});
