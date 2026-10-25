import { describe, expect, it } from 'vitest';
import {
  composeClassSummary,
  defaultHoldSpec,
  holdSpecFor,
  readHoldSpec,
  summaryCollapseId,
  SUMMARY_BODY_MAX,
  type HeldRow,
} from '../class-hold-core';

const BASE = 'https://helm.test';
const CONV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let n = 0;
const row = (over: Partial<HeldRow> & { group_key: string; notification_type: string }): HeldRow => ({
  id: `r${++n}`,
  title: 't',
  body: 'b',
  data: null,
  conversation_id: null,
  held_at: new Date(Date.UTC(2026, 9, 26, 15, 0, n)).toISOString(),
  ...over,
});
const dm = (sender: string, preview: string, conv = CONV_A) =>
  row({ group_key: 'coach_dm', notification_type: 'new_message', conversation_id: conv, data: { senderName: sender, preview } });
const compose = (rows: HeldRow[], titles: Record<string, string> = {}) => composeClassSummary(rows, { baseUrl: BASE, titles, collapseId: 'class-2026-10-26-1550' });

describe('readHoldSpec', () => {
  it('reads bypass, a well formed instruction, and nothing else', () => {
    expect(readHoldSpec('bypass')).toBe('bypass');
    expect(readHoldSpec({ group: 'group', conversationId: CONV_A, messageId: CONV_B, expiresAt: '2026-10-26T16:00:00Z', dedupeKey: 'k' })).toEqual({
      group: 'group', conversationId: CONV_A, messageId: CONV_B, expiresAt: '2026-10-26T16:00:00.000Z', dedupeKey: 'k',
    });
    for (const bad of [undefined, null, 5, 'hold', [], {}, { group: 'nope' }, { group: 'events', conversationId: 'not-a-uuid', expiresAt: 'soon' }]) {
      const spec = readHoldSpec(bad);
      // A bad group reads as no instruction; bad optional fields are dropped, never guessed.
      if (spec) expect(spec).toEqual({ group: 'events' });
    }
  });
});

describe('defaultHoldSpec', () => {
  it('never holds an urgent announcement, holds every other', () => {
    expect(defaultHoldSpec('team_announcement', { urgency: 'urgent' })).toBe('bypass');
    expect(defaultHoldSpec('team_announcement', { urgency: 'high' })).toEqual({ group: 'announcements' });
    expect(defaultHoldSpec('team_announcement', {})).toEqual({ group: 'announcements' });
  });

  it('holds events and tasks with their time as the expiry', () => {
    expect(defaultHoldSpec('event_rsvp_reminder', { eventDate: '2026-10-26T15:30:00Z' })).toEqual({ group: 'events', expiresAt: '2026-10-26T15:30:00.000Z' });
    expect(defaultHoldSpec('qualifier_created', { startDate: 'Oct 30' })).toEqual({ group: 'events' });
    expect(defaultHoldSpec('task_reminder', { dueAt: '2026-10-26T20:00:00Z' })).toEqual({ group: 'tasks', expiresAt: '2026-10-26T20:00:00.000Z' });
  });

  it('holds a player insight, and leaves coaches and unknown types alone (fail open)', () => {
    expect(defaultHoldSpec('coachhelm_insight', { audience: 'player' })).toEqual({ group: 'coachhelm' });
    for (const t of ['coachhelm_insight', 'round_submitted', 'task_assigned', 'task_completed', 'dev_plan_assigned', 'new_message', 'brand_new_type']) {
      expect(defaultHoldSpec(t, {})).toBeUndefined();
    }
  });

  it('never holds the summary itself', () => {
    expect(defaultHoldSpec('class_summary', {})).toBe('bypass');
  });

  it('the sender wins over the default', () => {
    expect(holdSpecFor('team_announcement', { urgency: 'urgent', hold: { group: 'announcements' } })).toEqual({ group: 'announcements' });
    expect(holdSpecFor('new_message', { hold: 'bypass' })).toBe('bypass');
    expect(holdSpecFor('new_message', { hold: { group: 'coach_dm', conversationId: CONV_A } })).toEqual({ group: 'coach_dm', conversationId: CONV_A });
  });
});

describe('composeClassSummary', () => {
  it('orders groups announcements, events, coach DMs, groups, tasks, insights, other and joins with a middle dot', () => {
    const rows = [
      row({ group_key: 'other', notification_type: 'x' }),
      row({ group_key: 'tasks', notification_type: 'task_reminder' }),
      dm('Coach Rivera', 'Can you confirm Saturday tee times'),
      row({ group_key: 'events', notification_type: 'event_rsvp_reminder', body: 'Practice moved to 3:30 PM' }),
      row({ group_key: 'announcements', notification_type: 'team_announcement', body: 'Bus leaves at 6' }),
    ];
    const s = compose(rows);
    expect(s.title).toBe('While you were in class');
    expect(s.body).toBe('Announcement: Bus leaves at 6 · Practice moved to 3:30 PM · Coach Rivera: Can you confirm Saturday tee times · 1 task · 1 update');
    expect(s.threadId).toBe('class-summary');
    expect(s.interruptionLevel).toBe('active');
    expect(s.relevanceScore).toBe(0.6);
    expect(s.collapseId).toBe('class-2026-10-26-1550');
  });

  it('applies the line rules per group', () => {
    const ann = (b: string) => row({ group_key: 'announcements', notification_type: 'team_announcement', body: b });
    expect(compose([ann('A'), ann('B')]).body).toBe('2 announcements');
    const ev = (b: string) => row({ group_key: 'events', notification_type: 'event_rsvp_reminder', body: b });
    expect(compose([ev('A'), ev('B'), ev('C')]).body).toBe('3 schedule updates');
    expect(compose([dm('Coach Rivera', 'one'), dm('Coach Rivera', 'two')]).body).toBe('2 messages from Coach Rivera');
    expect(compose([dm('Coach Rivera', 'one'), dm('Coach Kim', 'two')]).body).toBe('2 messages from coaches');
    const grp = (conv: string) => row({ group_key: 'group', notification_type: 'new_message', conversation_id: conv });
    expect(compose([grp(CONV_A), grp(CONV_A), grp(CONV_A)], { [CONV_A]: 'Pinehurst travel' }).body).toBe('3 messages from Pinehurst travel');
    expect(compose([grp(CONV_A), grp(CONV_B)], { [CONV_A]: 'Pinehurst travel' }).body).toBe('2 messages in 2 chats');
    const insight = row({ group_key: 'coachhelm', notification_type: 'coachhelm_insight' });
    expect(compose([insight, insight]).body).toBe('2 insights');
  });

  it('trims a single message preview to 60 characters', () => {
    const body = compose([dm('Coach Rivera', 'x'.repeat(100)), row({ group_key: 'tasks', notification_type: 'task_reminder' })]).body;
    expect(body.split(' · ')[0]).toBe(`Coach Rivera: ${'x'.repeat(59)}…`);
  });

  it('cuts whole segments at 150 characters and counts what it left out', () => {
    const rows = [
      row({ group_key: 'announcements', notification_type: 'team_announcement', body: 'A'.repeat(80) }),
      dm('Coach Rivera', 'B'.repeat(59)),
      row({ group_key: 'tasks', notification_type: 'task_reminder' }),
      row({ group_key: 'tasks', notification_type: 'task_reminder' }),
    ];
    const s = compose(rows);
    expect(s.body.length).toBeLessThanOrEqual(SUMMARY_BODY_MAX);
    expect(s.body.startsWith(`Announcement: ${'A'.repeat(80)}`)).toBe(true);
    expect(s.body.endsWith(' and 3 more')).toBe(true);
    expect(s.body).not.toContain('tasks');
  });

  it('never exceeds 150 characters, even when one line alone is too long', () => {
    const s = compose([row({ group_key: 'announcements', notification_type: 'team_announcement', body: 'Z'.repeat(400) }), row({ group_key: 'tasks', notification_type: 'task_reminder' })]);
    expect(s.body.length).toBeLessThanOrEqual(SUMMARY_BODY_MAX);
    expect(s.body.endsWith(' and 1 more')).toBe(true);
  });

  it('links to the one conversation, the inbox for several messages, Home for anything else', () => {
    expect(compose([dm('A', 'x'), dm('A', 'y')]).link).toBe(`${BASE}/golf/dashboard/messages?conversation=${CONV_A}`);
    expect(compose([dm('A', 'x', CONV_A), dm('B', 'y', CONV_B)]).link).toBe(`${BASE}/golf/dashboard/messages`);
    expect(compose([dm('A', 'x'), row({ group_key: 'tasks', notification_type: 'task_reminder' })]).link).toBe(`${BASE}/golf/dashboard`);
  });

  it('never names a class', () => {
    const rows = [dm('Coach Rivera', 'See you after STAT 201'), row({ group_key: 'tasks', notification_type: 'task_reminder' })];
    // The preview is the coach's own words; the composer adds nothing about a class, and its title is the fixed one.
    const s = compose(rows);
    expect(s.title).not.toMatch(/STAT|class name/i);
    expect(s.body.replace(/See you after STAT 201/, '')).not.toMatch(/STAT|\bMATH\b|\bENG\b/);
  });
});

describe('summaryCollapseId', () => {
  it('is the date and the release minute', () => {
    expect(summaryCollapseId(new Date(Date.UTC(2026, 9, 6, 9, 5)))).toBe('class-2026-10-06-0905');
  });
});
