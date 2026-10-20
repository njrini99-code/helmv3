import { describe, expect, it } from 'vitest';
import { firstUnreadId, linkParts, searchSnippet, untilLabel, type ChMsg } from '../model';

const tz = 'America/New_York';
// Sunday, Oct 18 2026, 2:40 PM in New York.
const now = '2026-10-18T18:40:00Z';
const later = (days: number, hours = 0) => new Date(Date.parse(now) + (days * 24 + hours) * 3600000).toISOString();

describe('untilLabel (wave 5 #2)', () => {
  it('says today, tomorrow, a weekday within the week, then a date', () => {
    expect(untilLabel(later(0, 2), now, tz)).toBe('today');
    expect(untilLabel(later(1), now, tz)).toBe('tomorrow');
    expect(untilLabel(later(2), now, tz)).toBe('Tuesday');
    expect(untilLabel(later(6), now, tz)).toBe('Saturday');
  });

  it('a week from now is a date, never today’s weekday', () => {
    expect(untilLabel(later(7), now, tz)).toBe('Oct 25');
  });

  it('counts days in the team’s zone: 8 hours from 8 PM is tomorrow', () => {
    expect(untilLabel('2026-10-19T08:00:00Z', '2026-10-19T00:00:00Z', tz)).toBe('tomorrow');
  });
});

describe('searchSnippet (wave 5 #11)', () => {
  it('opens just before the match, on a word, and marks it whatever its case', () => {
    const text = 'Practice is moved to the north range because the main one is flooded, bring the Bus pass';
    const cut = searchSnippet(text, 'bus');
    expect(cut).toEqual({ before: '…is flooded, bring the ', match: 'Bus', after: ' pass' });
  });

  it('a match near the start keeps the whole start; no match leaves the text as it is', () => {
    expect(searchSnippet('Bus at 6:15', 'bus')).toEqual({ before: '', match: 'Bus', after: ' at 6:15' });
    expect(searchSnippet('Bus at 6:15', 'van')).toEqual({ before: 'Bus at 6:15', match: '', after: '' });
  });
});

describe('linkParts (wave 5 #13)', () => {
  it('links http and https, leaving trailing punctuation and an unopened bracket as text', () => {
    expect(linkParts('Tee times: https://golf.example.com/tee?d=1. Bring cash')).toEqual([
      'Tee times: ',
      { href: 'https://golf.example.com/tee?d=1', text: 'https://golf.example.com/tee?d=1' },
      '. Bring cash',
    ]);
    expect(linkParts('(see http://x.org/a)')).toEqual(['(see ', { href: 'http://x.org/a', text: 'http://x.org/a' }, ')']);
    expect(linkParts('https://en.wikipedia.org/wiki/Golf_(sport) rules')[0]).toEqual({
      href: 'https://en.wikipedia.org/wiki/Golf_(sport)',
      text: 'https://en.wikipedia.org/wiki/Golf_(sport)',
    });
  });

  it('never links another scheme, and plain text is one run', () => {
    expect(linkParts('javascript:alert(1) and ftp://x.org')).toEqual(['javascript:alert(1) and ftp://x.org']);
    expect(linkParts('Bus at 6:15')).toEqual(['Bus at 6:15']);
  });
});

describe('firstUnreadId (wave 5 #17)', () => {
  const msg = (id: string, mine: boolean): ChMsg => ({ id, senderId: mine ? 'me' : 'jonah', text: id, at: now, mine, seen: false, failed: null, edited: false, deleted: false, hasAttachments: false });
  it('is the earliest of the last unread messages someone else sent, skipping your own', () => {
    const msgs = [msg('a', false), msg('b', false), msg('c', true), msg('d', false)];
    expect(firstUnreadId(msgs, 2)).toBe('b');
    expect(firstUnreadId(msgs, 1)).toBe('d');
    expect(firstUnreadId(msgs, 0)).toBeNull();
    // More unread than loaded: the first loaded one of theirs.
    expect(firstUnreadId(msgs, 9)).toBe('a');
  });
});
