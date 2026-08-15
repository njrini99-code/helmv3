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

Run these from the repo root. Never pipe a gate without `set -o pipefail` —
a pipeline reports the LAST command's status, so `npm test | tail` exits 0
while the suite fails. `guard-bash.sh` blocks that shape; do not work around it.

```bash
npm run typecheck        # tsc --noEmit
npm run lint
npm test                 # unit only, fast
npm run build            # the one that catches bundle-boundary breakage
```

Add when the change touches them:

```bash
npm run test:integration     # *.integration.test.{ts,tsx}
npm run test:rls             # *.rls.test.{ts,tsx} — any RLS/policy change
npm run test:e2e             # Playwright
npm run docs:check           # any AUTOGEN inventory source changed
```

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
6. For anything risky, broad, security-sensitive, or schema-touching, get an
   independent look: the `verifier` agent, or `security-reviewer` /
   `db-migration-reviewer` as appropriate. The implementer does not grade its
   own homework.
7. Report with evidence: the commands run and their exit codes. If a claim
   rests on something you could not run locally — `supabase start` needs
   Docker, which this machine does not have — name that limit once, plainly.

## Reporting

State what passed and what you could not verify. Do not hedge work that is
done and checked. Do not claim a command passed unless you ran it and saw it
pass. If part of the job is blocked, finish everything else and say exactly
what you left and why.
