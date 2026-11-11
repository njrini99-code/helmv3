import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));

import { generatePushPayload } from '@/lib/notifications/push';
import type { PlanBodyV2 } from '../../practice-plan/model';
import { eventInviteDelivery, firstStopLine, focusDelivery, goalDelivery, goalTitleOf, longDay, planChatPost, qualifierDelivery, seriesInviteDelivery, taskDelivery } from '../card-truth';

/**
 * The card quotes what a player receives. Where the sender only formats (`generatePushPayload`) the card calls it, and
 * the first block holds the two to the same output. Where the words sit inside a sender that cannot be called without
 * sending, the card repeats them, and the second block reads the sender's own source: change the words there and this
 * fails until the card says the same.
 */
const src = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('the words on the card are the words that are sent', () => {
  it('an event invitation is the push the fan-out sends', () => {
    const d = eventInviteDelivery({ title: 'Short-game practice', date: '2026-11-12', location: 'Range' });
    expect({ title: d.title, body: d.body }).toEqual((({ title, body }) => ({ title, body }))(generatePushPayload('event_rsvp_reminder', { eventName: 'Short-game practice', eventId: 'x' })));
    expect(d.body).toBe('Please RSVP for Short-game practice');
    // The fan-out sends that payload type with the event's own title.
    expect(src('src/lib/calendar/fan-out.ts')).toContain("sendBulkPushNotification('event_rsvp_reminder', userIds, {\n        eventName: p.title,");
  });

  it('an event invitation: the bell row and the email\u2019s subject as the fan-out and the template write them', () => {
    const d = eventInviteDelivery({ title: 'Short-game practice', date: '2026-11-12', location: 'Range' });
    expect(d.variants).toEqual([{ channel: 'in_app', title: 'New event: Short-game practice', body: '2026-11-12 at Range' }]);
    expect(eventInviteDelivery({ title: 'Short-game practice', date: '2026-11-12', location: null }).variants?.[0]?.body).toBe('2026-11-12');
    expect(d.note).toContain('\u201cRSVP needed: Short-game practice\u201d');
    // The bell row's two lines, and the day the action hands the fan-out.
    const fanOut = src('src/lib/calendar/fan-out.ts');
    expect(fanOut).toContain('title: p.inAppTitle ?? `New event: ${p.title}`,');
    expect(fanOut).toContain("message: p.inAppMessage ?? `${p.dateLabel}${p.location ? ` at ${p.location}` : ''}`,");
    const action = src('src/app/golf/actions/calendar-events.ts');
    expect(action).toContain('dateLabel: validatedData.startDate,');
    expect(action).toContain("location: validatedData.location || '',");
    // The email the fan-out sends is the reply reminder, and this is its subject.
    expect(fanOut).toContain("sendEmailNotification('event_rsvp_reminder', u.id, u.email, {\n            eventName: p.title,");
    expect(src('src/lib/notifications/email.ts')).toContain('subject: `RSVP needed: ${eventName}`,');
  });

  it('a repeating practice: the same push, and the bell row as the action writes it', () => {
    const d = seriesInviteDelivery({ title: 'Team practice', start_date: '2026-11-12', location: 'Range' });
    expect(d.body).toBe(generatePushPayload('event_rsvp_reminder', { eventName: 'Team practice' }).body);
    expect(d.variants).toEqual([{ channel: 'in_app', title: 'New event: Team practice', body: '2026-11-12 at Range' }]);
    expect(seriesInviteDelivery({ title: 'Team practice', start_date: '2026-11-12', location: null }).variants?.[0]?.body).toBe('2026-11-12');
    const action = src('src/app/golf/actions/recurring-events.ts');
    expect(action).toContain('title: `New event: ${fanOutTitle}`,');
    expect(action).toContain("message: `${fanOutStartDate}${fanOutLocation ? ` at ${fanOutLocation}` : ''}`,");
    expect(action).toContain("sendBulkPushNotification('event_rsvp_reminder', userIds, {");
  });

  it('a qualifier: the push the action sends and the bell row of notifyQualifierCreated', () => {
    const d = qualifierDelivery('Fall qualifier', '2026-11-15');
    expect({ title: d.title, body: d.body }).toEqual({ title: 'New Qualifier Posted', body: 'Fall qualifier' });
    expect(d.variants).toEqual([{ channel: 'in_app', title: 'New qualifier', body: `Fall qualifier starts ${longDay('2026-11-15')}` }]);
    const action = src('src/app/golf/actions/qualifier-actions.ts');
    expect(action).toContain("'qualifier_created',");
    expect(action).toContain('{ qualifierName: validatedData.name, startDate: formattedDate }');
    expect(action).toContain("new Date(validatedData.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })");
    const notify = src('src/lib/notifications/index.ts');
    expect(notify).toContain("title: 'New qualifier',\n    body: `${qualifierName} starts ${startDate}`,");
  });

  it('a goal: notifyCoachAssignedGoal sends the title the task saves', () => {
    expect(goalDelivery(goalTitleOf('Greens', 30))).toMatchObject({ title: 'New goal from your coach', body: 'Greens, 30-day goal' });
    expect(src('src/lib/coachhelm/v3/notifications/notify.ts')).toContain("category: 'coach_assigned_goal',\n    title: 'New goal from your coach',\n    body: args.goal_title,");
    expect(src('src/app/golf/actions/v3/goals.ts')).toContain('await notifyCoachAssignedGoal({ player_id, goal_id: data.id, goal_title: input.title });');
  });

  it('a focus area: notifyDevPlanAssigned, signed with the coach’s name or "Your Coach"', () => {
    expect(focusDelivery('Sam Reyes', 'Lag putting')).toMatchObject({ title: 'New focus area', body: 'Sam Reyes assigned "Lag putting"' });
    expect(focusDelivery('  ', 'Lag putting').body).toBe('Your Coach assigned "Lag putting"');
    expect(src('src/lib/notifications/index.ts')).toContain("title: 'New focus area',\n    body: `${coachName} assigned \"${planTitle}\"`,");
    expect(src('src/app/golf/actions/development.ts')).toContain("coachName?.trim() || 'Your Coach',");
  });

  it('a task: notifyTaskAssigned, with the due date as createTask formats it', () => {
    expect(taskDelivery('Log your rounds', null)).toMatchObject({ title: 'New task', body: 'Log your rounds' });
    expect(taskDelivery('Log your rounds', '2026-11-20').body).toBe(`Log your rounds, due ${longDay('2026-11-20')}`);
    expect(src('src/lib/notifications/index.ts')).toContain("title: 'New task',\n    body: dueDate ? `${taskTitle}, due ${dueDate}` : taskTitle,");
    expect(src('src/app/golf/actions/tasks.ts')).toContain("? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })");
  });

  it('a published plan: each player’s own first stop, as the action writes it', () => {
    const body: PlanBodyV2 = {
      v: 2,
      focus: '',
      notes: '',
      place: 'Range',
      arrivalBufferMin: 15,
      bring: [],
      players: ['p1', 'p2'],
      groups: [{ id: 'g1', name: 'A', players: ['p1'], savedGroupId: null }],
      variants: { main: { blocks: [{ id: 'b1', kind: 'team', title: 'Warm up', len: 20, coach: null, note: '', place: 'Putting green', drill: null }] }, rain: null },
    };
    const start = new Date('2026-11-12T20:00:00Z');
    expect(firstStopLine(body, 'p1', start, '3:00 PM')).toBe('3:00 PM · You start on Putting green with Group A');
    expect(firstStopLine(body, 'p2', start, '3:00 PM')).toBe('3:00 PM · You start on Putting green');
    expect(firstStopLine(body, null, start, '3:00 PM')).toBe('3:00 PM · Open the plan to see where you start');
    const action = src('src/app/golf/actions/practice-publish.ts');
    expect(action).toContain('const fallback = `${time} · Open the plan to see where you start`;');
    expect(action).toContain("const line = first ? `${time} · You start on ${first.place}${group ? ` with Group ${group.name}` : ''}` : fallback;");
    expect(action).toContain('`Practice plan for ${word}`');
    expect(action).toContain('title: `${word}’s plan changed`, body: changes?.changes[0]?.line ?? \'Open the plan to see what changed\'');
    expect(action).toContain("const word = when(event?.start_time ?? new Date().toISOString(), zone, { weekday: 'long' });");
    expect(action).toContain("const time = when(event?.start_time ?? new Date().toISOString(), zone, { hour: 'numeric', minute: '2-digit' });");
  });

  it('the Team chat post is one sentence and the plan’s address', () => {
    expect(planChatPost('Thursday practice', 'Thursday, Nov 12 · 3:00 PM', 'https://app.example', 'plan-1')).toBe('Thursday practice is published. Thursday, Nov 12 · 3:00 PM. https://app.example/golf/dashboard/practice/plan/plan-1');
    expect(planChatPost('Thursday practice', null, 'https://app.example', 'plan-1')).toBe('Thursday practice is published. https://app.example/golf/dashboard/practice/plan/plan-1');
  });
});
