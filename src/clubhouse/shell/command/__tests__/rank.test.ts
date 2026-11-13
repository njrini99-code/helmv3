import { describe, expect, it } from 'vitest';
import { buildCommands } from '../commands';
import { matchScore, rankCommands } from '../rank';

/**
 * The palette's order (coach audit 13 Nov 2026, §2): a name typed whole, then a name's start, then a word of it, then its
 * other words; scattered letters only when nothing matches by name, so an abbreviation still finds a section.
 */
const commands = buildCommands({
  role: 'coach',
  pathname: '/golf/dashboard',
  people: [{ id: 'p1', name: 'Larsen Gallimore' }, { id: 'p2', name: 'Will Gruse' }],
  events: [],
  recent: [],
});
const SEARCHING = ['goto', 'people', 'events', 'actions'] as const;
const labels = (q: string) => rankCommands(commands, q, SEARCHING).flatMap((g) => g.rows.map((r) => r.label));

describe('matchScore', () => {
  it('orders a whole name, a name’s start, a word of it, then its other words', () => {
    const will = { label: 'Will Gruse', keywords: ['player'] };
    expect(matchScore(will, 'will gruse')).toBeGreaterThan(matchScore(will, 'will'));
    expect(matchScore(will, 'will')).toBeGreaterThan(matchScore(will, 'gruse'));
    expect(matchScore(will, 'gruse')).toBeGreaterThan(matchScore(will, 'player'));
    expect(matchScore(will, 'player')).toBeGreaterThan(matchScore(will, 'wgr'));
    expect(matchScore(will, 'wgr')).toBeLessThan(1);
  });
});

describe('rankCommands', () => {
  it('puts the group with the best match first', () => {
    expect(labels('larsen')[0]).toBe('Larsen Gallimore');
  });

  it('leaves scattered-letter matches out when something matches by name', () => {
    expect(labels('larsen')).toEqual(['Larsen Gallimore']);
  });

  it('still finds a section by an abbreviation when nothing matches by name', () => {
    expect(labels('calndr')[0]).toBe('Calendar');
    expect(labels('rostr')[0]).toBe('Roster');
  });

  it('with nothing typed, keeps the groups and rows as written', () => {
    const idle = rankCommands(commands, '', ['goto']);
    expect(idle.map((g) => g.group)).toEqual(['goto']);
    expect(idle[0]?.rows.map((r) => r.id)).toEqual(commands.filter((c) => c.group === 'goto').map((c) => c.id));
  });
});
