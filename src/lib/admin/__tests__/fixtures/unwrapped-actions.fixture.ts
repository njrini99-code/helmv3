/**
 * Synthetic fixture for the coverage-contract self-tests (W15 Task 16a).
 *
 * Purpose: a STABLE, permanently-unwrapped two-export file that proves
 * `scanActionFile` / `assertAreaFullyWrapped` correctly detect coverage
 * gaps. Earlier W15 batches borrowed a real production file for this role
 * (round-drafts.ts, then course-library.ts, then alerts.ts — see git
 * history of coverage-contract.foundation.test.ts) and handed it off each
 * time that file's own batch wrapped it. By Task 16a every real golf action
 * file is fully wrapped (that is the whole point of W15), so there is no
 * production file left to borrow — this fixture replaces that borrowing
 * scheme with a file that can never legitimately get wrapped.
 *
 * NOT a real 'use server' action file. NOT under src/app/golf/actions/**,
 * so the Task 16 global tripwire's directory walk never sees it. Must NEVER
 * be wrapped with withAdminObserved — that would defeat its purpose here.
 */

export async function unwrappedFixtureFnOne(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function unwrappedFixtureFnTwo(): Promise<{ ok: true }> {
  return { ok: true };
}
