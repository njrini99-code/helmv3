export const meta = {
  name: 'helm-fix-ci',
  description: 'For each open agent PR with red checks: diagnose the failing step, fix it in that PR\'s worktree, push, and report',
  whenToUse: '/helm-fix-ci 1867 1866 1865 — after a batch of PRs goes red on CI. Fixes only what CI flags; never changes a PR\'s intent.',
  phases: [
    { title: 'Diagnose', detail: 'read the failing job logs' },
    { title: 'Fix', detail: 'helm-worker in the PR\'s own worktree' },
  ],
}

// args: PR numbers as an array, a single number, or the slash-command string "1867 1866".
const prs = (Array.isArray(args) ? args : String(args ?? '').split(/[\s,]+/))
  .map(Number).filter(Number.isInteger)
if (!prs.length) throw new Error('helm-fix-ci needs PR numbers as args, e.g. args: [1867, 1866]')

const DIAGNOSIS = {
  type: 'object',
  required: ['pr', 'branch', 'worktree', 'failures'],
  properties: {
    pr: { type: 'integer' },
    branch: { type: 'string' },
    worktree: { type: 'string', description: 'absolute path from `git worktree list` for this branch, or "" if none' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['check', 'step', 'cause', 'localCommand'],
        properties: {
          check: { type: 'string' },
          step: { type: 'string' },
          cause: { type: 'string' },
          localCommand: { type: 'string', description: 'the npm/npx command that reproduces the check locally' },
        },
      },
    },
  },
}

const out = await pipeline(
  prs,
  (pr) => agent(
    `PR #${pr} in njrini99-code/helmv3 has red checks. ` +
    `Find the head SHA (gh pr view ${pr} --json headRefName,headRefOid), list failing check runs (gh api repos/njrini99-code/helmv3/commits/<sha>/check-runs?per_page=100), ` +
    'and for each failing job read `gh run view <run> --job <job> --log-failed`. Identify the exact failing step and its cause. ' +
    'Common causes: stale generated docs (docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md via npm run knowledge:doc-inventory, the world model via npm run knowledge:world-model, ' +
    'the feature map via npm run knowledge:feature-map, docs/TOOL_AUTHORITY_MATRIX.md), markdown or sqlfluff ratchet growth, yamllint line length. ' +
    'Locate the branch\'s worktree with `git worktree list` from /Users/ricknini/Downloads/helmv3. Report only; never edit.',
    { label: `diagnose:${pr}`, phase: 'Diagnose', agentType: 'helm-reader', schema: DIAGNOSIS },
  ),
  (diag, pr) => {
    if (!diag || !diag.failures.length) { log(`#${pr}: nothing red`); return { pr, fixed: false, note: 'no failures found' } }
    if (!diag.worktree) { log(`#${pr}: no worktree for ${diag.branch}; skipping (reattach one with scripts/new-worktree.sh <task> --reattach)`); return { pr, fixed: false, note: 'no worktree' } }
    return agent(
      `Worktree: ${diag.worktree}, branch ${diag.branch}, PR #${pr}. Confirm the branch first. Fix ONLY these CI failures, never the PR's intent, never raise a baseline:\n` +
      diag.failures.map((f) => `- ${f.check} / ${f.step}: ${f.cause}. Reproduce locally with: ${f.localCommand}`).join('\n') +
      '\nRun each local command, captured to a file, and check the exit code. Regenerate generated docs only when the diagnosis names them, then run `npm run docs:check`. ' +
      'Commit with explicit `git add` and push the branch. ' +
      'Do not merge. No test suite, no build. Final text: the new head SHA and one line per fix.',
      { label: `fix:${pr}`, phase: 'Fix', agentType: 'helm-worker' },
    ).then((text) => ({ pr, fixed: text != null, report: text }))
  },
)

return out.filter(Boolean)
