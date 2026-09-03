#!/usr/bin/env node
/**
 * Read-only Supabase Metrics API discovery — brief §20 / Track C's own C1.
 *
 * Fetches the project's live Prometheus-compatible metrics endpoint and
 * prints ONLY metric names and label KEYS — never values, never labels'
 * VALUES (a label value could carry a hostname, pod id, or other detail not
 * worth persisting anywhere), and never the credential itself. This is the
 * script `src/lib/observability/supabase/metrics-api.ts`'s own header says
 * to run once the owner has a credential available, to correct that file's
 * allow-list against what the live endpoint actually exposes (today it is
 * docs-derived — see that file's header for the full provenance note).
 *
 * Usage (needs the sandbox disabled — this makes a real network request and
 * reads `.env.local`):
 *   node scripts/db-observability-metrics-names.mjs
 *
 * Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
 * `.env.local` or the environment. Prints a clear, non-throwing message and
 * exits 1 if either is missing — this script makes NO write, and a missing
 * credential is not a crash.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

function resolveProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

async function main() {
  const projectRef = resolveProjectRef();
  const credential = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!projectRef || !credential) {
    process.stdout.write(
      'NOT VERIFIED — NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not available.\n' +
        'This is expected in a worktree (.env.local is deliberately withheld — see AGENTS.md).\n' +
        'Run this from the canonical checkout, or with the credential supplied via the environment,\n' +
        'to correct src/lib/observability/supabase/metrics-api.ts\'s PLATFORM_METRIC_ALLOW_LIST.\n',
    );
    process.exit(1);
  }

  const basicAuth = Buffer.from(`service_role:${credential}`).toString('base64');
  let res;
  try {
    res = await fetch(`https://${projectRef}.supabase.co/customer/v1/privileged/metrics`, {
      headers: { Authorization: `Basic ${basicAuth}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    process.stderr.write(`Fetch failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  if (!res.ok) {
    process.stderr.write(`Metrics endpoint returned HTTP ${res.status} — not printing body (may contain diagnostic detail).\n`);
    process.exit(1);
  }

  const text = await res.text();

  const metricNames = new Set();
  const labelKeysByMetric = new Map();

  const sampleLineRe = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+\S+(?:\s+\d+)?$/;
  const labelKeyRe = /([a-zA-Z_][a-zA-Z0-9_]*)="(?:[^"\\]|\\.)*"/g;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const match = sampleLineRe.exec(line);
    if (!match) continue;
    const [, name, labelBlock] = match;
    metricNames.add(name);
    if (labelBlock) {
      const keys = labelKeysByMetric.get(name) ?? new Set();
      let labelMatch;
      labelKeyRe.lastIndex = 0;
      while ((labelMatch = labelKeyRe.exec(labelBlock))) {
        keys.add(labelMatch[1]);
      }
      labelKeysByMetric.set(name, keys);
    }
  }

  process.stdout.write(`# ${metricNames.size} distinct metric names (values and label VALUES withheld)\n\n`);
  for (const name of [...metricNames].sort()) {
    const keys = labelKeysByMetric.get(name);
    process.stdout.write(keys && keys.size > 0 ? `${name} {${[...keys].sort().join(', ')}}\n` : `${name}\n`);
  }
}

main();
