# Change ledger — player_coachhelm_development

## 2026-08-26 — log-progress drawers stop autofocusing the measurement field on touch

- SHA: 596913022.
- Change: both LogProgressDrawer copies (FairwayMyDevelopment.tsx and
  golf/coachhelm/home/DevelopmentDrill.tsx) gate the measurement input's
  autoFocus on a fine pointer.
- Why: on iPhone the numeric keypad popped over the drawer before the
  player had read the field's context (owner TestFlight report,
  same class as the event editor).

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/coachhelm`, `dashboard/my-development`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.

## 2026-09-23 — #1997 rebase onto main: reconciled two independent grounding implementations

- PR #1997 ("chat publication waits for validation," repair plan §14.10,
  new `src/lib/coachhelm/v3/chat/verdict.ts`) branched before a separate,
  already-merged PR (`#2001`, "register a measurement's window date as
  claim-audit evidence") grew `auditNumericClaims`'s signature by two
  optional params (`extraSupportedDates`, a coach-timezone-aware
  conversion) and, in the process, inlined its own `auditResult`/
  `grounded`/`streamErrored` computation directly in `chat/stream/
  route.ts` — the exact ad-hoc pattern `verdict.ts`'s own header says it
  exists to replace, because #2001 had no access to the not-yet-merged
  `verdict.ts` abstraction.
- Rebasing #1997 onto main after #2001 merged produced two real
  conflicts in `route.ts` (plus a mechanical one in the generated
  `auditNumericClaims`/`collectDates` import list). Resolution: kept
  #1997's `computeTurnVerdict`-based code as the surviving path (every
  line downstream of both conflicts already depended on `turnVerdict`/
  `verdict`, not on `auditResult` — confirming the old boolean pattern
  was truly dead once `verdict.ts` landed), and DISCARDED main's
  `auditResult` inline computation and its `onFinish` fallback recompute
  entirely (that recompute-on-a-possibly-truncated-fragment was flagged
  in #1997's own commit message as the actual defect the ordered-checks
  design fixes).
- To avoid silently losing #2001's newer accuracy, `computeTurnVerdict`
  (`verdict.ts`) gained the same two optional params
  (`detailDates`/`timezone`) and threads them into its own
  `auditNumericClaims` call; the `route.ts` call site now passes
  `detailDates`/`ctx.timezone` through, matching what the discarded
  inline code used to pass directly.
- Verification: `npm run typecheck` (tsc) exit 0; `chat-verdict.test.ts`
  + `stream/route.test.ts` — 23 passed, 0 failed; broader
  `npm run test -- --run src/test/coachhelm` — 142 files, 1467 passed, 0
  failed; `eslint` on touched files — 0 problems. `npm run build`
  (this feature's `requiredChecks` calls for one, since the touched file
  is a route handler) could NOT be completed — it failed three times on
  `ENOSPC: no space left on device` (webpack's persistent cache), a
  shared-disk exhaustion issue across this machine's worktrees (freeing
  each failed attempt's own `.next` cache only bought a few more GiB
  before the next run also filled it), not a defect in this change.
  Reported honestly rather than claimed; the task owner should re-run
  `npm run build` once disk headroom is available.

## 2026-09-23 — #1999 rebased onto #1997's new tip via cherry-pick

- PR #1999 (`agent/coachhelm-chat-claims`, addendum A7 slice 1, "wire
  claim-validator.ts into chat's turn verdict") stacks on #1997's
  `verdict.ts`/`computeTurnVerdict`, and its branch history contained an
  old `Merge remote-tracking branch 'origin/main'` commit plus the OLD
  (pre-rebase) #1997 commits directly — the same "duplicate content,
  different SHA" shape #1997 itself hit against #1992 earlier. A plain
  `git rebase --onto` against either the old #1997 tip or the merge's
  main-side commit replayed redundant history and conflicted on content
  that was already present. Resolved by identifying #1999's 3 genuinely
  unique commits (`git merge-base` against both the old #1997 tip and
  the merged-in main commit) and cherry-picking exactly those three
  onto #1997's new tip (`444869adb`) instead of rebasing the whole
  branch — 2 conflicts (both additive, both sides adding independent
  fields/checks to `verdict.ts`/`computeTurnVerdict`: kept both), a 3rd
  cherry-pick's only conflict was the generated
  `DOCUMENT_AUTHORITY_INVENTORY.md` (regenerated after).
- Two pre-existing typecheck errors surfaced only once rebased against
  #1997's stricter tsconfig path (not new regressions from the rebase
  itself): two new tests in `stream/route.test.ts` accessed
  `persisted.content.trim()` without the `as string` cast every other
  call site in the file already uses (the mock types `appendMessage`'s
  second arg as `Record<string, unknown>`, so `.content` is `unknown`);
  and `instructions.test.ts`'s `const [offBefore] = str.split(...)`
  destructure needed non-null assertions under
  `noUncheckedIndexedAccess`. Both fixed to match the file's own
  existing conventions.
- Verification: `npm run typecheck:fast` clean; the 6 directly relevant
  test files (verdict, stream/route, provenance, restore, instructions,
  situational-explanation) — 95 passed, 0 failed; broader
  `npm run test -- --run src/test/coachhelm` — 143 files, 1480 passed, 0
  failed; `eslint` on touched files — 0 problems; `flags:check` clean (7
  flags); `docs:check` clean; `markdown:ratchet` — no regressions.
  `npm run build` not attempted again this round given the prior entry's
  disk-exhaustion finding.
