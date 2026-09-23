export const meta = {
  name: 'helm-fix-ci',
  description: 'For each open agent PR with red checks: separate real failures from infra noise, reproduce the real ones locally, fix them all in one batch behind a green `npm run preflight`, push once, and report',
  whenToUse: '/helm-fix-ci 1867 1866 1865 — after a batch of PRs goes red on CI. Fixes only what CI flags; never changes a PR\'s intent; never loops.',
  phases: [
    { title: 'Diagnose', detail: 'read the failing job logs; classify real vs infra' },
    { title: 'Fix', detail: 'helm-worker in the PR\'s own worktree, preflight-gated, one push' },
  ],
}

// args: an array of PR numbers, e.g. [1867, 1866]. A single number is accepted too.
const prs = Array.isArray(args) ? args : (args != null ? [args] : [])
if (!prs.length) throw new Error('helm-fix-ci needs PR numbers as args, e.g. args: [1867, 1866]')

const DIAGNOSIS = {
  type: 'object',
  required: ['pr', 'branch', 'worktree', 'failures', 'nonActionable'],
  properties: {
    pr: { type: 'integer' },
    branch: { type: 'string' },
    worktree: { type: 'string', description: 'absolute path under /Users/ricknini/worktrees/helmv3, or "" if none' },
    failures: {
      type: 'array',
      description: 'real failures only — each one a check the PR\'s own diff can fix',
      items: {
        type: 'object',
        required: ['check', 'step', 'cause', 'localCommand'],
        properties: {
          check: { type: 'string' },
          step: { type: 'string' },
          cause: { type: 'string' },
          localCommand: { type: 'string', description: 'the command that reproduces this failure locally (npm run preflight -- --only <step> works for any CI step)' },
        },
      },
    },
    nonActionable: {
      type: 'array',
      description: 'red or pending checks that are NOT the PR\'s fault, with the evidence',
      items: { type: 'string' },
    },
  },
}

const NON_ACTIONABLE =
  'Classify each red check before calling it a failure. NOT actionable (list under nonActionable, with evidence, and do not fix): ' +
  'a run CANCELLED by a newer push or by concurrency; ghcr.io / Docker Hub pull or rate-limit errors (toomanyrequests, 429, manifest unknown) and other runner/network errors; ' +
  'the advisory checks that are not required (Sentry snapshot capture, Playwright PR smoke, anything outside CI aggregate / Review Gate aggregate / CodeQL Analyze / block-historical-edits); ' +
  'CodeQL alerts on code the PR did not touch; and a failure that also fails on main\'s latest run of the same check (compare with `gh run list --branch main --workflow <file> -L 3`). ' +
  'A draft PR shows "CI aggregate" red by design — gated jobs are skipped until `gh pr ready`; that is not a failure either.'

const out = await pipeline(
  prs,
  (pr) => agent(
    `PR #${pr} in njrini99-code/helmv3 has red checks. gh needs the Bash sandbox disabled in this environment (TLS errors otherwise); use that only for gh commands. ` +
    `Find the head SHA (gh pr view ${pr} --json headRefName,headRefOid,isDraft), list check runs (gh api repos/njrini99-code/helmv3/commits/<sha>/check-runs?per_page=100), ` +
    'and for each failing job read `gh run view <run> --job <job> --log-failed`. Identify the exact failing step and its cause from the log, not from memory of past failures. ' +
    NON_ACTIONABLE + ' ' +
    'Locate the branch\'s worktree with `git worktree list` from /Users/ricknini/Downloads/helmv3. Report only; never edit.',
    { label: `diagnose:${pr}`, phase: 'Diagnose', agentType: 'helm-reader', schema: DIAGNOSIS },
  ),
  (diag, pr) => {
    if (!diag || !diag.failures.length) {
      log(`#${pr}: no actionable failures${diag?.nonActionable?.length ? ` (non-actionable: ${diag.nonActionable.join('; ')})` : ''}`)
      return { pr, fixed: false, note: 'no actionable failures', nonActionable: diag?.nonActionable ?? [] }
    }
    if (!diag.worktree) { log(`#${pr}: no worktree for ${diag.branch}; skipping`); return { pr, fixed: false, note: 'no worktree' } }
    return agent(
      `Worktree: ${diag.worktree}, branch ${diag.branch}, PR #${pr}. Confirm the branch and that \`node -v\` is v22 first. ` +
      'Fix ONLY these CI failures — never the PR\'s intent, never raise a baseline, never skip, weaken or delete a test:\n' +
      diag.failures.map((f) => `- ${f.check} / ${f.step}: ${f.cause}. Reproduce: ${f.localCommand}`).join('\n') +
      '\n\nThe loop you must follow, and its limits:\n' +
      '1. REPRODUCE each failure locally first (its command, or `npm run preflight -- --only <step key>`), captured to a file, reading the real exit code. ' +
      'If it does not reproduce locally, do not guess-fix it: report it as not reproducible.\n' +
      '2. Fix every reproduced failure. Then run `npm run preflight` (add `--full` if the PR touches supabase/**, a \'use server\' file, or many areas). ' +
      'It regenerates generated artifacts and runs every required CI step it can; fix EVERYTHING it reports, not only what CI showed, in the same batch.\n' +
      '3. Push ONCE, only after preflight exits 0: commit with explicit `git add <paths>` and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, ' +
      'then `git push` (sandbox disabled for the push only). One push per round — every extra push cancels the CI run in flight.\n' +
      '4. STOP after 2 rounds. If preflight is still red after two fix attempts, or a failure is pre-existing on main or infrastructure noise, do not push again: ' +
      'report what fails, the evidence, and what you tried.\n' +
      'Do not merge. Final text: the new head SHA (or "not pushed"), the preflight result and wall time, one line per fix, and anything left unresolved.',
      { label: `fix:${pr}`, phase: 'Fix', agentType: 'helm-worker' },
    ).then((text) => ({ pr, fixed: true, report: text, nonActionable: diag.nonActionable ?? [] }))
  },
)

return out.filter(Boolean)
