import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  logServerEvent: vi.fn(async (..._args: unknown[]) => {}),
  failInsert: false,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        if (mocks.failInsert) return Promise.resolve({ data: null, error: { message: 'insert down' } });
        mocks.inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: mocks.logServerEvent }));

import { recordJobRun, summariseErrorBody } from '@/lib/admin/job-log';

describe('recordJobRun', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.logServerEvent.mockClear();
    mocks.failInsert = false;
  });

  it('passes the result through and writes a completed row', async () => {
    await expect(recordJobRun('event-reminders', async () => 'done')).resolves.toBe('done');
    expect(mocks.inserted[0]).toMatchObject({ job_type: 'event-reminders', status: 'completed' });
    expect(typeof mocks.inserted[0]!.duration_ms).toBe('number');
    expect(mocks.logServerEvent).not.toHaveBeenCalled(); // successes stay out of the feed
  });

  it('rethrows failures after writing a failed row + cron event', async () => {
    const boom = new Error('job blew up');
    await expect(recordJobRun('event-reminders', async () => { throw boom; })).rejects.toBe(boom);
    expect(mocks.inserted[0]).toMatchObject({ job_type: 'event-reminders', status: 'failed', error_message: 'job blew up' });
    const [, ctx] = mocks.logServerEvent.mock.calls[0]!;
    expect(ctx).toMatchObject({ source: 'cron', action: 'cron.event-reminders' });
  });

  it('a broken log table never fails the cron (fire-and-forget)', async () => {
    mocks.failInsert = true;
    await expect(recordJobRun('event-reminders', async () => 42)).resolves.toBe(42);
  });
});

/**
 * On 2026-07-21 Supabase was unreachable and `Cron failed: coachhelm-validation`
 * stored 2000 characters of Cloudflare markup as its error message. The page
 * states its cause in <title>; everything else is boilerplate.
 */
describe('summariseErrorBody', () => {
  // Verbatim head of the production errorDetails value.
  const cloudflare522 = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<!--[if IE 7]>    <html class="no-js ie7 oldie" lang="en-US"> <![endif]-->
<head>

<title>supabase.co | 522: Connection timed out</title>
<meta charset="UTF-8" />
<link rel="stylesheet" id="cf_styles-css" href="/cdn-cgi/styles/main.css" />
</head>
<body><div id="cf-wrapper"><h1>Connection timed out</h1></div></body>
</html>`;

  it('keeps the cause and drops the document', () => {
    const line = summariseErrorBody(cloudflare522, 500);
    expect(line).toBe('HTTP 500 — supabase.co | 522: Connection timed out');
    expect(line).not.toContain('DOCTYPE');
    expect(line).not.toContain('cf_styles');
    expect(line.length).toBeLessThan(120);
  });

  it('works without a status (the thrown-error path)', () => {
    expect(summariseErrorBody(cloudflare522)).toBe(
      'supabase.co | 522: Connection timed out',
    );
  });

  it('names an HTML page that has no title rather than dumping it', () => {
    const line = summariseErrorBody('<html><body>502 Bad Gateway</body></html>', 502);
    expect(line).toBe('HTTP 502 — HTML error page (no title)');
  });

  it('leaves a real message alone, collapsing whitespace', () => {
    expect(summariseErrorBody('canceling statement\n  due to statement timeout')).toBe(
      'canceling statement due to statement timeout',
    );
  });

  it('does not mistake a message that merely mentions html for a document', () => {
    expect(summariseErrorBody('failed to parse <html> in user input')).toBe(
      'failed to parse <html> in user input',
    );
  });
});

describe('recordJobRun error-message hygiene', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.logServerEvent.mockClear();
    mocks.failInsert = false;
  });

  it('stores a Supabase-shaped plain object as its message, not [object Object]', async () => {
    // PostgrestError does not extend Error, so the old `String(err)` produced
    // '[object Object]' — the same defect fixed across the action layer.
    const pgErr = { message: 'deadlock detected', code: '40P01', details: null, hint: null };
    await expect(
      recordJobRun('coachhelm-validation', async () => {
        throw pgErr;
      }),
    ).rejects.toBe(pgErr);

    const row = mocks.inserted[0]!;
    expect(row.error_message).not.toContain('[object Object]');
    expect(row.error_message).toContain('deadlock detected');
    expect(row.error_message).toContain('40P01');
  });
});

/**
 * `extractOutcomeMetadata` exists, per its own docblock, so the admin cron board
 * can "distinguish 'ran and did work' from 'self-skipped'". For 11 of the 19
 * live job types it does not, because it whitelists seven key names and those
 * routes do not happen to use any of them.
 *
 * That is not hypothetical. `v3-genome-nightly` reported `completed` 47 times
 * across six weeks while writing nothing at all — `golf_player_genome` sat
 * frozen at 2026-07-07 — and the ONLY signal that anything was wrong was a
 * ~1,039 ms duration that could not possibly have rebuilt 25 player genomes.
 * `metadata` was null on every one of those rows. The log could not say it had
 * done no work, so nobody could see it.
 *
 * Measured across background_job_logs over 30 days:
 *
 *     runs_with_metadata = 0  for  refresh-engagement, event-reminders,
 *     log-retention, integrity-check, v3-goal-suggestions-evaluate,
 *     coachhelm-insight-lifecycle, coachhelm-calibration,
 *     v3-goal-suggestions-write, v3-causality-attribute, v3-genome-nightly,
 *     v3-standing-refresh
 *
 * Every one of those routes returns useful scalars. None uses a whitelisted
 * name — and `event-reminders` misses by a hair, returning `inserted24h` where
 * the list has `inserted`. A fixed vocabulary of seven keys that every future
 * route must coincidentally adopt is the same shape as the dead metric map in
 * #1488: a lookup table authored against values production does not emit.
 */
describe('recordJobRun outcome metadata — captures what the route actually reports', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.failInsert = false;
  });

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('records the genome cron\'s chunk size — the number that would have exposed the jam', async () => {
    await recordJobRun('v3-genome-nightly', async () =>
      jsonResponse({ players_in_chunk: 0, per_player: [], duration_ms: 1039 }),
    );
    expect(mocks.inserted[0]!.metadata).toMatchObject({ players_in_chunk: 0 });
  });

  it('records the other live crons\' own vocabularies', async () => {
    const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['v3-standing-refresh', { teams_in_chunk: 3, team_ids: ['a'] }, { teams_in_chunk: 3 }],
      [
        'coachhelm-insight-lifecycle',
        { success: true, total: 188, resolved: 12, next_cursor: null },
        { success: true, total: 188, resolved: 12 },
      ],
      [
        'event-reminders',
        { success: true, inserted24h: 4, inserted1h: 0, failed24h: 0 },
        { inserted24h: 4, inserted1h: 0, failed24h: 0 },
      ],
      ['integrity-check', { ok: true, failed: [] }, { ok: true }],
    ];

    for (const [job, body, expected] of cases) {
      mocks.inserted.length = 0;
      await recordJobRun(job, async () => jsonResponse(body));
      expect(mocks.inserted[0]!.metadata, job).toMatchObject(expected);
    }
  });

  it('still captures the keys the old whitelist knew about', async () => {
    // ingest-gmail-replies' self-skip is the case the whitelist was written for
    // and it must keep working — this widens the net, it does not move it.
    await recordJobRun('ingest-gmail-replies', async () =>
      jsonResponse({ skipped: 'not-armed' }),
    );
    expect(mocks.inserted[0]!.metadata).toMatchObject({ skipped: 'not-armed' });
  });

  it('takes scalars only, so an array or object payload cannot bloat the row', async () => {
    await recordJobRun('v3-genome-nightly', async () =>
      jsonResponse({
        players_in_chunk: 2,
        per_player: [{ player_id: 'p1' }, { player_id: 'p2' }],
        nested: { a: 1 },
      }),
    );
    const meta = mocks.inserted[0]!.metadata as Record<string, unknown>;
    expect(meta).toMatchObject({ players_in_chunk: 2 });
    expect(meta.per_player).toBeUndefined();
    expect(meta.nested).toBeUndefined();
  });

  it('bounds a pathological body rather than writing it whole', async () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 200; i += 1) wide[`k${i}`] = i;
    wide.long = 'x'.repeat(5000);

    await recordJobRun('integrity-check', async () => jsonResponse(wide));
    const meta = mocks.inserted[0]!.metadata as Record<string, unknown>;
    expect(Object.keys(meta).length).toBeLessThanOrEqual(24);
    expect(String(meta.long ?? '').length).toBeLessThanOrEqual(300);
  });

  it('leaves metadata null when the body carries no scalars at all', async () => {
    await recordJobRun('log-retention', async () => jsonResponse({ rows: [1, 2, 3] }));
    expect(mocks.inserted[0]!.metadata ?? null).toBeNull();
  });
});
