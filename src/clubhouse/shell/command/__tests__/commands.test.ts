// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { actionsFor, buildCommands, nearestSection, peopleCommands } from '../commands';
import { noteVisit, readRecent, resetRecent } from '../recent';
import { isRebuilt } from '../../nav';

const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe('what each role is offered', () => {
  it('a coach is never offered a player action, and a player never a coach one', () => {
    const coach = ids(actionsFor('coach'));
    const player = ids(actionsFor('player'));
    expect(coach).toEqual(['action:new-event', 'action:new-message', 'action:post-announcement', 'action:new-qualifier']);
    expect(player).toEqual(['action:new-round', 'action:new-message', 'action:add-class']);
    for (const coachOnly of ['action:new-event', 'action:post-announcement', 'action:new-qualifier']) expect(player).not.toContain(coachOnly);
    for (const playerOnly of ['action:new-round', 'action:add-class']) expect(coach).not.toContain(playerOnly);
  });

  it('every action and section goes to a screen rebuilt for the role', () => {
    for (const role of ['coach', 'player'] as const) {
      const all = buildCommands({ role, pathname: '/golf/dashboard', people: [{ id: 'p1', name: 'Jonah Okafor' }], recent: [] });
      for (const c of all) expect(isRebuilt(c.href.split('?')[0]!, role) || c.group === 'goto', `${role} ${c.id} ${c.href}`).toBe(true);
    }
  });

  it('lists only the sections the role has in Go to', () => {
    const coach = ids(buildCommands({ role: 'coach', pathname: '/golf/dashboard', people: [], recent: [] }).filter((c) => c.group === 'goto'));
    const player = ids(buildCommands({ role: 'player', pathname: '/golf/dashboard', people: [], recent: [] }).filter((c) => c.group === 'goto'));
    expect(coach).toContain('goto:recruiting');
    expect(coach).not.toContain('goto:rounds');
    expect(coach).not.toContain('goto:classes');
    expect(player).toContain('goto:rounds');
    expect(player).toContain('goto:classes');
    expect(player).not.toContain('goto:recruiting');
    expect(coach).toContain('goto:settings');
  });

  it('draws each section\'s G shortcut', () => {
    const roster = buildCommands({ role: 'coach', pathname: '/golf/dashboard', people: [], recent: [] }).find((c) => c.id === 'goto:roster');
    expect(roster?.keys).toEqual(['G', 'R']);
  });

  it('lists a coach\'s players and a player\'s teammates never (the player roster opens nothing)', () => {
    const people = [{ id: 'p1', name: 'Jonah Okafor' }];
    expect(peopleCommands('coach', people).map((c) => c.href)).toEqual(['/golf/dashboard/stats?player=p1']);
    expect(peopleCommands('player', people)).toEqual([]);
  });

  it('leaves out the section you are in from Recent, and keeps five', () => {
    const recent = ['home', 'roster', 'stats', 'calendar', 'messages', 'hub'].map((id) => ({ id, href: '/x' }));
    const out = buildCommands({ role: 'coach', pathname: '/golf/dashboard/roster', people: [], recent }).filter((c) => c.group === 'recent');
    expect(ids(out)).toEqual(['recent:home', 'recent:stats', 'recent:calendar', 'recent:messages', 'recent:hub']);
  });

  it('never replays a recent section the role does not have', () => {
    const out = buildCommands({ role: 'coach', pathname: '/golf/dashboard', people: [], recent: [{ id: 'rounds', href: '/x' }, { id: 'stats', href: '/x' }] });
    expect(ids(out.filter((c) => c.group === 'recent'))).toEqual(['recent:stats']);
  });
});

describe('recent destinations', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    resetRecent();
  });

  it('notes sections, newest first, once each', () => {
    noteVisit('u1', 'coach', '/golf/dashboard');
    noteVisit('u1', 'coach', '/golf/dashboard/roster');
    noteVisit('u1', 'coach', '/golf/dashboard/stats');
    noteVisit('u1', 'coach', '/golf/dashboard/roster');
    expect(readRecent('u1').map((r) => r.id)).toEqual(['roster', 'stats', 'home']);
  });

  it('counts a page below a section as the section, and a page outside every section as nothing', () => {
    noteVisit('u1', 'coach', '/golf/dashboard/qualifiers/new');
    noteVisit('u1', 'coach', '/golf/dashboard/somewhere-else');
    expect(readRecent('u1').map((r) => r.id)).toEqual(['qualifiers']);
  });

  it('keeps one person\'s sections from another\'s in the same tab', () => {
    noteVisit('u1', 'coach', '/golf/dashboard/roster');
    expect(readRecent('u2')).toEqual([]);
    resetRecent();
    expect(readRecent('u1').map((r) => r.id)).toEqual(['roster']);
  });
});

describe('no results', () => {
  it('suggests the section nearest what was typed', () => {
    expect(nearestSection('rost', 'coach')?.id).toBe('roster');
    expect(nearestSection('statz', 'coach')?.id).toBe('stats');
    expect(nearestSection('mesages', 'player')?.id).toBe('messages');
    expect(nearestSection('', 'coach')).toBeNull();
    expect(nearestSection('qqqqqqqqqq', 'coach')).toBeNull();
  });

  it('does not suggest a section the role does not have', () => {
    expect(nearestSection('rounds', 'coach')?.id).not.toBe('rounds');
  });
});
