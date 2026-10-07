export const meta = {
  name: 'helm-review',
  description: 'Review a PR or the current diff across five dimensions, then adversarially verify every finding',
  whenToUse: 'Before landing a non-trivial PR: /helm-review <pr number> (or no args for the current checkout\'s diff, committed and uncommitted).',
  phases: [
    { title: 'Review', detail: 'check out the target once, then one helm-reader per dimension' },
    { title: 'Verify', detail: 'three skeptics per finding; two refutations kill it, the severity lens only re-grades' },
  ],
}

const pr = args != null && String(args).trim() !== '' ? String(args).trim() : null

// Every agent reads code at ONE path: the PR head (a detached worktree made
// here) or the checkout this workflow runs in. Skeptics that read canonical
// `main` instead would "refute" every finding about new code.
const ROOT = { type: 'object', required: ['root'], properties: { root: { type: 'string' } } }
const setup = await agent(
  pr
    ? `Materialise PR #${pr}'s head for review. Run \`gh pr view ${pr} --json headRefOid -q .headRefOid\` to get the sha, then ` +
      `\`git -C /Users/ricknini/Downloads/helmv3 fetch -q origin pull/${pr}/head\` and ` +
      `\`git -C /Users/ricknini/Downloads/helmv3 worktree add --detach /tmp/helm-review-${pr} <sha>\` ` +
      `(if that path already exists at that sha, reuse it). Return its absolute path. Do not edit any file.`
    : 'Return the absolute path of the current git checkout (`git rev-parse --show-toplevel`). Do not edit any file.',
  { label: 'setup', phase: 'Review', agentType: 'helm-worker', schema: ROOT },
)
const root = setup?.root
if (!root) throw new Error('helm-review: could not resolve the code to review')

const target = pr ? `PR #${pr} (checked out at ${root})` : `the diff in ${root} against origin/main`
const how = pr
  ? `Read the diff with \`gh pr diff ${pr}\` and the PR body with \`gh pr view ${pr}\`; read code under ${root}.`
  : `In ${root}, read \`git diff origin/main\` (committed and uncommitted changes) and \`git status --short\` for untracked files.`

const DIMENSIONS = [
  { key: 'correctness', prompt: 'logic errors, wrong return shapes, unhandled errors, off-by-one, broken invariants' },
  { key: 'supabase', prompt: 'the traps in .claude/rules/database.md and the helm-supabase skill: unread `error` from a Supabase call, the 1,000-row cap without fetchAllRows, `.in()` with an unchunked id list, applied-vs-recorded assumptions, a bare (non sport-prefixed) table name' },
  { key: 'security', prompt: 'auth checks missing on server actions or routes, service-role key reaching a client bundle, secrets in code or logs, RLS gaps on new tables, SECURITY DEFINER without the REVOKE pattern, DELETE-then-INSERT in a save path' },
  { key: 'process', prompt: 'gates the change must pass per .claude/rules/quality-gates.md and CI: generated docs regenerated (DOCUMENT_AUTHORITY_INVENTORY, world model, feature map), registry mappings for new governed files, HELD.md rows for any migration, no baseline raised, no hand-edit inside an AUTOGEN block' },
  { key: 'scope', prompt: 'files changed that the PR title does not explain, dead code left behind, tests that assert nothing, docs claiming behaviour the code does not have' },
]

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'summary', 'evidence'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          summary: { type: 'string' },
          evidence: { type: 'string', description: 'the exact code or doc text that shows the problem' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor'], description: 'severity lens only: the grade the finding deserves' },
  },
}

const results = await pipeline(
  DIMENSIONS,
  (d) => agent(
    `You are reviewing ${target} in the helmv3 repo for ONE dimension only: ${d.key} — ${d.prompt}. ${how} ` +
    'Read the surrounding code, not just the diff. Report only what you can cite with file and line and quote as evidence. ' +
    'Zero findings is a valid answer. Never edit anything.',
    { label: `review:${d.key}`, phase: 'Review', agentType: 'helm-reader', schema: FINDINGS },
  ),
  (review, d) => parallel((review?.findings ?? []).map((f) => () =>
    parallel(['correctness', 'reproduce', 'severity'].map((lens) => () => agent(
      `A reviewer claims, in ${f.file}:${f.line}: "${f.summary}". Evidence offered: ${f.evidence}. ` +
      `Read the code under ${root} and test the claim through the ${lens} lens. ` +
      (lens === 'severity'
        ? 'Do not refute a real problem for being overstated: set refuted=false and put the grade it deserves in `severity`. Refute only if it is not a problem at all. '
        : 'Refute only if the code at that path contradicts the claim. If you cannot locate the code, say so with refuted=false. ') +
      'Never edit anything.',
      { label: `verify:${d.key}:${lens}`, phase: 'Verify', agentType: 'helm-reader', schema: VERDICT },
    ))).then((votes) => {
      const cast = votes.filter(Boolean)
      const refutations = cast.filter((v) => v.refuted)
      const regrade = cast.find((v) => v.severity)?.severity
      return {
        ...f,
        severity: regrade ?? f.severity,
        dimension: d.key,
        survives: cast.length >= 2 && refutations.length < 2,
        unverified: cast.length < 2,
        refutations: refutations.map((v) => v.reason),
      }
    }))),
)

// The same issue can surface in two dimensions (supabase and security overlap).
const seen = new Set()
const all = results.filter(Boolean).flat().filter(Boolean).filter((f) => {
  const key = `${f.file}:${f.line}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
const confirmed = all.filter((f) => f.survives)
const unverified = all.filter((f) => f.unverified)
const rejected = all.filter((f) => !f.survives && !f.unverified)
log(`${confirmed.length} confirmed, ${rejected.length} refuted, ${unverified.length} unverified across ${DIMENSIONS.length} dimensions`)
if (pr) log(`PR head checked out at ${root}; remove it with: git -C /Users/ricknini/Downloads/helmv3 worktree remove ${root}`)
return { target, confirmed, rejected, unverified }
