#!/usr/bin/env node
/**
 * diagnostics-health.mjs — which evidence path actually works, right now.
 *
 * WHY
 * ---
 * Helm advertises several routes to each provider: a native Claude connector,
 * a plugin MCP, a project .mcp.json server, and a CLI. They do not all work,
 * and which ones are live is not knowable from any config file — enabled,
 * allowed, and FUNCTIONING are three different things.
 *
 * The cost is not confusion, it is false confidence. A background repair run
 * can pick an unauthenticated route, get nothing, and report that it
 * investigated. This answers the only question that matters before an
 * investigation starts: what can I actually read?
 *
 * PROSE WOULD NOT WORK HERE. A markdown table saying "Vercel = native
 * connector" is a claim; this is a probe. Same reason .doc-schema-baseline.json
 * exists instead of a paragraph about the schema.
 *
 * Read-only. Exits 0 if every REQUIRED path is live, 1 otherwise.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd, args, ms = 25000) => {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf-8', timeout: ms, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message || '').split('\n')[0].slice(0, 90) };
  }
};

const scope = (() => {
  try { return JSON.parse(readFileSync('.vercel/project.json', 'utf-8')).orgId; } catch { return null; }
})();

const checks = [];

// VERCEL — the repo-local CLI is the sanctioned path (AGENTS.md). The plugin
// MCP namespace is denied at project scope on purpose; the native connector is
// read-only. Deploys go through scripts/deploy-prod.sh, which uses this CLI.
checks.push({
  name: 'Vercel      (./node_modules/.bin/vercel)',
  required: true,
  probe: () => scope
    ? run('./node_modules/.bin/vercel', ['ls', '--prod', '--scope', scope])
    : { ok: false, out: 'no .vercel/project.json orgId' },
  reads: 'deployments, logs, aliases; deploys via deploy-prod.sh',
});

// GITHUB — gh CLI. Note it fails inside the Bash sandbox for GraphQL
// (macOS keychain / x509 OSStatus -26276) while REST may pass, so this probes
// the GraphQL path specifically: that is the one that silently returns nothing.
checks.push({
  name: 'GitHub      (gh CLI, GraphQL path)',
  required: true,
  probe: () => run('gh', ['pr', 'list', '--limit', '1', '--json', 'number']),
  reads: 'PRs, checks, merge state',
});

// SUPABASE — production reads. The project .mcp.json server is read_only and
// may require interactive auth; the account-level connector is what has
// actually been connected. Neither is probeable from a script, so this checks
// the thing a script CAN use and states the limit plainly.
checks.push({
  name: 'Supabase    (local stack, for tests)',
  required: false,
  probe: () => run('docker', ['exec', 'supabase_db_helmv3', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', 'select 1']),
  reads: 'pgTAP + integration tests; NOT production',
});

// PRODUCTION RELEASE — the check that would have caught nine unreleased fixes.
checks.push({
  name: 'Release     (npm run release:status)',
  required: false,
  probe: () => run('node', ['scripts/release-status.mjs'], 60000),
  reads: 'is production serving origin/main',
});

console.log('helm diagnostics — what is actually reachable\n');
let failedRequired = 0;
for (const c of checks) {
  const r = c.probe();
  const tag = r.ok ? 'LIVE  ' : (c.required ? 'DOWN  ' : 'n/a   ');
  if (!r.ok && c.required) failedRequired++;
  console.log(`  ${tag} ${c.name}`);
  console.log(`         ${c.reads}`);
  if (!r.ok) console.log(`         -> ${r.out}`);
}

console.log('\nNOT probeable from a script (MCP tools live in the agent session):');
console.log('  Supabase production reads  — account connector; verify by running a query');
console.log('  Sentry issues/events       — MCP, org slug helm-xs');
console.log('  .env.local Sentry creds are placeholders and cannot work — use the MCP.');

if (failedRequired > 0) {
  console.log(`\n${failedRequired} REQUIRED path(s) down. Do not report an investigation as complete`);
  console.log('without the evidence they provide — say "evidence unavailable" instead.');
  process.exit(1);
}
console.log('\nAll required paths live.');
