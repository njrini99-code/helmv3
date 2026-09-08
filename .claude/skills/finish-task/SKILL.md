---
name: finish-task
description: Use when an implementation should be carried through to verified completion rather than stopping after the edits look right. Encodes this repo's gate sequence and the specific ways green gates have lied here before.
---

# Finish Task

Editing is not finishing. In this repo the gap between "the code looks right"
and "the change works" has bitten repeatedly, and always in the same way: a
gate went green while the thing was broken. This skill exists so that does not
keep happening.

## The gate sequence

Select checks by changed paths with `/gates`; do not run unrelated gates.
Use `set -o pipefail` for piped commands so the pipeline preserves the gate's
exit status. For application changes, run the affected typecheck, lint, and
tests; add `npm run build` for a changed `use server` surface,
`npm run test:rls` for a policy or migration change, E2E for E2E changes, and
`npm run docs:check` when generated documentation inputs changed. Config-only
changes need syntax and affected tooling checks, not the full suite.

## What a green gate does NOT prove here

Three failure modes have shipped past a fully green suite in this repo. Check
for them explicitly — no gate catches them:

1. **The bundle boundary.** `export type { … }` inside a `'use server'`
   module registers the type as a server action and throws `ReferenceError` at
   runtime. Typecheck, lint, and 8,763 unit tests were all green while golf
   messaging was 100% dead. Only `npm run build` or a real browser click
   proves this. If you touched a `'use server'` file, run the build.

2. **Single-render tests cannot see re-render bugs.** Eight green hook tests
   shipped a total sign-in hang because every one rendered once. If you
   touched a hook with a `useRef` guard beside a teardown cleanup, add a
   `rerender()` case or you have not tested it.

3. **A stale dev server serves pre-edit chunks.** Two `next` servers sharing
   one `.next` will serve old code and make a correct fix measure as broken.
   Prove the bundle is current with a selector that only exists in the new
   code before concluding a fix failed.

## Sequence

1. State the measurable completion condition before starting.
2. Implement the smallest coherent change.
3. Run the gates above that apply. Record actual exit codes — never infer.
4. Fix failures your change caused. Do not stop and hand back after the first
   red gate.
5. **Never delete, skip, weaken, or rewrite a test to get green.** If a test
   now fails legitimately, the implementation is wrong or the test encodes a
   requirement you are changing on purpose — say which.
6. For a risky, broad, security-sensitive, or schema-touching change, use an
   independent look when the risk warrants it: `verifier`, `security-reviewer`,
   or `db-migration-reviewer` as appropriate. Reviewer agents are optional and
   risk-based; do not repeat task-authorization questions.
7. Report with evidence: the commands run and their exit codes. If a claim
   rests on something unavailable locally — for example, `supabase start`
   when Docker is unavailable — name that limit once, plainly.

## Reporting

State what passed and what you could not verify. Do not hedge work that is
done and checked. Do not claim a command passed unless you ran it and saw it
pass. If part of the job is blocked, finish everything else and say exactly
what you left and why.
