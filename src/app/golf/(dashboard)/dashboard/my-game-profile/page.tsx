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
import { GenomeRadar, type RadarSeries } from '@/components/golf/coachhelm/v3/Genome/GenomeRadar';
import { GenomePersonaPanel } from '@/components/golf/coachhelm/v3/Genome/GenomePersonaPanel';
import { GenomeDimensionGrid } from '@/components/golf/coachhelm/v3/Genome/GenomeDimensionGrid';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Reveal } from '@/components/ui/reveal';
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

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title="Game profile"
          backHref="/golf/dashboard/hub"
          backLabel="Hub"
        />
      </AnimatedItem>

      <div className="max-w-xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <Reveal>
          <header className="mb-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-warm-500 mb-1.5">
              Your game profile
            </p>
            <h1 className="text-3xl font-medium text-warm-900 tracking-tight">
              {firstName}&apos;s genome
            </h1>
            {genome && (
              <p className="mt-2 text-sm text-warm-600">
                {genome.rounds_basis} rounds in your window.
              </p>
            )}
          </header>
        </Reveal>

        {genome && persona ? (
          <>
            <Reveal staggerIndex={1}>
              <section className="surface-stone rounded-3xl p-5 md:p-7 mb-6 flex items-center justify-center">
                <GenomeRadar
                  size={320}
                  series={
                    [
                      {
                        label: firstName,
                        colorClass: 'primary-600',
                        hex: '#16A34A',
                        vector: genome.vector,
                      },
                    ] satisfies RadarSeries[]
                  }
                />
              </section>
            </Reveal>

            <Reveal staggerIndex={2}>
              <section className="surface-matte rounded-3xl p-6 mb-6">
                <GenomePersonaPanel persona={persona} />
              </section>
            </Reveal>

            <Reveal staggerIndex={3}>
              <section>
                <h2 className="text-[11px] uppercase tracking-[0.14em] text-warm-500 mb-3">
                  Dimensions
                </h2>
                <GenomeDimensionGrid vector={genome.vector} />
              </section>
            </Reveal>
          </>
        ) : (
          <section className="surface-matte rounded-3xl p-8 text-center">
            <p className="text-sm text-warm-600">
              Your genome will appear after you have 8+ completed rounds and the nightly
              compute runs.
            </p>
          </section>
        )}
      </div>
    </AnimatedPage>
  );
}
