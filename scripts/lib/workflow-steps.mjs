/**
 * workflow-steps.mjs — read the required-check workflows and decide, step by
 * step, how `npm run preflight` reproduces each one locally.
 *
 * Nothing here hard-codes a list of CI checks. The workflows are parsed at
 * runtime, so a step added to (or removed from) ci.yml / review-gate.yml /
 * migration-lockdown.yml is picked up (or dropped) by the next preflight run
 * without touching this file. What IS written down here is the small set of
 * steps that cannot run verbatim on a laptop (a test shard, a registry login,
 * a GitHub-hosted action) and what preflight does instead.
 *
 * A step this file cannot resolve (for example a new `${{ … }}` expression it
 * does not model) is classified `unmapped`. Preflight warns about it and
 * src/test/scripts/preflight-parity.test.ts FAILS on it, so whoever changes
 * the workflow also teaches preflight about the change in the same PR.
 *
 * Used by scripts/preflight.mjs, scripts/review-gate-local.mjs and the parity
 * test. Pure apart from reading the workflow files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as yamlLoad } from 'js-yaml';

/** The workflows whose jobs back the required status checks. CodeQL is CI-only. */
export const WORKFLOW_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/review-gate.yml',
  '.github/workflows/migration-lockdown.yml',
];

/** Required contexts preflight cannot reproduce, with the reason. */
export const CI_ONLY_WORKFLOWS = [
  { name: 'CodeQL (Analyze …)', reason: 'GitHub-hosted code scanning; no local equivalent' },
];

export function loadWorkflow(root, file) {
  return yamlLoad(readFileSync(join(root, file), 'utf8'));
}

// ---------------------------------------------------------------------------
// `if:` evaluation for a non-draft pull_request event
// ---------------------------------------------------------------------------

const ALLOWED_WORDS = new Set(['true', 'false', 'null', '__contains', '__startsWith', '__endsWith']);

/**
 * Evaluate a GitHub Actions `if:` as it would evaluate for a ready (non-draft)
 * pull request whose change detector said "yes, this touches code". Returns
 * true/false, or null when the expression uses something not modelled here
 * (callers treat null as "runs" — never silently drop a check).
 */
export function evalIf(raw, { matrix = {} } = {}) {
  if (raw === undefined || raw === null || raw === '') return true;
  if (typeof raw === 'boolean') return raw;
  let s = String(raw).trim();
  const wrapped = s.match(/^\$\{\{([\s\S]*)\}\}$/);
  if (wrapped) s = wrapped[1].trim();
  const q = (v) => JSON.stringify(v);
  s = s
    .replace(/\b(always|success)\(\)/g, 'true')
    .replace(/\b(failure|cancelled)\(\)/g, 'false')
    .replace(/\bneeds\.\*\.result\b/g, '[]')
    .replace(/\bgithub\.event_name\b/g, q('pull_request'))
    .replace(/\bgithub\.event\.pull_request\.draft\b/g, 'false')
    .replace(/\bgithub\.ref\b/g, q('refs/pull/0/merge'))
    .replace(/\bneeds\.[\w-]+\.outputs\.[\w-]+\b/g, q('true'))
    .replace(/\bneeds\.[\w-]+\.result\b/g, q('success'))
    .replace(/\bsteps\.[\w-]+\.outputs\.[\w-]+\b/g, q('true'))
    .replace(/\bsteps\.[\w-]+\.(outcome|conclusion)\b/g, q('success'))
    .replace(/\bmatrix\.([\w-]+)\b/g, (_, k) => q(matrix[k] ?? ''))
    .replace(/\bcontains\(/g, '__contains(')
    .replace(/\bstartsWith\(/g, '__startsWith(')
    .replace(/\bendsWith\(/g, '__endsWith(');
  const bare = s.replace(/'(?:[^']|'')*'/g, '').replace(/"(?:[^"\\]|\\.)*"/g, '');
  const words = bare.match(/[A-Za-z_][\w.]*/g) ?? [];
  if (words.some((w) => !ALLOWED_WORDS.has(w))) return null;
  const lower = (v) => String(v).toLowerCase();
  try {
    // The expression is repo-controlled workflow text, reduced above to
    // literals, operators and three helpers.
    const fn = new Function('__contains', '__startsWith', '__endsWith', `return Boolean(${s});`);
    return fn(
      (hay, needle) => (Array.isArray(hay) ? hay.some((h) => lower(h) === lower(needle)) : lower(hay).includes(lower(needle))),
      (a, b) => lower(a).startsWith(lower(b)),
      (a, b) => lower(a).endsWith(lower(b)),
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// `${{ … }}` substitution inside run: and env:
// ---------------------------------------------------------------------------

function resolveAtom(atom, ctx) {
  const a = atom.trim();
  let m;
  if ((m = a.match(/^'((?:[^']|'')*)'$/))) return m[1].replace(/''/g, "'");
  if ((m = a.match(/^secrets\.([A-Za-z_][\w]*)$/))) return ctx.secret ? ctx.secret(m[1]) ?? '' : '';
  if (a === 'github.event.pull_request.base.sha') return ctx.BASE_SHA ?? '';
  if (a === 'github.event.pull_request.head.sha' || a === 'github.sha') return ctx.HEAD_SHA ?? '';
  if (a === 'github.run_id') return 'local';
  if (a === 'github.run_attempt') return '1';
  if (a === 'github.actor') return 'local';
  if (a === 'github.workspace') return ctx.root ?? '';
  if (a === 'runner.temp') return ctx.RUNNER_TEMP ?? '';
  if ((m = a.match(/^matrix\.([\w-]+)$/))) return ctx.matrix?.[m[1]] !== undefined ? String(ctx.matrix[m[1]]) : undefined;
  return undefined;
}

/** Resolve one expression body. `undefined` means "not modelled". */
export function resolveExpr(expr, ctx = {}) {
  if (/&&|==|!=|\(/.test(expr)) return undefined;
  for (const part of expr.split('||')) {
    const v = resolveAtom(part, ctx);
    if (v === undefined) return undefined;
    if (v !== '') return v;
  }
  return '';
}

/** Substitute every `${{ … }}` in `text`. Returns the text and the expressions left unresolved. */
export function substitute(text, ctx = {}) {
  const unresolved = [];
  const out = String(text ?? '').replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (whole, expr) => {
    const v = resolveExpr(expr, ctx);
    if (v === undefined) {
      unresolved.push(expr);
      return whole;
    }
    return v;
  });
  return { text: out, unresolved };
}

// ---------------------------------------------------------------------------
// Review Gate tool mirrors (shared with scripts/review-gate-local.mjs)
// ---------------------------------------------------------------------------

/**
 * Steps CI runs through a `uses:` action or a downloaded binary, mirrored with
 * the locally installed tool. A missing tool yields { skip } — reported as
 * SKIPPED with the install hint, never as passed. Keyed by step id prefix.
 */
export const TOOL_OVERRIDES = {
  ast: (s, { has }) => (has('sg') ? { script: s.run } : { skip: 'brew install ast-grep', tool: 'sg' }),
  gitleaks: (s, { has, BASE_SHA, HEAD_SHA }) => (has('gitleaks')
    ? { script: `gitleaks git --config .gitleaks.toml --redact --log-opts="${BASE_SHA}..${HEAD_SHA}" .` }
    : { skip: 'brew install gitleaks', tool: 'gitleaks' }),
  hadolint: (s, { has }) => (has('hadolint')
    ? { script: s.run.replace(/curl -fsSL[^\n]*\n\s*chmod[^\n]*\n\s*\/tmp\/hadolint/, 'hadolint') }
    : { skip: 'brew install hadolint', tool: 'hadolint' }),
  ruff: (s, { has }) => (has('ruff') ? { script: s.run } : { skip: 'pip install ruff', tool: 'ruff' }),
  pylint: (s, { has }) => (has('pylint') ? { script: s.run } : { skip: 'pip install pylint', tool: 'pylint' }),
  actionlint: (s, { has }) => (has('actionlint') ? { script: s.run } : { skip: 'brew install actionlint', tool: 'actionlint' }),
  yamllint: (s, { has }) => (has('yamllint') ? { script: s.run } : { skip: 'pip install yamllint', tool: 'yamllint' }),
  shellcheck: (s, { has }) => (has('shellcheck') ? { script: s.run } : { skip: 'brew install shellcheck', tool: 'shellcheck' }),
  semgrep: (s, { has }) => (has('semgrep')
    ? { script: s.run.replace(/git config --global[^\n]*\n/, '') }
    : { skip: 'pip install semgrep', tool: 'semgrep' }),
  sqlfluff: (s, { has }) => (has('sqlfluff') ? { script: s.run } : { skip: 'pip install sqlfluff', tool: 'sqlfluff' }),
  markdownlint: (s, { has }) => (has('markdownlint-cli2') ? { script: s.run } : { skip: 'npm install -g markdownlint-cli2', tool: 'markdownlint-cli2' }),
};

export function toolOverrideFor(stepId) {
  const key = String(stepId).replace(/_.*/, '');
  return TOOL_OVERRIDES[key] ?? null;
}

/** Review Gate check steps, in the shape review-gate-local.mjs has always used. */
export function reviewGateSteps(wf) {
  const steps = [];
  for (const [jobId, job] of Object.entries(wf.jobs ?? {})) {
    if (jobId === 'all') continue;
    for (const s of job.steps ?? []) {
      if (s.uses && /checkout|setup-/.test(s.uses)) continue;
      if (!s.id && /Install linters|aggregate/i.test(s.name ?? '')) continue; // CI-only plumbing
      if (/aggregate|All checks green|Fail if any/i.test(s.name ?? '')) continue;
      if (s.run || s.uses) steps.push({ ...s, id: s.id ?? jobId });
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const runOf = (s) => String(s.run ?? '');
const STACK_START_RE = /supabase-start-with-retry|local-supabase-stack|\bsupabase start\b/;

/**
 * Ordered rules: the first match wins. `kind`:
 *   plumbing  runner setup / aggregation — not a check
 *   ci-only   a real check preflight cannot reproduce (reason says why)
 *   check     preflight runs it; `handler` says how
 */
export const STEP_RULES = [
  { name: 'aggregate-job', when: (s, ctx) => ctx.jobId === 'all', kind: 'plumbing', reason: 'aggregate job: preflight reports each step itself' },
  { name: 'setup-action', when: (s) => s.uses && /actions\/(checkout|setup-[\w-]+|cache(\/\w+)?|upload-artifact|download-artifact)@|denoland\/setup-deno|supabase\/setup-cli/.test(s.uses), kind: 'plumbing', reason: 'runner setup' },
  { name: 'install', when: (s) => /^\s*npm ci\s*$/.test(runOf(s)), kind: 'plumbing', reason: 'dependency install: preflight uses the local node_modules' },
  { name: 'install-linters', when: (s) => /^Install linters$/i.test(s.name ?? ''), kind: 'plumbing', reason: 'CI tool install: preflight uses local tools and warns on version drift' },
  { name: 'aggregate-step', when: (s) => /STEP_OUTCOMES/.test(runOf(s)) || /aggregate/i.test(s.name ?? ''), kind: 'plumbing', reason: 'aggregate of the steps preflight reports individually' },
  { name: 'registry-login', when: (s) => /docker login/.test(runOf(s)), kind: 'plumbing', reason: 'CI container-registry credential' },
  { name: 'stack-stop', when: (s) => /^\s*supabase stop\b/.test(runOf(s)), kind: 'plumbing', reason: 'preflight stops only a stack it started itself' },
  { name: 'playwright', when: (s) => /playwright (test|install)/.test(runOf(s)), kind: 'ci-only', reason: 'Playwright runs against the CI-built server (npm run test:e2e locally when needed)' },
  { name: 'sentry-upload', when: (s) => /sentry\/cli|sentry-cli|SENTRY_AUTH_TOKEN/.test(runOf(s)), kind: 'ci-only', reason: 'uploads to Sentry with CI secrets' },
  { name: 'gitleaks-action', when: (s) => s.uses && /gitleaks/.test(s.uses), kind: 'check', handler: 'tool' },
  { name: 'other-action', when: (s) => Boolean(s.uses), kind: 'ci-only', reason: 'GitHub action with no local equivalent' },
  { name: 'typecheck', when: (s) => /^\s*npm run typecheck\s*$/.test(runOf(s)), kind: 'check', handler: 'typecheck' },
  { name: 'eslint-scan', when: (s) => /lint-ci\.mjs --scan/.test(runOf(s)), kind: 'check', handler: 'verbatim', heavy: true, eslintCache: true },
  { name: 'types-drift', when: (s) => /check:types-drift/.test(runOf(s)), kind: 'check', handler: 'types-drift' },
  { name: 'unit-tests', when: (s) => /npm run test:run\b/.test(runOf(s)), kind: 'check', handler: 'unit-tests' },
  { name: 'integration-tests', when: (s) => /npm run test:integration\b/.test(runOf(s)), kind: 'check', handler: 'integration-tests' },
  { name: 'build', when: (s) => /^\s*npm run build\s*$/.test(runOf(s)), kind: 'check', handler: 'build' },
  { name: 'squawk', when: (s) => /squawk-cli/.test(runOf(s)), kind: 'check', handler: 'squawk' },
  { name: 'tool', when: (s, ctx) => /review-gate\.ya?ml$/.test(ctx.workflow) && Boolean(toolOverrideFor(s.id ?? ctx.jobId)), kind: 'check', handler: 'tool' },
  { name: 'verbatim', when: (s) => Boolean(s.run), kind: 'check', handler: 'verbatim' },
];

/** Jobs outside the workflow's `all` aggregate are advisory. Returns a Set of job ids, empty if no aggregate. */
export function advisoryJobs(wf) {
  const all = wf.jobs?.all;
  if (!all) return new Set();
  const needs = (j) => {
    const n = wf.jobs[j]?.needs;
    return Array.isArray(n) ? n : n ? [n] : [];
  };
  const required = new Set();
  const stack = [...needs('all')];
  while (stack.length) {
    const j = stack.pop();
    if (required.has(j)) continue;
    required.add(j);
    stack.push(...needs(j));
  }
  return new Set(Object.keys(wf.jobs).filter((j) => j !== 'all' && !required.has(j)));
}

function slug(name) {
  return String(name ?? '').replace(/\$\{\{[\s\S]*?\}\}/g, '').replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function firstMatrix(job) {
  const m = job.strategy?.matrix;
  if (!m || typeof m !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(m)) if (Array.isArray(v) && v.length) out[k] = v[0];
  return out;
}

/**
 * Every step of every job in the required-check workflows, classified.
 * Entry: { key, workflow, jobId, stepId, name, kind, handler?, reason?, rule,
 *          step, job, wf, matrix, db?: 'static'|'stack', barrier, unresolved }
 */
export function classifyWorkflows(root, files = WORKFLOW_FILES) {
  const entries = [];
  for (const workflow of files) {
    const wf = loadWorkflow(root, workflow);
    const advisory = advisoryJobs(wf);
    const wfName = workflow.replace(/^.*\//, '').replace(/\.ya?ml$/, '');
    for (const [jobId, job] of Object.entries(wf.jobs ?? {})) {
      const matrix = firstMatrix(job);
      const jobIf = evalIf(job.if, { matrix });
      const steps = job.steps ?? [];
      const stackIdx = steps.findIndex((s) => STACK_START_RE.test(runOf(s)) || STACK_START_RE.test(String(s.uses ?? '')));
      steps.forEach((step, i) => {
        const stepId = step.id ?? (step.name ? slug(step.name) : `step${i + 1}`);
        const base = {
          key: `${wfName}/${jobId}/${stepId}`,
          workflow, jobId, stepId, name: step.name ?? step.id ?? jobId,
          toolKey: step.id ?? jobId,
          step, job, wf, matrix,
          barrier: !step['continue-on-error'] || /GITHUB_ENV/.test(runOf(step)),
          db: stackIdx >= 0 ? (i < stackIdx ? 'static' : 'stack') : undefined,
        };
        const ctx = { workflow, jobId, job };
        const rule = STEP_RULES.find((r) => r.when(step, ctx));
        if (rule?.kind === 'plumbing') {
          entries.push({ ...base, kind: 'plumbing', reason: rule.reason, rule: rule.name });
          return;
        }
        if (advisory.has(jobId)) {
          entries.push({ ...base, kind: 'ci-only', reason: `advisory job: not part of ${wfName}'s aggregate`, rule: 'advisory-job' });
          return;
        }
        if (jobIf === false) {
          entries.push({ ...base, kind: 'not-on-pr', reason: `job runs only when: ${String(job.if).trim()}`, rule: 'job-if' });
          return;
        }
        if (evalIf(step.if, { matrix }) === false) {
          entries.push({ ...base, kind: 'not-on-pr', reason: `step runs only when: ${String(step.if).trim()}`, rule: 'step-if' });
          return;
        }
        if (!rule) {
          entries.push({ ...base, kind: 'unmapped', reason: 'no rule matches this step', rule: 'none' });
          return;
        }
        if (rule.kind === 'ci-only') {
          entries.push({ ...base, kind: 'ci-only', reason: rule.reason, rule: rule.name });
          return;
        }
        // A verbatim step must be runnable as written: every ${{ }} resolvable.
        const probe = { BASE_SHA: 'x', HEAD_SHA: 'x', RUNNER_TEMP: 'x', root: 'x', matrix, secret: () => '' };
        const unresolved = [
          ...substitute(step.run, probe).unresolved,
          ...Object.entries(step.env ?? {}).filter(([k]) => !['BASE_SHA', 'HEAD_SHA'].includes(k)).flatMap(([, v]) => substitute(v, probe).unresolved),
        ];
        if (rule.handler === 'verbatim' && unresolved.length) {
          entries.push({ ...base, kind: 'unmapped', reason: `unresolvable expression(s): ${unresolved.join(', ')}`, rule: rule.name, unresolved });
          return;
        }
        // Secrets the step (or its job) receives from GitHub. A local failure of
        // such a step may only mean the laptop's values differ from CI's.
        const secrets = [...new Set(Object.values({ ...(job.env ?? {}), ...(step.env ?? {}) })
          .flatMap((v) => [...String(v).matchAll(/secrets\.([A-Za-z_]\w*)/g)].map((m) => m[1])))];
        entries.push({ ...base, kind: 'check', handler: rule.handler, heavy: Boolean(rule.heavy), eslintCache: Boolean(rule.eslintCache), rule: rule.name, unresolved, secrets });
      });
    }
  }
  return entries;
}

/** Pinned tool versions from a workflow's "Install linters" step, for drift warnings. */
export function pinnedToolVersions(wf) {
  const pins = {};
  for (const job of Object.values(wf.jobs ?? {})) {
    for (const s of job.steps ?? []) {
      const run = runOf(s);
      let m;
      if ((m = run.match(/ast-grep\/releases\/download\/v?([\d.]+)\//))) pins.sg = m[1];
      if ((m = run.match(/rhysd\/actionlint\/v?([\d.]+)\//))) pins.actionlint = m[1];
      if ((m = run.match(/markdownlint-cli2@([\d.]+)/))) pins['markdownlint-cli2'] = m[1];
      if ((m = run.match(/semgrep==([\d.]+)/))) pins.semgrep = m[1];
      if ((m = run.match(/sqlfluff==([\d.]+)/))) pins.sqlfluff = m[1];
      if (/pip install[^\n]*\bsqlfluff\b(?!==)/.test(run) && !pins.sqlfluff) pins.sqlfluff = 'unpinned';
      if (s.container?.image && /semgrep/.test(s.container.image)) pins.semgrep = s.container.image.split(':')[1] ?? 'latest';
      if (job.container && /semgrep/.test(String(job.container.image ?? job.container))) {
        pins.semgrep = String(job.container.image ?? job.container).split(':')[1] ?? 'latest';
      }
    }
  }
  return pins;
}
