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
 * Usage: node scripts/review-gate-local.mjs [--base <ref>] [--only id,id] [--allow-missing]
 * `npm run gates:review`. Exit codes:
 *   0  every selected step ran and passed (CI-equivalent green)
 *   1  at least one step failed — GitHub's Review Gate will be red
 *   2  INCOMPLETE: nothing failed, but at least one step was SKIPPED because
 *      its tool is missing, so the result is NOT CI-equivalent. Pass
 *      --allow-missing to accept that and exit 0 (the skipped list still prints).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';

const args = process.argv.slice(2);
const baseRef = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const allowMissing = args.includes('--allow-missing');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const HEAD_SHA = git('rev-parse', 'HEAD');
const tryGit = (...a) => { try { return git(...a); } catch { return ''; } };
// PR semantics: diff against the merge-base with main. Fall back the way
// .github/scripts/changed-files.sh does when no such ref exists (fixtures).
const BASE_SHA = tryGit('merge-base', baseRef, 'HEAD') || tryGit('merge-base', 'main', 'HEAD') || tryGit('rev-parse', 'HEAD^') || HEAD_SHA;
const env = { ...process.env, BASE_SHA, HEAD_SHA, GITHUB_WORKSPACE: process.cwd(), CI: '', FORCE_COLOR: '1' };

const wf = yamlLoad(readFileSync('.github/workflows/review-gate.yml', 'utf8'));
const steps = [];
for (const [jobId, job] of Object.entries(wf.jobs)) {
  if (jobId === 'all') continue;
  for (const s of job.steps ?? []) {
    if (s.uses && /checkout|setup-/.test(s.uses)) continue;
    const name = s.name ?? '';
    if (!s.id && (/^Install /i.test(name) || /aggregate/i.test(name))) continue; // CI-only plumbing (tool installs)
    if (s.run || s.uses) steps.push({ ...s, id: s.id ?? jobId });
  }
}

const has = (tool) => spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
const overrides = {
  gitleaks: () => has('gitleaks')
    ? { script: `gitleaks git --config .gitleaks.toml --redact --log-opts="${BASE_SHA}..${HEAD_SHA}" .` }
    : { skip: 'brew install gitleaks' },
  // CI downloads + checksum-verifies a pinned binary; locally, swap that
  // block (comment through the `hadolint=` line and its version check) for
  // the installed tool. If the workflow block changes shape, say so instead of
  // silently downloading or running something else.
  hadolint: (s) => {
    if (!has('hadolint')) return { skip: 'brew install hadolint' };
    const script = s.run.replace(/# Exact release binary[\s\S]*?\n\s*hadolint="[^\n]*\n[^\n]*--version[^\n]*\n/, 'hadolint=hadolint\n');
    return script === s.run ? { skip: 'workflow hadolint step changed shape — update the override in scripts/review-gate-local.mjs' } : { script };
  },
  ruff: (s) => has('ruff') ? { script: s.run } : { skip: 'pip install ruff' },
  pylint: (s) => has('pylint') ? { script: s.run } : { skip: 'pip install pylint' },
  actionlint: (s) => has('actionlint') ? { script: s.run } : { skip: 'brew install actionlint' },
  yamllint: (s) => has('yamllint') ? { script: s.run } : { skip: 'pip install yamllint' },
  semgrep: (s) => has('semgrep') ? { script: s.run.replace(/git config --global[^\n]*\n/, '') } : { skip: 'pip install semgrep' },
  sqlfluff: (s) => has('sqlfluff') ? { script: s.run } : { skip: 'pip install sqlfluff' },
};

let failed = 0; const rows = [];
for (const s of steps) {
  const id = s.id;
  if (only && !only.includes(id)) continue;
  if (/aggregate|all_green|required_failed/i.test(id) || /aggregate|All checks green|Fail if any/i.test(s.name ?? '')) continue;
  const key = id.replace(/_.*/, '');
  const o = overrides[key] ? overrides[key](s) : { script: s.run };
  const t0 = Date.now();
  if (o.skip) { rows.push([id, 'SKIPPED', `tool missing — ${o.skip}`]); continue; }
  const r = spawnSync('bash', ['-eo', 'pipefail', '-c', o.script], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1) + 's';
  if (r.status === 0) rows.push([id, 'ok', secs]);
  else { failed++; rows.push([id, 'FAIL', secs]); process.stdout.write(`\n──── ${id} ────\n${(r.stdout || '') + (r.stderr || '')}\n`); }
}
console.log(`\nreview-gate-local  base=${BASE_SHA.slice(0, 9)} head=${HEAD_SHA.slice(0, 9)}`);
for (const [id, st, note] of rows) console.log(`  ${st.padEnd(8)} ${id.padEnd(18)} ${note}`);
const skipped = rows.filter(([, st]) => st === 'SKIPPED').map(([id]) => id);
if (failed) {
  console.log(`\n${failed} step(s) failed — GitHub's Review Gate will be red.`);
  if (skipped.length) console.log(`Also skipped (tool missing): ${skipped.join(', ')}.`);
  process.exit(1);
}
if (skipped.length) {
  console.log(`\nINCOMPLETE — ${skipped.length} step(s) skipped because the tool is missing: ${skipped.join(', ')}.`);
  console.log('This result is NOT CI-equivalent: GitHub runs those steps and may still go red.');
  if (allowMissing) {
    console.log('--allow-missing given: exiting 0 anyway.');
    process.exit(0);
  }
  console.log('Install the tools above, or pass --allow-missing to accept an incomplete run.');
  process.exit(2);
}
console.log('\nReview Gate would be green.');
process.exit(0);
