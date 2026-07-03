'use client';

// =============================================================================
// src/components/baseball/player-access/ActivateRecruitingClient.tsx
//
// Thin client for the recruiting-activation surface. All auth/role/type/
// already-activated gating happens SERVER-SIDE in the page (getSessionProfile →
// redirect) before this component ever mounts, so it never renders an auth
// skeleton and can never strand on an infinite loading state. This component is
// only mounted for a signed-in, non-college player who has NOT yet activated.
//
// This is now the STATE/WRITE-PATH owner only — the Living-Annual presentation
// (hero, benefit grid, privacy panel, CommitSeal ceremony) lives in
// `ActivateRecruitingFairway`, which receives these values as props and never
// calls a mutation itself.
//
// The activation write goes through the gated `activateRecruitingExposure`
// server action so the program's recruiting_exposure_enabled toggle is enforced
// server-side (a raw client update would bypass it) — this remains the ONLY
// write. `updatePlayer` below never substitutes for it; it only syncs the
// shared auth store's cache to match what the gated action already persisted,
// and it never runs unless that action succeeded first.
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { activateRecruitingExposure } from '@/app/baseball/actions/player-access';
import { PACE } from '@/components/baseball/living-annual';
import { ActivateRecruitingFairway } from './ActivateRecruitingFairway';

export function ActivateRecruitingClient({ playerId }: { playerId: string }) {
  const router = useRouter();
  const { updatePlayer } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSeal, setShowSeal] = useState(false);

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    try {
      // Gated server action enforces the program's recruiting_exposure_enabled
      // toggle before flipping the player's activation flag. THE write.
      await activateRecruitingExposure();
      // Keep the shared auth store in sync so the destination renders activated.
      await updatePlayer?.({
        recruiting_activated: true,
        recruiting_activated_at: new Date().toISOString(),
      });
      // Fire the CommitSeal ceremony — the physical payoff of going live — and
      // only navigate once the stamp has visibly settled (spec §9 north-star
      // #2 / §4.4 STAMP PRESS: DUR.stampDown + DUR.stampSettle ≈ 380ms; PACE
      // reserves its `cinematic` (600ms) step for exactly this "stamp
      // ceremony" beat, so the redirect never cuts the seal off mid-press).
      setShowSeal(true);
      window.setTimeout(() => {
        router.push('/baseball/player/today');
      }, PACE.cinematic * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setActivating(false);
    }
  };

  return (
    <ActivateRecruitingFairway
      playerId={playerId}
      activating={activating}
      error={error}
      showSeal={showSeal}
      onActivate={handleActivate}
    />
  );
}
