import { describe, expect, it } from 'vitest';
import { qcContext, qcScreen, quickStarts } from '../starts';

const ROSTER = '/golf/dashboard/roster';
const eli = { label: 'Roster · Eli Brandt', playerId: 'p1', playerName: 'Eli Brandt' };
const none = (label: string) => ({ label, playerId: null, playerName: null });

/** QUICK-CHAT.md `ST-1.context` and Moment 2: the chip and the starts are for the screen the chat was opened on. */
describe('the context chip', () => {
  it('names the screen and the selection in the page’s own words', () => {
    expect(qcContext(ROSTER, eli)).toMatchObject({ label: 'Roster · Eli Brandt', screen: 'player', playerId: 'p1' });
  });
  it('with nothing selected it names the screen only', () => {
    expect(qcContext('/golf/dashboard/calendar', none('Calendar'))).toMatchObject({ label: 'Calendar', screen: 'calendar', playerId: null });
  });
  it('a screen with nothing to read has no chip at all', () => {
    expect(qcContext('/golf/dashboard', none('Home'))).toBeNull();
    expect(qcContext('/golf/dashboard/settings/notifications', none('Settings'))).toBeNull();
  });
  it('its key is the screen and the selection, so removing one player’s chip does not hide the next player’s', () => {
    const a = qcContext(ROSTER, eli)!.key;
    const b = qcContext(ROSTER, { label: 'Roster · Sofia Alvarez', playerId: 'p2', playerName: 'Sofia Alvarez' })!.key;
    expect(a).not.toBe(b);
    expect(qcContext(ROSTER, eli)!.key).toBe(a);
  });
  it('the Team Hub answers to its own path and its old ones', () => {
    for (const p of ['/golf/dashboard/team-hub', '/golf/dashboard/tasks', '/golf/dashboard/announcements']) expect(qcScreen(p)).toBe('team');
  });
});

describe('starts for this screen', () => {
  it('three on the phone, four on a desk', () => {
    const c = qcContext('/golf/dashboard/stats', none('Stats'));
    expect(quickStarts(c, '/golf/dashboard/stats', { count: 3 })).toHaveLength(3);
    expect(quickStarts(c, '/golf/dashboard/stats', { count: 4 })).toHaveLength(4);
  });
  it('with a player selected they are about that player, by first name', () => {
    const rows = quickStarts(qcContext(ROSTER, eli), ROSTER, { count: 4 });
    expect(rows.map((r) => r.ask)).toEqual(['How is Eli putting?', 'What changed in Eli’s last 3 rounds?', 'Give Eli a focus area', 'Set Eli a task for this week']);
    expect(rows[0]!.does).toBe('Putting · Eli');
  });
  it('a name ending in s takes the apostrophe alone', () => {
    const rows = quickStarts(qcContext(ROSTER, { label: 'Roster · Chris Hale', playerId: 'p3', playerName: 'Chris Hale' }), ROSTER, { count: 4 });
    expect(rows[1]!.ask).toBe('What changed in Chris’ last 3 rounds?');
  });
  it('each screen leads with what that screen is for', () => {
    const lead = (p: string, label: string) => quickStarts(qcContext(p, none(label)), p, { count: 1 })[0]!.id;
    expect(lead('/golf/dashboard/calendar', 'Calendar')).toBe('week');
    expect(lead('/golf/dashboard/qualifiers', 'Qualifiers')).toBe('qualifier');
    expect(lead('/golf/dashboard/messages', 'Messages')).toBe('message');
    expect(lead('/golf/dashboard/team-hub', 'Team Hub')).toBe('team-task');
    expect(lead('/golf/dashboard', 'Home')).toBe('slipping');
  });
  it('with plans off no start offers a plan', () => {
    const p = '/golf/dashboard/calendar';
    expect(quickStarts(qcContext(p, none('Calendar')), p, { count: 4, planOn: false }).map((r) => r.id)).not.toContain('plan');
    expect(quickStarts(qcContext(p, none('Calendar')), p, { count: 4, planOn: true }).map((r) => r.id)).toContain('plan');
  });
});
