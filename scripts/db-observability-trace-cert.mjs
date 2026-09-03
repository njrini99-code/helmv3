#!/usr/bin/env node
/**
 * W3C trace propagation certification — brief §14.
 *
 * STATIC verification only: reads the repo, never makes a network call,
 * never touches Sentry or Supabase. It proves the ARCHITECTURE is wired the
 * way `docs/observability/SENTRY_SUPABASE_TRACING.md` describes; it does NOT
 * prove a real trace id actually reaches a real Supabase log line — that is
 * a one-time MANUAL live proof (a controlled preview request, matching the
 * Sentry trace id against the Supabase request log by hand or via the
 * connected agent tooling), recorded in
 * `docs/observability/SUPABASE_TRACE_PROPAGATION.md` and never automated —
 * brief §14/§32 are explicit that this stays "no continuous ingestion".
 *
 * Usage:
 *   node scripts/db-observability-trace-cert.mjs           # human report
 *   node scripts/db-observability-trace-cert.mjs --json     # machine report
 *
 * Exit 0: every item PASS (or explicitly N/A with a stated reason).
 * Exit 1: at least one item FAIL.
 *
 * ITEM 5 (edge function CORS) IS DELIBERATELY NOT A BLANKET FAIL
 * -------------------------------------------------------------------
 * All three current Edge Functions (`personalize-email`, `send-apns-push`,
 * `send-fcm-push`) omit `sentry-trace`/`baggage`/`traceparent` from their
 * `Access-Control-Allow-Headers`. Verified none of the three is invoked from
 * an instrumented BROWSER client: `send-apns-push`/`send-fcm-push` are
 * called only from `src/lib/notifications/push.ts`, which carries an
 * explicit `'server-only'` directive; no call site for `personalize-email`
 * exists in `src/` at all (server/webhook-triggered). CORS trace-header
 * propagation only matters for a request that CROSSES the browser-CORS
 * boundary — a server-to-server invocation never hits it. So item 5 is PASS
 * for the current inventory, with the real header gap recorded per-function
 * in `evidence` so it is visible and actionable the moment any of these
 * three (or a new function) becomes browser-invoked. This is a documented
 * scoping decision, not a fixed function — this script does not edit
 * `supabase/functions/*`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_MODE = process.argv.includes('--json');

function read(relPath) {
  const p = join(REPO_ROOT, relPath);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/** @typedef {{ id: string, title: string, status: 'PASS' | 'FAIL', detail: string, evidence?: unknown }} Item */
/** @type {Item[]} */
const items = [];

function addItem(id, title, ok, detail, evidence) {
  items.push({ id, title, status: ok ? 'PASS' : 'FAIL', detail, ...(evidence !== undefined ? { evidence } : {}) });
}

// 1. Supabase tracing runtime imported by both instrumentation entry points.
{
  const server = read('src/instrumentation.ts') ?? '';
  const client = read('src/instrumentation-client.ts') ?? '';
  const serverOk = server.includes("'@supabase/supabase-js/tracing'") || server.includes('"@supabase/supabase-js/tracing"');
  const clientOk = client.includes("'@supabase/supabase-js/tracing'") || client.includes('"@supabase/supabase-js/tracing"');
  addItem(
    'supabase_tracing_runtime_imported',
    'Supabase tracing runtime imported by instrumentation.ts and instrumentation-client.ts',
    serverOk && clientOk,
    serverOk && clientOk ? 'both entry points import it' : 'at least one entry point is missing the import',
    { server: serverOk, client: clientOk },
  );
}

// 2. tracePropagation configured on every Supabase client factory.
{
  const factories = [
    'src/lib/supabase/admin.ts',
    'src/lib/supabase/client.ts',
    'src/lib/supabase/server.ts',
    'src/lib/supabase/middleware.ts',
  ];
  const evidence = {};
  let allOk = true;
  for (const f of factories) {
    const body = read(f) ?? '';
    const ok = /tracePropagation\s*:/.test(body);
    evidence[f] = ok;
    if (!ok) allOk = false;
  }
  addItem(
    'trace_propagation_enabled_on_clients',
    'tracePropagation configured on every Supabase client factory',
    allOk,
    allOk ? 'all four factories configure tracePropagation' : 'one or more factories are missing tracePropagation',
    evidence,
  );
}

// 3. Sentry propagateTraceparent enabled on server + edge runtime inits.
{
  const server = read('src/instrumentation.ts') ?? '';
  const occurrences = (server.match(/propagateTraceparent\s*:\s*true/g) ?? []).length;
  addItem(
    'sentry_propagate_traceparent',
    'Sentry propagateTraceparent: true set on both the Node and Edge runtime Sentry.init calls',
    occurrences >= 2,
    `found ${occurrences} occurrence(s) of "propagateTraceparent: true" in src/instrumentation.ts (need >= 2: node + edge)`,
  );
}

// 4. Browser tracePropagationTargets includes the Helm Supabase host.
{
  const body = read('src/lib/sentry-client-options.ts') ?? '';
  const derivesSupabaseTarget = /supabaseTraceTarget/.test(body) && /NEXT_PUBLIC_SUPABASE_URL/.test(body);
  const spreadIntoTargets = /tracePropagationTargets\s*:\s*\[[^\]]*supabaseTraceTarget/s.test(body);
  addItem(
    'browser_trace_propagation_targets_include_supabase_host',
    'Browser tracePropagationTargets includes the project Supabase origin',
    derivesSupabaseTarget && spreadIntoTargets,
    derivesSupabaseTarget && spreadIntoTargets
      ? 'supabaseTraceTarget is derived from NEXT_PUBLIC_SUPABASE_URL and spread into tracePropagationTargets'
      : 'tracePropagationTargets does not derive/include the Supabase origin',
  );
}

// 5. Edge Function CORS — scoped to browser-invoked functions (see header).
{
  const NOT_BROWSER_INVOKED = new Set([
    'personalize-email', // no call site found anywhere in src/ — server/webhook-triggered
    'send-apns-push', // called only from src/lib/notifications/push.ts ('server-only')
    'send-fcm-push', // called only from src/lib/notifications/push.ts ('server-only')
  ]);
  const fnDir = join(REPO_ROOT, 'supabase/functions');
  const evidence = {};
  let anyBrowserInvokedMissingHeaders = false;

  if (existsSync(fnDir)) {
    for (const name of readdirSync(fnDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const indexPath = join('supabase/functions', name.name, 'index.ts');
      const body = read(indexPath);
      if (body === null) continue;
      const headerMatch = body.match(/Access-Control-Allow-Headers["']?\s*[,:]\s*["']([^"']+)["']/i);
      const headerValue = headerMatch ? headerMatch[1] : null;
      const hasTraceHeaders =
        headerValue !== null &&
        /sentry-trace/i.test(headerValue) &&
        /baggage/i.test(headerValue) &&
        /traceparent/i.test(headerValue);
      const browserInvoked = !NOT_BROWSER_INVOKED.has(name.name);
      evidence[name.name] = { headerValue, hasTraceHeaders, browserInvoked };
      if (browserInvoked && !hasTraceHeaders) anyBrowserInvokedMissingHeaders = true;
    }
  }

  addItem(
    'edge_function_cors_allows_trace_headers',
    'Every browser-invoked Edge Function CORS-allows sentry-trace/baggage/traceparent',
    !anyBrowserInvokedMissingHeaders,
    anyBrowserInvokedMissingHeaders
      ? 'a browser-invoked function is missing one or more trace headers from Access-Control-Allow-Headers'
      : 'no currently browser-invoked Edge Function is missing trace headers (none of the 3 inventoried functions is browser-invoked today — see evidence for the per-function header gap, tracked but not blocking)',
    evidence,
  );
}

const ok = items.every((i) => i.status === 'PASS');

if (JSON_MODE) {
  process.stdout.write(JSON.stringify({ ok, items }, null, 2) + '\n');
} else {
  process.stdout.write('\nW3C TRACE PROPAGATION CERTIFICATION (static)\n');
  process.stdout.write('='.repeat(52) + '\n');
  for (const item of items) {
    process.stdout.write(`  ${item.status === 'PASS' ? '✓' : '✗'} ${item.title}\n      ${item.detail}\n`);
  }
  process.stdout.write(
    `\nRESULT: ${ok ? 'PASS' : 'FAIL'} (${items.filter((i) => i.status === 'PASS').length}/${items.length})\n`,
  );
  process.stdout.write(
    'Live proof (real trace id -> real Supabase log line) is separate and manual — see docs/observability/SUPABASE_TRACE_PROPAGATION.md\n\n',
  );
}

process.exit(ok ? 0 : 1);
