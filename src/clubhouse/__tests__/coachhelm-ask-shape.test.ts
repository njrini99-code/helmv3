import { describe, expect, it } from 'vitest';
import type { PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';
import {
  ASK_STARTERS,
  buildAskSuggestions,
  conversationTitle,
  filterConversations,
  findingCategory,
  groupConversations,
  insertMention,
  localDay,
  matchPlayers,
  mentionQuery,
  noRoundsFrom,
  pulseToFindings,
  titleFromQuestion,
  withRangeClause,
  type ChAskConversation,
} from '../data/coachhelm-chat-shape';

/** Ask CoachHelm (P013): the pure steps the frame shares (docs/clubhouse/catalog/coachhelm.md, 13xxx). */

const ZONE = 'America/New_York';
const NOW = '2026-09-30T18:00:00.000Z'; // Sept 30, 2:00 PM in New York
const conv = (id: string, updatedAt: string, title = id): ChAskConversation => ({ id, title, updatedAt });

describe('groupConversations: Today, This week, Earlier, in the team zone', () => {
  it('groups by the calendar day in the zone, not in UTC: 9:30 PM New York on the 29th is the 30th in UTC, and is yesterday there', () => {
    const late = conv('late', '2026-09-30T01:30:00.000Z'); // Sept 29, 9:30 PM in New York
    const today = conv('today', '2026-09-30T04:30:00.000Z'); // Sept 30, 12:30 AM in New York
    const groups = groupConversations([today, late], NOW, ZONE);
    expect(groups.map((g) => [g.key, g.items.map((c) => c.id)])).toEqual([
      ['today', ['today']],
      ['week', ['late']],
    ]);
  });

  it('the six days before today are This week; the seventh is Earlier', () => {
    const groups = groupConversations([conv('d6', '2026-09-24T16:00:00.000Z'), conv('d7', '2026-09-23T16:00:00.000Z')], NOW, ZONE);
    expect(groups.map((g) => [g.key, g.label, g.items.map((c) => c.id)])).toEqual([
      ['week', 'This week', ['d6']],
      ['earlier', 'Earlier', ['d7']],
    ]);
  });

  it('keeps the list order inside a group, leaves out a group with nobody in it, and never puts a future time under Earlier', () => {
    const groups = groupConversations([conv('b', '2026-09-30T17:00:00.000Z'), conv('a', '2026-09-30T13:00:00.000Z'), conv('future', '2026-10-02T13:00:00.000Z')], NOW, ZONE);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('today');
    expect(groups[0]!.items.map((c) => c.id)).toEqual(['b', 'a', 'future']);
    expect(groupConversations([], NOW, ZONE)).toEqual([]);
  });

  it('localDay reads the zone', () => {
    expect(localDay('2026-09-30T01:30:00.000Z', ZONE)).toBe('2026-09-29');
    expect(localDay('2026-09-30T01:30:00.000Z', 'UTC')).toBe('2026-09-30');
  });
});

describe('filterConversations and titles', () => {
  const list = [conv('1', NOW, 'Putting inside 6 feet'), conv('2', NOW, 'Weekly brief, Sept 29')];
  it('matches a substring of the title without regard to case, and a blank search is the whole list', () => {
    expect(filterConversations(list, 'PUTT').map((c) => c.id)).toEqual(['1']);
    expect(filterConversations(list, '  ').map((c) => c.id)).toEqual(['1', '2']);
    expect(filterConversations(list, 'zzz')).toEqual([]);
  });

  it('a chat with no title is Untitled chat; a first question becomes a one-line title of about 60 characters', () => {
    expect(conversationTitle(null)).toBe('Untitled chat');
    expect(conversationTitle('  ')).toBe('Untitled chat');
    expect(conversationTitle(' Brief ')).toBe('Brief');
    expect(titleFromQuestion('Why are\n we   missing so many short putts lately?')).toBe('Why are we missing so many short putts lately?');
    const long = titleFromQuestion('x'.repeat(80));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('...')).toBe(true);
    expect(titleFromQuestion('   ')).toBe('New chat');
  });
});

describe('buildAskSuggestions: only questions the data can answer', () => {
  const openers = ['Brief me on Finley', 'Where is the team losing the most strokes?'];
  it('offers brief, strokes, trending and this week when the data supports them', () => {
    const s = buildAskSuggestions({ openers, recentCovered: 5, rosterCount: 8 });
    expect(s.map((x) => x.id)).toEqual(['brief', 'strokes', 'trending', 'week']);
    expect(s[0]!.text).toBe('Brief me on Finley');
    expect(s[0]!.sub('Finley')).toBe('on Finley');
  });

  it('trending up needs three players with a recent round, as the strokes opener does', () => {
    expect(buildAskSuggestions({ openers, recentCovered: 2, rosterCount: 8 }).map((x) => x.id)).toEqual(['brief', 'strokes', 'week']);
    expect(buildAskSuggestions({ openers, recentCovered: 3, rosterCount: 8 }).map((x) => x.id)).toContain('trending');
  });

  it('offers nothing when there is no roster and no opener', () => {
    expect(buildAskSuggestions({ openers: [], recentCovered: 0, rosterCount: 0 })).toEqual([]);
    expect(buildAskSuggestions({ openers: [], recentCovered: 0, rosterCount: 4 }).map((x) => x.id)).toEqual(['week']);
  });
});

describe('pulseToFindings', () => {
  const item = (over: Partial<PulseItem> & { id: string }): PulseItem => ({ headline: 'h', evidence: 'e', tone: 'neutral', weight: 1, ...over });
  it('takes at most three, names the category from the id, and keeps a link only when its screen is rebuilt', () => {
    const items = [
      item({ id: 'rsvp-1', ask: 'Send a reminder', action: { label: 'Open calendar', href: '/golf/dashboard/calendar' } }),
      item({ id: 'tasks-overdue', action: { label: 'Open tasks', href: '/golf/dashboard/tasks' } }),
      item({ id: 'focus-stalled', ask: '   ' }),
      item({ id: 'signals-open' }),
    ];
    const out = pulseToFindings(items, (href) => (href.endsWith('/calendar') ? href : null));
    expect(out.map((f) => f.id)).toEqual(['rsvp-1', 'tasks-overdue', 'focus-stalled']);
    expect(out[0]).toMatchObject({ category: 'Schedule', ask: 'Send a reminder', link: { label: 'Open calendar', href: '/golf/dashboard/calendar' } });
    expect(out[1]!.link).toBeNull();
    expect(out[2]).toMatchObject({ category: 'Focus areas', ask: null });
    expect(findingCategory('something-new')).toBe('Program');
  });
});

describe('the composer steps', () => {
  it('withRangeClause adds the chosen range as a sentence the coach can read, and nothing for no range', () => {
    expect(withRangeClause('  Who is trending up?  ', null)).toBe('Who is trending up?');
    expect(withRangeClause('Who is trending up?', '30d')).toBe('Who is trending up? Use the last 30 days.');
    expect(withRangeClause('Who is trending up?', '7d')).toBe('Who is trending up? Use the last 7 days.');
    expect(withRangeClause('Who is trending up?', 'season')).toBe('Who is trending up? Use this season.');
  });

  it('insertMention puts @Name where the @fragment was, or at the end after a space', () => {
    expect(insertMention('Compare @jo', 'Jonah Okafor')).toBe('Compare @Jonah Okafor ');
    expect(insertMention('Compare', 'Jonah Okafor')).toBe('Compare @Jonah Okafor ');
    expect(insertMention('', 'Jonah Okafor')).toBe('@Jonah Okafor ');
    expect(insertMention('Compare @Jonah Okafor and ', 'Eli Brandt')).toBe('Compare @Jonah Okafor and @Eli Brandt ');
  });

  it('mentionQuery sees an @fragment only at the end of a word boundary', () => {
    expect(mentionQuery('hello @jo')).toBe('jo');
    expect(mentionQuery('@')).toBe('');
    expect(mentionQuery('mail me at a@b')).toBeNull();
    expect(mentionQuery('hello @jo there')).toBeNull();
  });

  it('matchPlayers filters by name, leaves out the ones already mentioned, and stops at eight', () => {
    const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
    expect(matchPlayers(players, '', '')).toHaveLength(8);
    expect(matchPlayers(players, 'player 1', '').map((p) => p.name)).toEqual(['Player 1', 'Player 10', 'Player 11']);
    expect(matchPlayers(players, '', '@Player 0 and @Player 1 ').map((p) => p.name)).not.toContain('Player 0');
  });

  it('the plus menu has the seven starters, and each seeds text that does not end the question', () => {
    expect(ASK_STARTERS.map((s) => s.label)).toEqual(['Add player', 'Compare players', 'Add date range', 'Create practice', 'Create focus area', 'Assign task', 'Draft team update']);
    for (const s of ASK_STARTERS) expect(s.seed === '' || /[ ,]$/.test(s.seed)).toBe(true);
  });
});

describe('noRoundsFrom', () => {
  it('is true only when the roster has players and every one has no round', () => {
    expect(noRoundsFrom({ active_roster: 8, players_without_rounds: 8 })).toBe(true);
    expect(noRoundsFrom({ active_roster: 8, players_without_rounds: 7 })).toBe(false);
    expect(noRoundsFrom({ active_roster: 0, players_without_rounds: 0 })).toBe(false);
    expect(noRoundsFrom(null)).toBe(false);
  });
});
