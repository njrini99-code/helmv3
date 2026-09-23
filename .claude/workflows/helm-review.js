export const meta = {
  name: 'helm-review',
  description: 'Review a PR or the current diff across five dimensions, then adversarially verify every finding',
  whenToUse: 'Before landing a non-trivial PR: /helm-review <pr number> (or no args for the working-tree diff).',
  phases: [
    { title: 'Review', detail: 'one helm-reader per dimension' },
    { title: 'Verify', detail: 'three skeptics per finding; two refutations kill it' },
  ],
}

// Target: a PR number passed as args, else the current diff against origin/main.
const target = args ? `PR #${args}` : 'the working-tree diff against origin/main (git diff origin/main...HEAD)'
const how = args
  ? `Read the diff with \`gh pr diff ${args}\` (retry that one command with the sandbox disabled if it fails on TLS) and the PR body with \`gh pr view ${args}\`.`
  : 'Read the diff with `git diff origin/main...HEAD` and `git status --short`.'

const DIMENSIONS = [
  { key: 'correctness', prompt: 'logic errors, wrong return shapes, unhandled errors, off-by-one, broken invariants' },
  { key: 'supabase', prompt: 'the four traps in .claude/rules/database.md: unread `error` from a Supabase call, the 1,000-row cap without fetchAllRows, `.in()` with an unchunked id list, applied-vs-recorded assumptions; plus any bare (non sport-prefixed) table name and any SECURITY DEFINER without the REVOKE pattern' },
  { key: 'security', prompt: 'auth checks missing on server actions or routes, service-role key reaching a client bundle, secrets in code or logs, RLS gaps on new tables, DELETE-then-INSERT in a save path' },
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
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
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
      `Try to REFUTE it through the ${lens} lens by reading the actual code in the repo at /Users/ricknini/Downloads/helmv3 ` +
      '(or the PR head if a PR number is in play). If you cannot confirm it from the code, refuted=true. Never edit anything.',
      { label: `verify:${d.key}:${lens}`, phase: 'Verify', agentType: 'helm-reader', schema: VERDICT },
    ))).then((votes) => {
      const refutations = votes.filter(Boolean).filter((v) => v.refuted)
      return { ...f, dimension: d.key, survives: refutations.length < 2, refutations: refutations.map((v) => v.reason) }
    }))),
)

const all = results.filter(Boolean).flat().filter(Boolean)
const confirmed = all.filter((f) => f.survives)
const rejected = all.filter((f) => !f.survives)
log(`${confirmed.length} confirmed, ${rejected.length} refuted across ${DIMENSIONS.length} dimensions`)
return { target, confirmed, rejected }
