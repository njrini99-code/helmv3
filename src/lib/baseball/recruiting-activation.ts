import { isRecruitingEnabled } from '@/lib/baseball/product-modules';

/**
 * The player-side recruiting-activation prompts, under the sunset.
 *
 * WHAT WAS WRONG. Four player surfaces carry a one-time nudge —
 * "Activate recruiting to be seen by college coaches", a green button reading
 * **Activate Recruiting** — pointing at `/baseball/dashboard/activate`:
 *
 *   - `/baseball/player/today`            (the player HOME; first screen after login)
 *   - `/baseball/dashboard/profile`
 *   - `/baseball/player/passport`
 *   - `/baseball/player/[id]`             (their own public profile, self-view only)
 *
 * That route is now module-gated and redirects. So the primary player screen
 * in a demo opened with a promotional card selling the one module the product
 * is not shipping, whose button went nowhere. The nudge is deliberately
 * persistent — activation has no permanent rail slot by design, so these
 * surfaces ARE the discovery path — which is exactly why leaving it in place
 * was worse than an ordinary stale link.
 *
 * WHY A GATE ON THE CALLER'S ANSWER, NOT A REPLACEMENT FOR IT. The four sites
 * decide eligibility differently and the differences are real: Today and
 * Passport read a fetched `{ activated }` object where `null` means "not
 * fetched / not applicable" and must NOT prompt, while Profile computes
 * `!isCollegePlayer && recruiting_activated !== true`, where a null column
 * means "not activated yet" and SHOULD prompt. Collapsing those into one
 * eligibility rule here would silently change who gets prompted the day
 * recruiting returns. So each caller keeps its own rule and passes the answer
 * in; this adds only the module gate — the same read-time shape as
 * `resolveCalendarEmptyState` and `resolveDifferentiator`.
 */
export function showRecruitingActivationPrompt(playerIsEligible: boolean): boolean {
  return playerIsEligible && isRecruitingEnabled();
}

/**
 * The self-view disclosure on a player's own public profile.
 *
 * This one is NOT simply hidden, because the fact it discloses stays true and
 * stays load-bearing: `resolvePublicProfileAccess` self-bypasses every
 * visibility check for the profile's own player, so without a notice a player
 * believes this page is what recruiters see. Under the sunset nobody else can
 * open it at all — so the notice matters MORE, and only its explanation and
 * its call to action are wrong.
 *
 * The old body said recruiting exposure "is off", which invited the reader to
 * go turn it on. That is not a choice available to them right now, so saying
 * it would be a small lie told by omission.
 */
export interface PrivateProfileDisclosure {
  body: string;
  /** Whether to render the "Activate Recruiting" link. */
  showActivateCta: boolean;
}

export function resolvePrivateProfileDisclosure(): PrivateProfileDisclosure {
  if (!isRecruitingEnabled()) {
    return {
      body:
        "You're viewing your own profile. Recruiting isn't part of Helm right now, so this page stays private to you and your program.",
      showActivateCta: false,
    };
  }

  return {
    body:
      "You're viewing your own public profile. Recruiting exposure is off, so college coaches can't actually find or open this link yet.",
    showActivateCta: true,
  };
}
