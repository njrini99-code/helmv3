import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digestRunOutcome } from '../outcome';

describe('digestRunOutcome — where the briefing went lives on the heartbeat, not in the error feed', () => {
  // Production b07625a4: a SUCCESSFUL send wrote a daily admin_events
  // `event_type = 'error'` row ("admin-digest sent <id> to <address>") just to
  // record the recipient. Close resolved it as NOT A DEFECT every morning and
  // it recurred at 11:00Z the next day (reopened twice by 2026-10-08).
  // recordJobRun keeps only top-level scalars of the route's JSON, so the
  // recipients array was dropped from the heartbeat and the error row was the
  // only place the address survived.
  it('flattens recipients to one scalar the heartbeat keeps', () => {
    expect(
      digestRunOutcome({ sent: true, skipped: false, messageId: 'm-1', recipients: ['a@x.test', 'b@x.test'] }),
    ).toEqual({ sent: true, skipped: false, messageId: 'm-1', recipients: 'a@x.test, b@x.test' });
  });

  it('keeps the failure reason and says so when nothing was configured', () => {
    expect(digestRunOutcome({ sent: false, skipped: true, reason: 'missing-recipient' })).toEqual({
      sent: false,
      skipped: true,
      reason: 'missing-recipient',
      recipients: '(none configured)',
    });
  });

  it('every value is a scalar, so recordJobRun persists all of it', () => {
    const outcome = digestRunOutcome({ sent: true, skipped: false, recipients: ['a@x.test'] });
    for (const value of Object.values(outcome)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });

  it('the admin-digest route no longer writes a success row into the error feed', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/cron/admin-digest/route.ts'), 'utf8');
    expect(route).not.toMatch(/admin-digest sent/);
    expect(route).toMatch(/digestRunOutcome\(/);
  });
});
