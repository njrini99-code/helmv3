/**
 * W34 — player phone view.
 *
 * /dashboard/my-game-profile · player-only.
 *
 * Same content as the coach view, optimized for a vertical phone:
 * radar takes full width, persona stacks below, dimension grid is
 * 2-up. Identical data source so the player sees exactly what the
 * coach sees.
 */

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { derivePersona } from '@/lib/coachhelm/v3/genome/persona';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayMyGameProfile } from '@/components/fairway/pages/player-game';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My game profile · GolfHelm',
};

export default async function MyGameProfilePage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.player) notFound();

  const sb = await createClient();
  const playerId = session.player.id;
  const genome = await loadGenome(sb, playerId);
  const persona = genome ? derivePersona(genome.vector) : null;
  const firstName = session.player.first_name ?? 'Your';

  // Pure transforms over the SAME already-loaded genome + persona (no fetch):
  // build the serializable radar axes + dimension cells + persona text the
  // Fairway surface consumes. Locked dimensions (normalize → null) are kept
  // honest — no fabricated score.
  const cells = genome
    ? GENOME_DIMENSIONS.map((dim) => {
        const r = genome.vector[dim.id];
        const norm = r ? normalizeForRadar(dim.id, r) : null;
        return {
          id: dim.id,
          label: dim.label,
          score: norm == null ? null : Math.round(norm * 100),
          qualitative: r?.label ?? null,
        };
      })
    : [];
  const axes = cells
    .filter((c): c is typeof c & { score: number } => c.score != null)
    .map((c) => ({ label: c.label, value: c.score }));
  const strengths = (persona?.strengths ?? []).map((s) => ({
    id: s.dim_id,
    label: s.label,
    qualitative: s.qualitative,
  }));
  const watchouts = (persona?.watchouts ?? []).map((w) => ({
    id: w.dim_id,
    label: w.label,
    qualitative: w.qualitative,
  }));

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayMyGameProfile
        firstName={firstName}
        axes={axes}
        dimensions={cells}
        strengths={strengths}
        watchouts={watchouts}
        courseProfile={persona?.course_profile ?? null}
        roundsBasis={genome?.rounds_basis ?? null}
      />
    </div>
  );
}
