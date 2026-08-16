// =============================================================================
// src/lib/baseball/__tests__/class-conflict-engine.test.ts
//
// Direct unit coverage for detectClassConflictsForPlayer — closes the
// timezone gap: classes store program-local wall-clock time, but team
// obligations (baseball_events.start_time) are ISO UTC timestamps. Comparing
// them requires knowing the program's IANA timezone; without it, weekdayOf/
// clockMinutesOf previously fell back to the SERVER's runtime zone (UTC on
// Vercel — no TZ override anywhere in the repo), which is off by the
// program's UTC offset (4-8h for US teams) and can even flip the weekday for
// evening obligations near local midnight.
//
// These tests are written to be TZ-independent where the fix requires it:
// when an explicit IANA `timeZone` is supplied, results must be identical no
// matter what zone the test RUNNER's process is in (verified by running this
// file under TZ=UTC, TZ=Pacific/Kiritimati (UTC+14), and TZ=Pacific/Midway
// (UTC-11) — see the class-conflict-engine timezone fix report).
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  detectClassConflictsForPlayer,
  type ClassInput,
  type ObligationInput,
  type PlayerConflictContext,
} from '@/lib/baseball/class-conflict-engine';

/** A single 9:00-10:00 Monday class — the shape stored in baseball_player_classes. */
function mondayMorningClass(overrides: Partial<ClassInput> = {}): ClassInput {
  return {
    classId: 'class-1',
    playerId: 'player-1',
    className: 'CHEM 101',
    days: ['Mon'],
    startTime: '09:00',
    endTime: '10:00',
    ...overrides,
  };
}

const basePlayerCtx: PlayerConflictContext = { playerId: 'player-1' };

describe('detectClassConflictsForPlayer — program timezone', () => {
  // ---------------------------------------------------------------------
  // The bug, reproduced exactly as the real (fixed) caller used to invoke
  // this engine: runClassConflictDetection (video-classes.ts) called it with
  // NO options at all, so `opts.timeZone` was always undefined. A mandatory
  // team obligation at 2026-08-17T13:00:00Z is 09:00 America/New_York (EDT)
  // — a full-overlap hard conflict against the 09:00-10:00 Monday class —
  // but the engine had no way to know that without a timezone.
  // ---------------------------------------------------------------------
  it('never fabricates a conflict from an unknown program timezone (honest skip, not a server-zone guess)', () => {
    const classes = [mondayMorningClass()];
    const obligations: ObligationInput[] = [
      {
        kind: 'practice',
        id: 'obligation-1',
        label: 'Team Practice',
        startsAt: '2026-08-17T13:00:00.000Z', // 09:00 America/New_York (EDT)
        endsAt: '2026-08-17T14:00:00.000Z',
        isMandatory: true,
      },
    ];

    // No `opts` at all — mirrors the real broken call site.
    const conflicts = detectClassConflictsForPlayer(classes, obligations, basePlayerCtx);

    // HONESTY: an unknown program timezone must never be silently treated as
    // the server's runtime zone. The correct behavior is to emit NO conflict
    // (a data-quality gap upstream), never a conflict computed against the
    // wrong clock — that is exactly the "false high" this engine promises
    // never to emit (see file header, lines ~20-30).
    expect(conflicts).toEqual([]);
  });

  it('never fabricates a false hard conflict from a UTC-coincidental overlap when the program timezone is unknown', () => {
    // 2026-08-17T09:30:00Z is truly 05:30-06:30 America/New_York (EDT) — NOT
    // during the 09:00-10:00 class. But a server running in UTC (Vercel's
    // default, with no timeZone threaded) reads the UTC clock fields
    // (09:30-10:30) as if they were the class's local wall-clock and finds a
    // 30-minute overlap: a FALSE "hard" conflict, exactly what this engine's
    // honesty header (lines ~20-30) forbids emitting.
    const classes = [mondayMorningClass()];
    const obligations: ObligationInput[] = [
      {
        kind: 'practice',
        id: 'obligation-4',
        label: 'Early Lift (server-UTC-coincidental)',
        startsAt: '2026-08-17T09:30:00.000Z', // 05:30 America/New_York (EDT)
        endsAt: '2026-08-17T10:30:00.000Z', // 06:30 America/New_York
        isMandatory: true,
      },
    ];

    const conflicts = detectClassConflictsForPlayer(classes, obligations, basePlayerCtx);

    expect(conflicts).toEqual([]);
  });

  it('detects the hard conflict once the program timezone is threaded through (EDT / America/New_York, August)', () => {
    const classes = [mondayMorningClass()];
    const obligations: ObligationInput[] = [
      {
        kind: 'practice',
        id: 'obligation-1',
        label: 'Team Practice',
        startsAt: '2026-08-17T13:00:00.000Z', // 09:00 America/New_York (EDT, UTC-4)
        endsAt: '2026-08-17T14:00:00.000Z', // 10:00 America/New_York
        isMandatory: true,
      },
    ];

    const conflicts = detectClassConflictsForPlayer(classes, obligations, basePlayerCtx, {
      timeZone: 'America/New_York',
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      severity: 'hard',
      classDay: 'Mon',
      overlapMinutes: 60,
    });
    // Recurring-by-weekday class side -> confidence must stay < 0.7 even for
    // the most certain (hard) severity — the file's non-negotiable cap.
    expect(conflicts[0]!.confidence).toBeLessThan(0.7);
  });

  it('detects the hard conflict in EST (America/New_York, January — no DST)', () => {
    const classes = [mondayMorningClass()];
    const obligations: ObligationInput[] = [
      {
        kind: 'practice',
        id: 'obligation-2',
        label: 'Team Practice',
        startsAt: '2026-01-05T14:00:00.000Z', // 09:00 America/New_York (EST, UTC-5)
        endsAt: '2026-01-05T15:00:00.000Z', // 10:00 America/New_York
        isMandatory: true,
      },
    ];

    const conflicts = detectClassConflictsForPlayer(classes, obligations, basePlayerCtx, {
      timeZone: 'America/New_York',
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      severity: 'hard',
      classDay: 'Mon',
      overlapMinutes: 60,
    });
  });

  it('resolves the obligation weekday in program-local time, not the UTC calendar day (near-midnight flip)', () => {
    // A late class, Monday 22:00-23:00 local. The obligation instant lands on
    // TUESDAY in UTC (02:30Z) but is still MONDAY 22:30 in America/New_York
    // (EDT, UTC-4). A UTC-naive weekday read would silently miss this as a
    // day mismatch against the Monday class.
    const classes = [
      mondayMorningClass({ startTime: '22:00', endTime: '23:00' }),
    ];
    const obligations: ObligationInput[] = [
      {
        kind: 'event',
        id: 'obligation-3',
        label: 'Late Study Hall',
        startsAt: '2026-08-18T02:30:00.000Z', // Tue 02:30 UTC = Mon 22:30 EDT
        endsAt: '2026-08-18T03:00:00.000Z',
        isMandatory: true,
      },
    ];

    const conflicts = detectClassConflictsForPlayer(classes, obligations, basePlayerCtx, {
      timeZone: 'America/New_York',
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.classDay).toBe('Mon');
    expect(conflicts[0]!.severity).toBe('hard');
  });

  it('an empty-string timezone is treated the same as unknown (honest skip)', () => {
    const classes = [mondayMorningClass()];
    const obligations: ObligationInput[] = [
      {
        kind: 'practice',
        id: 'obligation-1',
        label: 'Team Practice',
        startsAt: '2026-08-17T13:00:00.000Z',
        endsAt: '2026-08-17T14:00:00.000Z',
        isMandatory: true,
      },
    ];

    const conflicts = detectClassConflictsForPlayer(classes, obligations, basePlayerCtx, {
      timeZone: '   ',
    });

    expect(conflicts).toEqual([]);
  });
});
