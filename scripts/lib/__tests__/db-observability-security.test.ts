import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs module, no type declarations by design
import { runSecurityPosture, summarizeSecurityPosture, __testing } from '../db-observability-security.mjs';

/**
 * Brief 60 and 61 - the security posture check's own tests.
 *
 * Two jobs, same shape as the certification suite. First, that the posture
 * holds against today's repository. Second, that the CHECKS THEMSELVES are
 * discriminating: a detector that matches a comment, or one that would pass
 * an endpoint with no auth, is worse than no detector, because it reports
 * safety nobody established.
 */

interface PostureCheck {
  id: string;
  title: string;
  verdict: 'PASS' | 'FAIL' | 'FINDING' | 'NOT_CONFIGURED';
  detail: string;
  evidence?: unknown;
}

function checks(): PostureCheck[] {
  return runSecurityPosture() as PostureCheck[];
}

function byId(id: string): PostureCheck {
  const found = checks().find((c) => c.id === id);
  if (!found) throw new Error(`no posture check with id ${id}`);
  return found;
}

describe('security posture - the current repository', () => {
  it('reports no FAIL', () => {
    const failures = checks()
      .filter((c) => c.verdict === 'FAIL')
      .map((c) => `${c.id}: ${c.detail}`);
    expect(failures).toEqual([]);
  });

  it('keeps every new observability table private', () => {
    const c = byId('tables_private');
    expect(c.verdict).toBe('PASS');
    // Guards the guard: a check that found zero tables would also find zero
    // problems, and would report PASS having inspected nothing.
    expect((c.evidence as { tables: string[] }).tables.length).toBeGreaterThan(0);
  });

  it('keeps every facade service-role-only with a fixed search_path', () => {
    const c = byId('facades_service_role_only');
    expect(c.verdict).toBe('PASS');
    expect((c.evidence as { functions: string[] }).functions.length).toBeGreaterThan(0);
  });

  it('gates every surface that reads observability data', () => {
    const c = byId('bridge_routes_admin_gated');
    expect(c.verdict).toBe('PASS');
    // The admin page AND the collector cron routes - a check that only knew
    // the Bridge readers would call the surface gated on the strength of one
    // page while four unauthenticated-looking cron routes went unexamined.
    expect(c.detail).toContain('super admin');
    expect(c.detail).toContain('cron secret');
  });

  it('keeps every server-only observability module out of client components', () => {
    const c = byId('no_server_only_module_in_client');
    expect(c.verdict).toBe('PASS');
    const modules = (c.evidence as { serverOnlyModules: string[] }).serverOnlyModules;
    expect(modules.length).toBeGreaterThan(0);
    expect(modules).toContain('@/lib/observability/supabase/record-db-error');
  });
});

describe('brief 61 - no generic browser error-ingest endpoint', () => {
  it('reports no NEW ingest endpoint', () => {
    expect(byId('no_new_generic_browser_ingest').verdict).toBe('PASS');
  });

  it('reports the pre-existing route as a FINDING with its controls named', () => {
    // Allow-listed, never silently blessed: the route predates this program
    // and accepts anonymous writes deliberately, so failing the build on it
    // would be scope this track was not asked to change - but hiding it
    // inside an allow-list would be worse.
    const c = byId('pre_existing_ingest_controls');
    expect(c.verdict).toBe('FINDING');
    const rows = (c.evidence as { rows: { file: string; missing: string[] }[] }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.file).toBe('src/app/api/log-error/route.ts');
    expect(rows[0]!.missing).toEqual(expect.arrayContaining(['auth', 'allowList']));
  });
});

describe('the detectors are discriminating', () => {
  const { stripComments, enforcesAuth, ingestControls } = __testing as {
    stripComments: (s: string) => string;
    enforcesAuth: (s: string) => boolean;
    ingestControls: (s: string) => Record<string, boolean>;
  };

  it('does not treat a comment about error_logs as an error-ingest endpoint', () => {
    // Measured false positive: src/app/api/crm/google-calendar/sync/route.ts
    // says only "per-event logging would flood error_logs/Sentry" - in a
    // comment - and was flagged until the stripper was added.
    const stripped = stripComments('// per-event logging would flood error_logs\nconst x = 1;\n');
    expect(stripped).not.toContain('error_logs');
    expect(stripped).toContain('const x = 1;');
  });

  it('still sees a real error_logs write', () => {
    // Guards the guard: a stripper returning '' would pass the test above.
    const stripped = stripComments("await db.from('error_logs').insert(row); // write\n");
    expect(stripped).toContain('error_logs');
  });

  it('recognises a 401 guard as real authentication', () => {
    expect(
      enforcesAuth("const { data: { user } } = await supabase.auth.getUser();\nif (!user) {\n  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });\n}"),
    ).toBe(true);
    expect(enforcesAuth('await requireSuperAdmin();')).toBe(true);
    expect(enforcesAuth('const unauthorized = requireCronAuth(req);')).toBe(true);
  });

  it('does NOT accept a getUser() call that never refuses anyone', () => {
    // This is the log-error shape: it reads the user to LABEL the row, then
    // accepts the write either way. Reading a session is not enforcing one.
    expect(
      enforcesAuth("const { data: { user } } = await supabase.auth.getUser();\nconst isAnonymous = !user;"),
    ).toBe(false);
  });

  it('does not let a distant 401 vouch for a missing guard', () => {
    const distant = `if (!user) {\n${'  const filler = 1;\n'.repeat(40)}}\nreturn NextResponse.json({}, { status: 401 });`;
    expect(enforcesAuth(distant)).toBe(false);
  });

  it('reports each brief-61 control independently', () => {
    const bare = ingestControls('export async function POST() { return new Response(); }');
    for (const value of Object.values(bare)) expect(value).toBe(false);
    expect(Object.keys(bare).sort()).toEqual(
      ['allowList', 'auth', 'dedupe', 'rateLimit', 'schemaValidation', 'sizeLimit'].sort(),
    );
  });
});

describe('the live-catalog claim is never faked', () => {
  it('reports NOT_CONFIGURED rather than inferring grants from migration text', () => {
    const c = byId('live_catalog_grants');
    expect(c.verdict).toBe('NOT_CONFIGURED');
    expect(c.detail.length).toBeGreaterThan(20);
  });

  it('never counts NOT_CONFIGURED or FINDING toward the pass count', () => {
    const summary = summarizeSecurityPosture(checks()) as {
      pass: number;
      fail: number;
      findings: number;
      notConfigured: number;
      ok: boolean;
    };
    expect(summary.pass).toBe(checks().filter((c) => c.verdict === 'PASS').length);
    expect(summary.notConfigured).toBeGreaterThan(0);
    expect(summary.findings).toBeGreaterThan(0);
    // `ok` tracks FAIL and nothing else.
    expect(summary.ok).toBe(summary.fail === 0);
  });
});
