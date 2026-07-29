// =============================================================================
// The player-side "Activate Recruiting" prompts under the sunset.
//
// These four surfaces are the ones a buyer's demo actually walks —
// /baseball/player/today is the first screen after a player logs in — and each
// carried a promotional card for a route that now redirects.
//
// Both directions are asserted. A suite proving only "the prompt is hidden"
// would pass equally against code that deleted the nudge, and would give no
// warning the day the flag flips back — which matters more here than usual,
// because activation has no permanent nav slot: these prompts ARE how a player
// discovers the feature exists.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

const moduleFlags = vi.hoisted(() => ({ recruitingEnabled: false }));

vi.mock('@/lib/baseball/product-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
  return { ...actual, isRecruitingEnabled: () => moduleFlags.recruitingEnabled };
});

import {
  showRecruitingActivationPrompt,
  resolvePrivateProfileDisclosure,
} from '../recruiting-activation';

describe('showRecruitingActivationPrompt', () => {
  it('hides the prompt from an eligible player while recruiting is off', () => {
    moduleFlags.recruitingEnabled = false;
    expect(showRecruitingActivationPrompt(true)).toBe(false);
  });

  it('restores it for an eligible player when the module is re-enabled', () => {
    moduleFlags.recruitingEnabled = true;
    expect(showRecruitingActivationPrompt(true)).toBe(true);
  });

  it('never shows it to an ineligible player, either way', () => {
    // The caller's own eligibility rule stays authoritative — this helper only
    // ever removes prompts, it cannot introduce one. That is what makes it
    // safe to drop into four sites whose eligibility rules genuinely differ
    // (a null `activated` means "not fetched" on Today and "not yet activated"
    // on Profile).
    for (const enabled of [true, false]) {
      moduleFlags.recruitingEnabled = enabled;
      expect(showRecruitingActivationPrompt(false)).toBe(false);
    }
  });
});

describe('resolvePrivateProfileDisclosure', () => {
  it('keeps disclosing that the page is private, with no dead-end CTA', () => {
    moduleFlags.recruitingEnabled = false;
    const disclosure = resolvePrivateProfileDisclosure();

    // The notice must survive the sunset. resolvePublicProfileAccess
    // self-bypasses visibility for the profile's own player, so without it a
    // player believes this page is what recruiters see.
    expect(disclosure.body).not.toBe('');
    expect(disclosure.showActivateCta).toBe(false);
  });

  it('does not tell the player exposure is merely switched off', () => {
    // The old copy — "Recruiting exposure is off" — invites the reader to go
    // turn it on. That is not a choice available to them right now.
    moduleFlags.recruitingEnabled = false;
    expect(resolvePrivateProfileDisclosure().body).not.toMatch(/exposure is off/i);
  });

  it('restores the actionable copy when recruiting returns', () => {
    moduleFlags.recruitingEnabled = true;
    const disclosure = resolvePrivateProfileDisclosure();

    expect(disclosure.showActivateCta).toBe(true);
    expect(disclosure.body).toMatch(/exposure is off/i);
  });
});
