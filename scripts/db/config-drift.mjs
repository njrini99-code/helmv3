#!/usr/bin/env node
/**
 * config-drift.mjs — has production's Auth/API/DB/Storage config drifted
 * from supabase/config.toml?
 *
 * WHY THIS EXISTS
 *
 * Supabase CLI 2.119 can diff a project's live config against config.toml
 * (`supabase config diff`). Production's settings are recorded in the
 * `[remotes.production]` block (written by
 * `supabase config pull --remote-label production`). A dashboard edit that is
 * not pulled back into code shows up here.
 *
 * Some settings stay dashboard-only on purpose (this repo is public, so SMTP
 * identity is not committed). Those paths are listed in
 * `supabase/config-drift-baseline.json`; any other drifted path fails.
 *
 * READ-ONLY. `config diff` never modifies local or remote configuration.
 * Needs SUPABASE_ACCESS_TOKEN (or a CLI login) and SUPABASE_PROJECT_ID.
 *
 * Exit 0: no unexpected drift.  Exit 1: drift.  Exit 2: could not run.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = resolve(ROOT, 'supabase/config-drift-baseline.json');
const CLI = process.env.SUPABASE_CLI ?? resolve(ROOT, 'node_modules/.bin/supabase');
const PROJECT = process.env.SUPABASE_PROJECT_ID ?? 'qmnssrrolpinvwjjnufo';

/** Dotted paths of every drifted setting in a `config diff -o json` report. */
export function driftedPaths(report) {
  return (report?.changes ?? []).map((c) => c.path.join('.')).sort();
}

/** Drifted paths not covered by an accepted path or one of its parents. */
export function unexpectedDrift(paths, accepted) {
  return paths.filter((p) => !accepted.some((a) => p === a || p.startsWith(`${a}.`)));
}

function main() {
  const res = spawnSync(
    CLI,
    ['config', 'diff', '--project-ref', PROJECT, '--output-format', 'json'],
    { encoding: 'utf8', cwd: ROOT },
  );
  const out = `${res.stdout ?? ''}`;
  const start = out.indexOf('{"schema_version"');
  if (res.error || res.status === 1 || start < 0) {
    console.error(`config-drift: could not run config diff (exit ${res.status}).`);
    console.error(`${res.stderr ?? ''}`.slice(0, 500));
    return 2;
  }
  const report = JSON.parse(out.slice(start, out.lastIndexOf('}') + 1));
  const accepted = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).accepted.map((a) => a.path);
  const unexpected = unexpectedDrift(driftedPaths(report), accepted);
  if (unexpected.length === 0) {
    console.log(`config-drift: OK (${driftedPaths(report).length} accepted, none unexpected).`);
    return 0;
  }
  console.error('config-drift: production differs from supabase/config.toml at:');
  for (const p of unexpected) console.error(`  ${p}`);
  console.error(
    'If the dashboard change is intended, record it with\n' +
      '  supabase config pull --project-ref <ref> --remote-label production\n' +
      'and commit the [remotes.production] diff.',
  );
  return 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
