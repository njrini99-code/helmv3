import { describe, expect, it } from 'vitest';
import { localDateIn, quickChatWeekDays } from '../quick-chat-week';

describe('quick chat week', () => {
  it('puts a Tuesday 8 PM Eastern practice on Tuesday, not UTC Wednesday', () => {
    expect(localDateIn('2026-11-04T01:00:00Z', 'America/New_York')).toBe('2026-11-03');
  });

  it('runs Monday to Sunday from any day in the week', () => {
    const days = quickChatWeekDays('2026-11-04');
    expect(days[0]).toBe('2026-11-02');
    expect(days[6]).toBe('2026-11-08');
  });
});
