#!/usr/bin/env node
// repo:doctor — the read-only integrity entrypoint for Helm's repository control
// plane. Compares DESIRED state (config/repo/manifest.yml) against ACTUAL repo
// state and reports PASS / WARN / FAIL / DRIFT / UNKNOWN / BLOCKED. It never
// mutates anything.
//
//   npm run repo:doctor              # human report, all deterministic checks
//   npm run repo:doctor -- --json    # machine-readable
//   npm run repo:doctor -- --summary # counts + failures only
//   npm run repo:doctor -- --ci      # reproducible/shared checks only
//
// Exit codes: 0 clean · 1 hard invariant failed · 2 a check crashed (fail
// closed) · 3 required external state unavailable. A crashed scanner is NEVER
// reported as green.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { run as execRun } from './lib/exec.mjs';
import { check, Status, summarize } from './result.mjs';

import * as identity from './checks/identity.mjs';
import * as workspace from './checks/workspace.mjs';
import * as scratch from './checks/scratch.mjs';
import * as ai from './checks/ai.mjs';
import * as registry from './checks/registry.mjs';
import * as ci from './checks/ci.mjs';
import * as config from './checks/config.mjs';

// Local-only modules would be gated on `--local`; all MVP checks are shared/CI-safe.
const MODULES = [identity, workspace, scratch, ai, registry, ci, config];

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2)));
  return {
    json: flags.has('json'),
    summary: flags.has('summary'),
    verbose: flags.has('verbose'),
    ci: flags.has('ci'),
    local: flags.has('local'),
  };
}

function resolveRepoRoot() {
  const r = execRun('git', ['rev-parse', '--show-toplevel']);
  if (r.ok) return r.value;
  // Fall back to two levels up from this file (scripts/repo-doctor/cli.mjs).
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function loadManifest(repoRoot) {
  const p = join(repoRoot, 'config/repo/manifest.yml');
  if (!existsSync(p)) return { __missing: true };
  try { return YAML.parse(readFileSync(p, 'utf-8')); }
  catch (err) { return { __error: String(err) }; }
}

const ICON = {
  [Status.PASS]: '✓', [Status.WARN]: '!', [Status.FAIL]: '✗', [Status.DRIFT]: 'Δ',
  [Status.STALE]: '~', [Status.UNKNOWN]: '?', [Status.BLOCKED]: '■', [Status.LOCAL_ONLY]: '·',
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const mode = opts.ci ? 'ci' : opts.local ? 'local' : 'default';

  const manifest = loadManifest(repoRoot);
  const checks = [];

  if (manifest.__missing) {
    checks.push(check('manifest', Status.FAIL, 'config/repo/manifest.yml is missing — no desired state to check against'));
  } else if (manifest.__error) {
    checks.push(check('manifest', Status.BLOCKED, 'config/repo/manifest.yml is not valid YAML', { detail: manifest.__error }));
  } else {
    const ctx = { repoRoot, manifest, mode };
    for (const mod of MODULES) {
      try {
        const results = await mod.run(ctx);
        for (const r of results) checks.push(r);
      } catch (err) {
        // Fail closed: a crashed check is BLOCKED (exit 2), never silently green.
        checks.push(check(`${mod.meta?.id ?? 'unknown'}.crash`, Status.BLOCKED,
          `check "${mod.meta?.id ?? 'unknown'}" crashed`, { detail: err?.stack ?? String(err) }));
      }
    }
  }

  const shaR = execRun('git', ['rev-parse', '--short', 'HEAD']);
  const result = summarize(checks, { repoSha: shaR.ok ? shaR.value : null, mode });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (opts.summary) {
    const c = result.counts;
    process.stdout.write(`${c.FAIL} FAIL · ${c.DRIFT} DRIFT · ${c.BLOCKED} BLOCKED · ${c.WARN} WARN · ${c.PASS} PASS\n`);
    for (const ch of checks.filter((x) => [Status.FAIL, Status.DRIFT, Status.STALE, Status.BLOCKED].includes(x.status))) {
      process.stdout.write(`  ${ICON[ch.status]} ${ch.id}: ${ch.title}\n`);
    }
  } else {
    process.stdout.write(`\nHELM REPO DOCTOR  (sha ${result.repoSha ?? '?'}, mode ${mode})\n`);
    process.stdout.write('='.repeat(52) + '\n');
    let group = '';
    for (const ch of checks) {
      const g = ch.id.split('.')[0];
      if (g !== group) { group = g; process.stdout.write(`\n${group.toUpperCase()}\n`); }
      process.stdout.write(`  ${ICON[ch.status] ?? '?'} ${ch.title}`);
      if (opts.verbose && ch.evidence) process.stdout.write(`\n      ${JSON.stringify(ch.evidence)}`);
      else if (ch.status !== Status.PASS && (ch.expected !== undefined || ch.actual !== undefined)) {
        process.stdout.write(`  (expected ${JSON.stringify(ch.expected)}, got ${JSON.stringify(ch.actual)})`);
      }
      process.stdout.write('\n');
    }
    const verdict = result.ok ? 'PASS' : `FAIL — exit ${result.exitCode}`;
    process.stdout.write(`\nRESULT: ${verdict}  (${result.counts.FAIL} fail, ${result.counts.DRIFT} drift, ${result.counts.BLOCKED} blocked, ${result.counts.WARN} warn)\n\n`);
  }

  process.exit(result.exitCode);
}

main().catch((err) => {
  // The orchestrator itself crashed — exit 2, never a false green.
  process.stderr.write(`repo:doctor crashed: ${err?.stack ?? err}\n`);
  process.exit(2);
});
