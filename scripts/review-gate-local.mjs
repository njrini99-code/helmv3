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
import { readFileSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';

const args = process.argv.slice(2);
const baseRef = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const HEAD_SHA = git('rev-parse', 'HEAD');
const BASE_SHA = git('merge-base', baseRef, 'HEAD');
const env = { ...process.env, BASE_SHA, HEAD_SHA, GITHUB_WORKSPACE: process.cwd(), CI: '', FORCE_COLOR: '1' };

const wf = yamlLoad(readFileSync('.github/workflows/review-gate.yml', 'utf8'));
const steps = [];
for (const [jobId, job] of Object.entries(wf.jobs)) {
  if (jobId === 'all') continue;
  for (const s of job.steps ?? []) {
    if (s.uses && /checkout|setup-/.test(s.uses)) continue;
    if (!s.id && /Install linters|aggregate/i.test(s.name ?? '')) continue; // CI-only plumbing
    if (s.run || s.uses) steps.push({ ...s, id: s.id ?? jobId });
  }
}

const has = (tool) => spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
const overrides = {
  gitleaks: () => has('gitleaks')
    ? { script: `gitleaks git --config .gitleaks.toml --redact --log-opts="${BASE_SHA}..${HEAD_SHA}" .` }
    : { skip: 'brew install gitleaks' },
  hadolint: (s) => has('hadolint')
    ? { script: s.run.replace(/curl -fsSL[^\n]*\n\s*chmod[^\n]*\n\s*\/tmp\/hadolint/, 'hadolint') }
    : { skip: 'brew install hadolint' },
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
console.log(failed ? `\n${failed} step(s) failed — GitHub's Review Gate will be red.` : '\nReview Gate would be green.');
process.exit(failed ? 1 : 0);
