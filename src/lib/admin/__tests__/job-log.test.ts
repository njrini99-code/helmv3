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
