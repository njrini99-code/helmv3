# W13: Daily Email Digest (dedicated non-CRM transport)

**Goal:** The "coffee check": one email to Nick at 10:00 UTC with overnight errors/regressions, new signups, activity, and anything red — sent through a DEDICATED ops transport (its own secret + its own `src/lib/admin/` module) that touches ZERO `crm_*` tables and ZERO CRM/Resend/Gmail outreach code (owner decision #10).

**Depends-on:** W3 (sentry-api), W11 (`recordJobRun`, registry contract).

**PR-scope:** ONE PR.

**Transport precedent (reground §2.7):** the codebase already isolates Resend clients per surface (`src/lib/email/resend-client.ts` explicitly refuses to reuse `notifications/email.ts`'s client). The digest follows that exact pattern PLUS a stricter bar: its own secret `OPS_DIGEST_RESEND_API_KEY` (never `RESEND_API_KEY`). Whether the owner mints a literal second Resend key or aliases the existing value under the new name is an owner call — flagged in the provisioning checklist.

---

### Task 1 — Pure digest builder

**Files**
- Create: `src/lib/admin/digest/build-digest.ts`
- Create: `src/lib/admin/digest/__tests__/build-digest.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export interface DigestData {
    generatedAt: string;
    errors24h: { total: number; critical: number; topIncidents: Array<{ title: string; occurrences: number; affectedUsers: number }> };
    sentry: { unresolved: number | null; regressed: number | null };  // null = unconfigured
    signups24h: Array<{ email: string; role: string }>;
    activity24h: { golfRounds: number; baseballGames: number; liftSessions: number };
    reds: string[];  // every currently-red condition (failed crons, failed integrity checks, ERROR deploys)
  }
  export interface DigestEmail { subject: string; html: string; text: string; }
  export function buildDigestEmail(data: DigestData): DigestEmail;
  ```

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/digest/__tests__/build-digest.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';

  const base: DigestData = {
    generatedAt: '2026-07-01T10:00:00Z',
    errors24h: { total: 0, critical: 0, topIncidents: [] },
    sentry: { unresolved: 0, regressed: 0 },
    signups24h: [],
    activity24h: { golfRounds: 3, baseballGames: 1, liftSessions: 2 },
    reds: [],
  };

  describe('buildDigestEmail', () => {
    it('all-clear day leads with the green subject', () => {
      const email = buildDigestEmail(base);
      expect(email.subject).toContain('All clear');
      expect(email.text).toContain('3 golf rounds');
      expect(email.html).toContain('All systems nominal');
    });

    it('reds lead the subject and body — exceptions first', () => {
      const email = buildDigestEmail({
        ...base,
        errors24h: { total: 12, critical: 2, topIncidents: [{ title: 'savePartialRound failed', occurrences: 8, affectedUsers: 3 }] },
        reds: ['integrity FAIL: anon_grant_drift', 'cron overdue: event-reminders'],
      });
      expect(email.subject).toContain('2 red');
      expect(email.text.indexOf('anon_grant_drift')).toBeLessThan(email.text.indexOf('golf rounds'));
      expect(email.html).toContain('savePartialRound failed');
    });

    it('renders unconfigured Sentry honestly instead of 0', () => {
      const email = buildDigestEmail({ ...base, sentry: { unresolved: null, regressed: null } });
      expect(email.text).toContain('Sentry: not configured');
    });

    it('signups are listed by email + role', () => {
      const email = buildDigestEmail({ ...base, signups24h: [{ email: 'new@coach.com', role: 'coach' }] });
      expect(email.text).toContain('new@coach.com (coach)');
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/digest/__tests__/build-digest.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/digest/build-digest.ts`:
  ```typescript
  export interface DigestData {
    generatedAt: string;
    errors24h: {
      total: number;
      critical: number;
      topIncidents: Array<{ title: string; occurrences: number; affectedUsers: number }>;
    };
    sentry: { unresolved: number | null; regressed: number | null };
    signups24h: Array<{ email: string; role: string }>;
    activity24h: { golfRounds: number; baseballGames: number; liftSessions: number };
    reds: string[];
  }

  export interface DigestEmail {
    subject: string;
    html: string;
    text: string;
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Inverted pyramid: reds first, then errors, then signups/activity. */
  export function buildDigestEmail(data: DigestData): DigestEmail {
    const redCount = data.reds.length;
    const day = new Date(data.generatedAt).toISOString().slice(0, 10);
    const subject =
      redCount > 0
        ? `Helm Bridge ${day} — ${redCount} red item${redCount === 1 ? '' : 's'}`
        : `Helm Bridge ${day} — All clear`;

    const lines: string[] = [];
    if (redCount > 0) {
      lines.push('RED ITEMS');
      for (const red of data.reds) lines.push(`  ! ${red}`);
      lines.push('');
    }
    lines.push(
      `Errors 24h: ${data.errors24h.total} (${data.errors24h.critical} critical)`,
      data.sentry.unresolved === null
        ? 'Sentry: not configured'
        : `Sentry: ${data.sentry.unresolved} unresolved · ${data.sentry.regressed ?? 0} regressed`,
      '',
    );
    if (data.errors24h.topIncidents.length > 0) {
      lines.push('Top incidents:');
      for (const inc of data.errors24h.topIncidents) {
        lines.push(`  - ${inc.title} (${inc.occurrences}x, ${inc.affectedUsers} users)`);
      }
      lines.push('');
    }
    if (data.signups24h.length > 0) {
      lines.push(`New signups (${data.signups24h.length}):`);
      for (const s of data.signups24h) lines.push(`  + ${s.email} (${s.role})`);
      lines.push('');
    }
    lines.push(
      `Activity: ${data.activity24h.golfRounds} golf rounds · ${data.activity24h.baseballGames} baseball games · ${data.activity24h.liftSessions} lift sessions`,
      '',
      'Open the bridge: https://helmsportslabs.com/admin',
    );
    const text = lines.join('\n');

    const html = `<!doctype html><html><body style="font-family:ui-monospace,Menlo,monospace;background:#faf8f2;color:#1c1917;padding:24px">
  <h2 style="margin:0 0 4px">${esc(subject)}</h2>
  <p style="color:${redCount > 0 ? '#DC2626' : '#16A34A'};font-weight:600">
    ${redCount > 0 ? `${redCount} item${redCount === 1 ? '' : 's'} need attention` : 'All systems nominal'}
  </p>
  ${redCount > 0 ? `<ul>${data.reds.map((r) => `<li style="color:#DC2626">${esc(r)}</li>`).join('')}</ul>` : ''}
  <p><strong>Errors 24h:</strong> ${data.errors24h.total} (${data.errors24h.critical} critical)<br/>
  <strong>Sentry:</strong> ${data.sentry.unresolved === null ? 'not configured' : `${data.sentry.unresolved} unresolved · ${data.sentry.regressed ?? 0} regressed`}</p>
  ${data.errors24h.topIncidents.length > 0 ? `<ul>${data.errors24h.topIncidents.map((i) => `<li>${esc(i.title)} — ${i.occurrences}x, ${i.affectedUsers} users</li>`).join('')}</ul>` : ''}
  ${data.signups24h.length > 0 ? `<p><strong>New signups:</strong></p><ul>${data.signups24h.map((s) => `<li>${esc(s.email)} (${esc(s.role)})</li>`).join('')}</ul>` : ''}
  <p><strong>Activity:</strong> ${data.activity24h.golfRounds} golf rounds · ${data.activity24h.baseballGames} baseball games · ${data.activity24h.liftSessions} lift sessions</p>
  <p><a href="https://helmsportslabs.com/admin">Open Helm Bridge →</a></p>
  </body></html>`;

    return { subject, html, text };
  }
  ```

- [ ] 4. Run to confirm pass:
  ```bash
  npm run test:run -- src/lib/admin/digest/__tests__/build-digest.test.ts
  ```
  Expected: 4 tests pass.

- [ ] 5. Commit: `feat(admin): pure digest email builder (W13)`

---

### Task 2 — Dedicated ops transport

**Files**
- Create: `src/lib/admin/digest/transport.ts`
- Create: `src/lib/admin/digest/__tests__/transport.test.ts`

**Interfaces**
- Produces:
  ```typescript
  export interface SendOpsDigestResult { sent: boolean; skipped: boolean; reason?: string; messageId?: string; }
  export async function sendOpsDigest(email: DigestEmail): Promise<SendOpsDigestResult>;
  export function __resetOpsTransportForTests(): void;
  ```
- Consumes: `OPS_DIGEST_RESEND_API_KEY`, `OPS_DIGEST_FROM` (default `Helm Bridge <bridge@helmsportslabs.com>`), `OPS_DIGEST_TO` (Nick only). NEVER `RESEND_API_KEY`, never anything from `src/lib/crm/**` or `src/lib/email/**`.

**Steps**

- [ ] 1. Write the failing test `src/lib/admin/digest/__tests__/transport.test.ts`:
  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

  const mocks = vi.hoisted(() => ({
    send: vi.fn(async () => ({ data: { id: 'msg-1' }, error: null })),
  }));
  vi.mock('resend', () => ({
    Resend: class {
      emails = { send: mocks.send };
      constructor(public key: string) {}
    },
  }));

  import { sendOpsDigest, __resetOpsTransportForTests } from '@/lib/admin/digest/transport';

  const email = { subject: 's', html: '<p>h</p>', text: 't' };

  describe('sendOpsDigest', () => {
    beforeEach(() => {
      __resetOpsTransportForTests();
      mocks.send.mockClear();
      vi.stubEnv('OPS_DIGEST_RESEND_API_KEY', 'ops-key');
      vi.stubEnv('OPS_DIGEST_TO', 'njrini99@gmail.com');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('skips (never throws) when the dedicated secret is absent', async () => {
      vi.stubEnv('OPS_DIGEST_RESEND_API_KEY', '');
      await expect(sendOpsDigest(email)).resolves.toEqual({
        sent: false, skipped: true, reason: 'ops-transport-not-configured',
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('skips when no recipient is configured', async () => {
      vi.stubEnv('OPS_DIGEST_TO', '');
      await expect(sendOpsDigest(email)).resolves.toMatchObject({ skipped: true, reason: 'missing-recipient' });
    });

    it('sends to the configured recipient with the ops from-address', async () => {
      const res = await sendOpsDigest(email);
      expect(res).toMatchObject({ sent: true, messageId: 'msg-1' });
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'njrini99@gmail.com', subject: 's' }),
      );
    });
  });
  ```

- [ ] 2. Run to confirm failure:
  ```bash
  npm run test:run -- src/lib/admin/digest/__tests__/transport.test.ts
  ```
  Expected: FAIL — module not found.

- [ ] 3. Implement `src/lib/admin/digest/transport.ts`:
  ```typescript
  import { Resend } from 'resend';
  import type { DigestEmail } from './build-digest';

  /**
   * DEDICATED ops-notification transport (owner decision #10).
   * Own client instance + OWN SECRET (OPS_DIGEST_RESEND_API_KEY) — follows
   * the codebase's isolated-client-per-surface convention (see
   * email/resend-client.ts's own refusal to share clients) with a stricter
   * secret boundary. Touches ZERO crm_* tables and imports ZERO CRM code.
   * Fail-soft: unconfigured → skipped, never a cron failure.
   */

  let _client: Resend | null | undefined;

  function getOpsClient(): Resend | null {
    if (_client !== undefined) return _client;
    const key = process.env.OPS_DIGEST_RESEND_API_KEY;
    _client = key ? new Resend(key) : null;
    return _client;
  }

  export function __resetOpsTransportForTests(): void {
    _client = undefined;
  }

  export interface SendOpsDigestResult {
    sent: boolean;
    skipped: boolean;
    reason?: string;
    messageId?: string;
  }

  const DEFAULT_FROM = 'Helm Bridge <bridge@helmsportslabs.com>';

  export async function sendOpsDigest(email: DigestEmail): Promise<SendOpsDigestResult> {
    const client = getOpsClient();
    if (!client) return { sent: false, skipped: true, reason: 'ops-transport-not-configured' };

    const to = (process.env.OPS_DIGEST_TO ?? '').trim();
    if (!to) return { sent: false, skipped: true, reason: 'missing-recipient' };

    const { data, error } = await client.emails.send({
      from: process.env.OPS_DIGEST_FROM || DEFAULT_FROM,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) return { sent: false, skipped: false, reason: error.message ?? 'send failed' };
    return { sent: true, skipped: false, messageId: data?.id };
  }
  ```

- [ ] 4. Run to confirm pass + CRM-boundary grep:
  ```bash
  npm run test:run -- src/lib/admin/digest/__tests__/transport.test.ts
  grep -rn "crm\|RESEND_API_KEY\|GMAIL" src/lib/admin/digest/ && echo "FAIL: boundary breach" || echo "boundary clean"
  ```
  Expected: 3 tests pass; `boundary clean`.

- [ ] 5. Commit: `feat(admin): dedicated ops digest transport on its own secret (W13)`

---

### Task 3 — Digest cron route + schedule

**Files**
- Create: `src/app/api/cron/admin-digest/route.ts`
- Modify: `vercel.json` (schedule) + `src/lib/admin/cron-registry.ts` (registry entry — the W11 contract test FORCES this pairing)

**Steps**

- [ ] 1. Red state: add ONLY the registry entry first, run the contract test, watch it fail (proves the contract works):
  ```typescript
    { jobType: 'admin-digest', path: '/api/cron/admin-digest', cadenceMinutes: DAILY },
  ```
  ```bash
  npm run test:run -- src/lib/admin/__tests__/cron-registry.test.ts
  ```
  Expected: FAIL — vercel.json missing `/api/cron/admin-digest`.

- [ ] 2. Add the schedule to `vercel.json` crons:
  ```json
      {
        "path": "/api/cron/admin-digest",
        "schedule": "0 10 * * *"
      }
  ```

- [ ] 3. Create `src/app/api/cron/admin-digest/route.ts`:
  ```typescript
  import { NextResponse, type NextRequest } from 'next/server';
  import { createAdminClient } from '@/lib/supabase/admin';
  import { recordJobRun } from '@/lib/admin/job-log';
  import { fetchSentryIssues } from '@/lib/admin/sentry-api';
  import { fetchTriageQueue } from '@/lib/admin/data/triage';
  import { buildDigestEmail, type DigestData } from '@/lib/admin/digest/build-digest';
  import { sendOpsDigest } from '@/lib/admin/digest/transport';
  import { CRON_REGISTRY, classifyCronStatus } from '@/lib/admin/cron-registry';

  export const runtime = 'nodejs';
  export const maxDuration = 120;
  export const dynamic = 'force-dynamic';

  export async function GET(req: NextRequest) {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
      return new NextResponse('unauthorized', { status: 401 });
    }

    return recordJobRun('admin-digest', async () => {
      const admin = createAdminClient();
      const ago24h = new Date(Date.now() - 86400_000).toISOString();
      const now = new Date();

      const [errors, criticals, signups, golf, baseball, lifts, integrityFails, jobRows, regressed, triage] =
        await Promise.all([
          admin.from('admin_events').select('id', { count: 'exact', head: true })
            .eq('event_type', 'error').gte('created_at', ago24h),
          admin.from('admin_events').select('id', { count: 'exact', head: true })
            .eq('event_type', 'error').eq('severity', 'critical').gte('created_at', ago24h),
          admin.from('users').select('email, role').gte('created_at', ago24h).limit(50),
          admin.from('golf_rounds').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
          admin.from('baseball_games').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
          admin.from('helm_lifting_sessions').select('id', { count: 'exact', head: true }).gte('created_at', ago24h),
          admin.from('admin_events').select('title')
            .eq('source', 'integrity').eq('severity', 'error').gte('created_at', ago24h).limit(10),
          admin.from('background_job_logs').select('job_type, status, started_at')
            .order('started_at', { ascending: false }).limit(300),
          fetchSentryIssues({ query: 'is:regressed', limit: 25 }),
          fetchTriageQueue(),
        ]);

      const latestByJob = new Map<string, { started_at: string; status: string }>();
      for (const row of (jobRows.data ?? []) as Array<{ job_type: string; status: string; started_at: string }>) {
        if (!latestByJob.has(row.job_type)) latestByJob.set(row.job_type, row);
      }
      const reds: string[] = [
        ...((integrityFails.data ?? []) as Array<{ title: string }>).map((r) => r.title),
        ...CRON_REGISTRY
          .filter((e) => e.jobType !== 'admin-digest')
          .map((e) => ({ e, status: classifyCronStatus(e, latestByJob.get(e.jobType) ?? null, now) }))
          .filter(({ status }) => status === 'overdue' || status === 'failed')
          .map(({ e, status }) => `cron ${status}: ${e.jobType}`),
      ];

      const data: DigestData = {
        generatedAt: now.toISOString(),
        errors24h: {
          total: errors.count ?? 0,
          critical: criticals.count ?? 0,
          topIncidents: triage.items.slice(0, 5).map((i) => ({
            title: i.title, occurrences: i.occurrences, affectedUsers: i.affectedUsers,
          })),
        },
        sentry: {
          unresolved: triage.sentry.status === 'ok' ? (triage.sentry.data?.length ?? 0) : null,
          regressed: regressed.status === 'ok' ? (regressed.data?.length ?? 0) : null,
        },
        signups24h: ((signups.data ?? []) as Array<{ email: string; role: string }>),
        activity24h: {
          golfRounds: golf.count ?? 0,
          baseballGames: baseball.count ?? 0,
          liftSessions: lifts.count ?? 0,
        },
        reds,
      };

      const result = await sendOpsDigest(buildDigestEmail(data));
      return NextResponse.json({ ok: true, ...result, reds: reds.length });
    });
  }
  ```

- [ ] 4. Run to confirm pass + gates (registry contract now green; job-log coverage contract picks up the new route):
  ```bash
  npm run test:run -- src/lib/admin/__tests__/cron-registry.test.ts src/app/api/cron/__tests__/cron-job-log-coverage.test.ts
  npm run typecheck && npm run lint && npm run test:run
  ```

- [ ] 5. Manual smoke (dev, with the ops key set): `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/admin-digest` → `{ ok: true, sent: true, ... }` and the email lands in Nick's inbox; with the key UNSET → `{ ok: true, skipped: true, reason: 'ops-transport-not-configured' }` and the cron still records `completed`.

- [ ] 6. Commit: `feat(admin): daily ops digest cron on the dedicated transport (W13)`

---

## Acceptance Criteria

- [ ] Digest sends to Nick ONLY (`OPS_DIGEST_TO`), from the ops address, via a client constructed EXCLUSIVELY from `OPS_DIGEST_RESEND_API_KEY`.
- [ ] `grep -rn "crm\|RESEND_API_KEY\|GMAIL" src/lib/admin/digest/ src/app/api/cron/admin-digest/` → zero hits (boundary-clean, test-pinned by the grep step).
- [ ] Reds lead subject and body (test-pinned); unconfigured Sentry reads "not configured", never 0.
- [ ] Unconfigured transport = skipped success, never a red cron.
- [ ] Digest cron itself appears on the W11 cron board (17 entries).
- [ ] All gates green; 8 new tests pass.

## Rollback

`git revert` (route + registry entry + vercel.json entry go together). No DB changes. Nick stops getting email; nothing else notices.
