export const meta = {
  name: 'golfhelm-remediation-wave1',
  description: 'Apply Wave-1 audit remediations (correctness + invisible-state + safe polish) across disjoint file-ownership areas, then adversarially verify each. Excludes the security key-rotation (owner-only) and high-blast-radius visual codemods (later wave).',
  phases: [
    { title: 'Fix', detail: 'one implementer per disjoint area applies the audit fix' },
    { title: 'Verify', detail: 'adversarially confirm each fix is correct + regression-free' },
  ],
};

// Each area owns a DISJOINT set of files so parallel edits never collide.
const AREAS = [
  {
    key: 'dead-colors',
    title: 'Invisible/dead semantic colors → tokens',
    files: 'src/components/golf/coachhelm/announcements/NewAnnouncementsModal.tsx, src/components/fairway/**/EventChip.tsx, src/components/golf/coachhelm/**/AreasToReviewSection.tsx, src/components/**/PatternCard.tsx, src/components/ui/status-dot.tsx',
    task:
      `The audit found deleted Tailwind color scales still referenced by live class strings, so they render with NO color (Tailwind emits nothing for an undefined utility). Fix the genuinely-broken/invisible states:\n` +
      `- \`helm-amber-*\` and \`helm-green-*\` are NOT defined anywhere (only a W0 deletion comment in tailwind.config.ts). The "High priority" announcement urgency tier, tournament event chips, and Round Review caution icons inherit color instead of rendering. Map dead \`helm-amber-*\` → the warning token utilities (text-warning/bg-warning or the amber semantic), \`helm-green-*\` → \`primary-*\`.\n` +
      `- The deleted \`sage-*\` scale has the same problem in EventChip and (separately) page-header — fix EventChip's \`sage-*\` here.\n` +
      `- Also extract/align the per-screen severity→color divergence in AreasToReviewSection / PatternCard / status-dot so the SAME severity uses ONE hue (route high/critical/warning through the destructive/warning/success tokens that already exist). Do not invent new tokens; use the existing semantic utilities (destructive, warning, success, primary).\n` +
      `Grep first to confirm each dead class actually has no definition before changing it. Make the minimal, correct edits. Do NOT touch files outside your list.`,
  },
  {
    key: 'toast-persistence',
    title: 'Error toasts persist long enough to be seen',
    files: 'src/components/ui/sonner.tsx',
    task:
      `The single global SonnerToaster hardcodes duration={5000} with no per-type override, so write/save/delete failures can vanish before the user notices. In the toast wrapper, make error toasts default to a longer duration (10000ms), and provide a way for destructive-failure callers to use Infinity (persist until dismissed) — without changing success/info toast timing. Keep the close button. Preserve the existing API; only change defaults for the error path. Touch ONLY sonner.tsx.`,
  },
  {
    key: 'a11y-labels',
    title: 'Icon-only buttons get accessible names + web sticky-focus clearance',
    files: 'src/components/ui/search-bar.tsx, src/components/ui/search-autocomplete.tsx, src/components/baseball/position-planner/PlayerQuickView.tsx, src/app/globals.css',
    task:
      `Two fixes:\n` +
      `1) Icon-only buttons announce as bare "button" (WCAG 4.1.2). Add aria-label="Clear search" to the clear buttons in search-bar.tsx (~:110) and search-autocomplete.tsx (~:208), and aria-label="Close" to the PlayerQuickView close button (~:71).\n` +
      `2) In globals.css the sticky-header scroll-margin clearance (~:248-253) is scoped only to body.capacitor, so on WEB keyboard focus can land under the blurred sticky header (WCAG 2.2 SC 2.4.11). Extend the same scroll-margin clearance to web (not just .capacitor) so focused elements clear the sticky header. Make the minimal CSS change. Touch ONLY these files.`,
  },
  {
    key: 'native-dialogs',
    title: 'Native alert() → app toast/inline error',
    files: 'src/components/baseball/games/GamesList.tsx, src/components/baseball/travel/ExpenseList.tsx, src/components/baseball/box-score/BoxScoreUpload.tsx',
    task:
      `Replace off-brand native browser alert() error surfaces with the app's patterns:\n` +
      `- GamesList.tsx (~:68) and ExpenseList.tsx (~:48): delete-failure alert() → the app toast (import the same toast/useToast used elsewhere in the codebase — grep for how sibling components surface errors) routed so it's visible; keep it non-blocking.\n` +
      `- BoxScoreUpload.tsx (~:112): the alert() is a validation guard — replace it with the inline setUploadError pattern already present in that file.\n` +
      `Do not introduce a new toast lib; reuse the existing one. Touch ONLY these three files.`,
  },
  {
    key: 'ui-hex-tokens',
    title: 'Hardcoded semantic hex in ui/ primitives → tokens (incl contrast)',
    files: 'src/components/ui/confirm-dialog.tsx, src/components/ui/row-actions-menu.tsx',
    task:
      `These canonical ui/ primitives hardcode semantic colors as raw hex, bypassing tokens AND diverging the hue + failing contrast:\n` +
      `- confirm-dialog.tsx hardcodes destructive #FF3B30 (~3.7:1 on white — fails WCAG AA for normal text) and warning #FF9500 (iOS orange, different from the token --color-warning #F59E0B).\n` +
      `- row-actions-menu.tsx hardcodes #FF3B30 for destructive.\n` +
      `Swap these to the existing destructive/warning semantic utilities (text-destructive/text-warning etc., which tailwind.config already defines). For the destructive TEXT that must meet 4.5:1, use a sufficiently dark destructive shade (darken to pass AA — e.g. a destructive-strong/hover shade); if no darker token exists, use a darker hex that passes AA and add a brief comment. Keep behavior identical. Touch ONLY these two files.`,
  },
  {
    key: 'cta-casing',
    title: 'Unify CTA casing (sentence case) + dedupe the round CTA',
    files: 'src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx, src/components/fairway/pages/qualifiers/FairwayQualifiers.tsx, src/components/fairway/pages/tasks/FairwayTasks.tsx',
    task:
      `CTA capitalization is inconsistent across parallel surfaces. Standardize visible button labels to SENTENCE case:\n` +
      `- FairwayPlayerDashboard.tsx (~:254) "New Round" → "New round" (it's the SAME button to the SAME destination as FairwayRoundsLibrary's "New round" — match it).\n` +
      `- FairwayQualifiers.tsx (~:116,172) "Create Qualifier" → "Create qualifier".\n` +
      `- FairwayTasks.tsx: ensure "Create task" stays sentence case (it already is — only change if it's Title Case).\n` +
      `Change ONLY the user-visible label strings (not identifiers/routes/types). Touch ONLY these three files.`,
  },
  {
    key: 'offline-dataloss',
    title: 'CRITICAL: consolidate the two offline IndexedDB databases',
    files: 'src/lib/offline/shot-storage.ts, src/lib/offline/indexed-db.ts, src/lib/offline/sync-engine.ts, src/stores/offline-sync-store.ts, src/components/golf/OfflineProvider.tsx, src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx',
    task:
      `CRITICAL silent-data-loss bug. Two divergent offline IndexedDB DBs exist: \`golfhelm_offline\` (v1, indexed-db.ts:~56) and \`golfhelm_offline_v2\` (shot-storage.ts:~116). The new-round failed-submit path writes a stranded round to v1 via saveOfflineRound (new-round-client.tsx + indexed-db.ts), but the GLOBAL sync engine (sync-engine.ts) and the pending-count badge (offline-sync-store.ts ~:392-394, read by OfflineProvider auto-sync-on-reconnect) read ONLY v2. Result: a round that fails to submit on a flaky connection is never auto-drained and the badge shows zero pending.\n\n` +
      `FIRST: read ALL six files fully and trace the exact read/write paths. Then make the MINIMAL, SAFEST change that guarantees a failed-submit round IS counted in pendingCount AND drained by the global reconnect sync — WITHOUT risking loss of already-stored rounds. Prefer the lowest-risk option: make the global sync engine + updatePendingCount also enumerate/drain the DB that saveOfflineRound writes to (rather than migrating data between DBs). If a data migration is unavoidable, it must be additive and idempotent (never delete before confirming a successful copy — destructive delete-then-write in a sync path is banned per project rules).\n\n` +
      `Add or extend a unit test that proves: a round saved via saveOfflineRound is reflected in the pending count the badge/auto-sync reads. If you cannot make a confidently-safe change, DO NOT guess — instead leave the code unchanged and return done:false with a precise, file:line implementation plan for human review. Touch ONLY the six listed files (+ a test file).`,
  },
];

const FIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'done', 'changedFiles', 'summary'],
  properties: {
    area: { type: 'string' },
    done: { type: 'boolean', description: 'true if edits were applied; false if deferred for human review' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'what changed and why (or, if not done, the precise plan)' },
    risks: { type: 'string', description: 'any regression risk or follow-up' },
  },
};

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'ok', 'issues'],
  properties: {
    area: { type: 'string' },
    ok: { type: 'boolean', description: 'true if the change is correct, complete, and regression-free' },
    issues: { type: 'array', items: { type: 'string' }, description: 'concrete problems found (empty if ok)' },
    note: { type: 'string' },
  },
};

const results = await pipeline(
  AREAS,
  (a) =>
    agent(
      `You are a senior engineer remediating a specific audit finding in the GolfHelm web app (Next.js + Tailwind, source under src/). Apply the fix by EDITING the files yourself.\n\n` +
      `AREA: ${a.title}\nYOU OWN ONLY THESE FILES: ${a.files}\n\nTASK:\n${a.task}\n\n` +
      `Rules: stay strictly within your owned files. Make minimal, correct, idiomatic edits matching surrounding conventions. Do not run tsc/lint/build (a global gate runs after). Use Read/Grep/Glob to ground every edit. Report exactly what you changed.`,
      { label: `fix:${a.key}`, phase: 'Fix', agentType: 'general-purpose', schema: FIX_SCHEMA },
    ),
  (fix, a) =>
    agent(
      `Adversarially verify this remediation in the GolfHelm codebase. Re-open the changed files and confirm: (1) the audit issue is actually resolved, (2) the edit is syntactically valid TypeScript/TSX/CSS, (3) no behavior regression or broken import/reference, (4) nothing outside the owned file set was touched.\n\n` +
      `AREA: ${a.title}\nOWNED FILES: ${a.files}\nIMPLEMENTER REPORT:\n${JSON.stringify(fix, null, 2)}\n\n` +
      `Default to ok:false if you find any problem. List concrete issues with file:line. If the implementer deferred (done:false), assess whether its plan is sound and set ok accordingly.`,
      { label: `verify:${a.key}`, phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA },
    ).then((v) => ({ area: a.title, key: a.key, fix, verify: v })),
);

return {
  applied: results.filter((r) => r && r.fix && r.fix.done).map((r) => ({ area: r.key, files: r.fix.changedFiles, ok: r.verify?.ok, issues: r.verify?.issues, summary: r.fix.summary })),
  deferred: results.filter((r) => r && r.fix && !r.fix.done).map((r) => ({ area: r.key, plan: r.fix.summary })),
};
