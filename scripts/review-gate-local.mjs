#!/usr/bin/env node
/**
 * review-gate-local — run the SAME steps `.github/workflows/review-gate.yml`
 * runs, on the same changed-file set, before a push ever reaches GitHub.
 *
 * Reads the workflow file and executes each check step's `run:` block
 * verbatim (bash, `set -e`), with BASE_SHA/HEAD_SHA set the way the PR
 * event sets them: BASE_SHA = merge-base with origin/main, HEAD_SHA = HEAD.
 * Steps CI runs through a `uses:` action (gitleaks) or a downloaded binary
 * (hadolint) are mirrored with the locally installed tool; a step whose tool
 * is not installed is reported SKIPPED (not passed) with the install hint.
 *
 * Usage: node scripts/review-gate-local.mjs [--base <ref>] [--only id,id]
 * Exit 1 if any step fails. `npm run gates:review`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { loadWorkflow, reviewGateSteps, toolOverrideFor } from './lib/workflow-steps.mjs';

const args = process.argv.slice(2);
const baseRef = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const HEAD_SHA = git('rev-parse', 'HEAD');
const tryGit = (...a) => { try { return git(...a); } catch { return ''; } };
// PR semantics: diff against the merge-base with main. Fall back the way
// .github/scripts/changed-files.sh does when no such ref exists (fixtures).
const BASE_SHA = tryGit('merge-base', baseRef, 'HEAD') || tryGit('merge-base', 'main', 'HEAD') || tryGit('rev-parse', 'HEAD^') || HEAD_SHA;
const env = { ...process.env, BASE_SHA, HEAD_SHA, GITHUB_WORKSPACE: process.cwd(), CI: '', FORCE_COLOR: '1' };

// Step list and local tool mirrors are shared with `npm run preflight`
// (scripts/lib/workflow-steps.mjs), so the two can never disagree.
const steps = reviewGateSteps(loadWorkflow(process.cwd(), '.github/workflows/review-gate.yml'));
const has = (tool) => spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;

let failed = 0; const rows = [];
for (const s of steps) {
  const id = s.id;
  if (only && !only.includes(id)) continue;
  if (/aggregate|all_green|required_failed/i.test(id)) continue;
  const override = toolOverrideFor(id);
  const o = override ? override(s, { has, BASE_SHA, HEAD_SHA }) : { script: s.run };
  const t0 = Date.now();
  if (o.skip) { rows.push([id, 'SKIPPED', `tool missing — ${o.skip}`]); continue; }
  const r = spawnSync('bash', ['-eo', 'pipefail', '-c', o.script], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
  if (r.status === 0) rows.push([id, 'ok', secs]);
  else { failed++; rows.push([id, 'FAIL', secs]); process.stdout.write(`\n──── ${id} ────\n${(r.stdout || '') + (r.stderr || '')}\n`); }
}
console.log(`\nreview-gate-local  base=${BASE_SHA.slice(0, 9)} head=${HEAD_SHA.slice(0, 9)}`);
for (const [id, st, note] of rows) console.log(`  ${st.padEnd(8)} ${id.padEnd(18)} ${note}`);
console.log(failed ? `\n${failed} step(s) failed — GitHub's Review Gate will be red.` : '\nReview Gate would be green.');
process.exit(failed ? 1 : 0);
