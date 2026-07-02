/**
 * Synthetic fixture (audit N4 scanner hardening).
 *
 * Purpose: proves `scanActionFile` catches a registration that textually
 * co-occurs with its export (the file DOES contain
 * `withAdminObserved('brokenDelegationFn', ...)`) but whose export body
 * never actually calls the resulting observed const — a dead wrapper. The
 * pre-hardening scanner marked this as "wrapped" purely from string
 * co-occurrence; it should now land in `undelegatedWraps` and trip
 * `assertAreaFullyWrapped`.
 *
 * NOT a real 'use server' action file. NOT under src/app/golf/actions/**,
 * so the Task 16 global tripwire's directory walk never sees it. Read only
 * as text by `scanActionFile` (never imported at runtime), so it is safe to
 * reference `withAdminObserved` here without pulling in server-only deps.
 */

import { withAdminObserved } from '@/lib/admin/observed-action';

async function brokenDelegationFnImpl(): Promise<{ ok: true }> {
  return { ok: true };
}

const observedBrokenDelegationFn = withAdminObserved(
  'brokenDelegationFn',
  { feature: 'admin_dashboard' },
  brokenDelegationFnImpl,
);
// Referenced here (module scope, outside the export below) only to satisfy
// noUnusedLocals/no-unused-vars — the whole point of this fixture is that
// the export itself never calls it.
void observedBrokenDelegationFn;

// BUG (intentional): calls the Impl directly instead of
// `observedBrokenDelegationFn` — the registration above is dead code and a
// failure here would never be logged. The scanner must flag this.
export async function brokenDelegationFn(): Promise<{ ok: true }> {
  return brokenDelegationFnImpl();
}
