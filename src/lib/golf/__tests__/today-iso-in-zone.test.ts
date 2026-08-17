/**
 * "Is this task overdue?" is a binary, user-visible claim, and CoachHelm was
 * answering it against UTC's calendar day rather than the TEAM's.
 *
 * Two live sites shared the expression:
 *
 *   src/lib/coachhelm/v3/chat/read-tools.ts:1031   (get_open_tasks tool)
 *   src/lib/coachhelm/v3/chat/program-pulse.ts:330 (the Brief's
 *                                                  "N tasks are overdue" card)
 *
 *     const today = new Date().toISOString().slice(0, 10);
 *     const overdue = rows.filter((t) => String(t.due_date).slice(0, 10) < today);
 *
 * `due_date` is a calendar date. `toISOString()` is UTC. So from 20:00 EDT
 * onward — the hours a college coach is most likely to be reviewing tomorrow's
 * plan — UTC has already rolled over and a task due TODAY is reported overdue.
 * Eastward of UTC the error inverts: a genuinely late task is not yet flagged.
 *
 * `CoachChatContext.timezone` is NOT NULL (from `golf_teams.timezone`) and was
 * available at both call sites — `read-tools.ts` already passes it through as
 * `detail.timezone` a few lines above. It simply was not used for this.
 */
import { describe, it, expect } from 'vitest';
import { todayIsoInZone } from '@/lib/golf/timezone';

/** 2026-08-17 21:00 America/New_York — the same instant is already 08-18 in UTC. */
const EVENING_IN_NY = new Date('2026-08-18T01:00:00Z');

/** The exact expression both production sites used. */
const utcToday = (now: Date) => now.toISOString().slice(0, 10);

/** The production overdue predicate, parameterised on whatever "today" is. */
const isOverdue = (dueDate: string, today: string) => String(dueDate).slice(0, 10) < today;

describe('todayIsoInZone', () => {
  it('reads the calendar day in the TEAM zone, not the runtime zone', () => {
    expect(todayIsoInZone('America/New_York', EVENING_IN_NY)).toBe('2026-08-17');
    expect(todayIsoInZone('UTC', EVENING_IN_NY)).toBe('2026-08-18');
  });

  it('disagrees with the UTC expression exactly when the bug bites', () => {
    // Not a tautology — this is the gap that made the claim wrong.
    expect(utcToday(EVENING_IN_NY)).toBe('2026-08-18');
    expect(todayIsoInZone('America/New_York', EVENING_IN_NY)).not.toBe(utcToday(EVENING_IN_NY));
  });

  it('stops a task due TODAY being called overdue on the evening of its due date', () => {
    const dueToday = '2026-08-17';

    // What production did: UTC has rolled over, so "today" is already the 18th.
    expect(isOverdue(dueToday, utcToday(EVENING_IN_NY))).toBe(true);

    // What the coach sees on the wall: it is still the 17th, nothing is late.
    expect(isOverdue(dueToday, todayIsoInZone('America/New_York', EVENING_IN_NY))).toBe(false);
  });

  it('still flags a genuinely late task', () => {
    const dueYesterday = '2026-08-16';
    expect(isOverdue(dueYesterday, todayIsoInZone('America/New_York', EVENING_IN_NY))).toBe(true);
  });

  it('handles the far-east inversion too', () => {
    // Pacific/Kiritimati is +14: local is ALREADY the 18th while UTC says 17th.
    const morningUtc = new Date('2026-08-17T11:00:00Z'); // 2026-08-18 01:00 in +14
    expect(todayIsoInZone('Pacific/Kiritimati', morningUtc)).toBe('2026-08-18');
    expect(utcToday(morningUtc)).toBe('2026-08-17');
    // A task due the 17th IS late for that team, and UTC would have missed it.
    expect(isOverdue('2026-08-17', todayIsoInZone('Pacific/Kiritimati', morningUtc))).toBe(true);
    expect(isOverdue('2026-08-17', utcToday(morningUtc))).toBe(false);
  });

  it('falls back to the UTC day rather than throwing on a junk zone', () => {
    // A bad `golf_teams.timezone` must degrade, never take the tool down.
    expect(todayIsoInZone('Not/AZone', EVENING_IN_NY)).toBe('2026-08-18');
    expect(todayIsoInZone('', EVENING_IN_NY)).toBe('2026-08-18');
  });
});
