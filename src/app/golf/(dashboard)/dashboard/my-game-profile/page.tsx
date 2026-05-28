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
                        hex: 'var(--color-primary-600)',
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
          <Reveal staggerIndex={1}>
            <section className="surface-stone rounded-3xl p-10 text-center">
              <span
                aria-hidden
                className="inline-flex h-12 w-12 rounded-full bg-primary-50 text-primary-700 items-center justify-center mb-4"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 7 v5 l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <h2 className="text-lg font-medium text-warm-900 tracking-tight">
                Your genome is warming up
              </h2>
              <p className="mt-2 text-sm text-warm-600 leading-relaxed max-w-xs mx-auto">
                It needs 8+ completed rounds before the radar lights up. Keep playing —
                we&apos;ll surface your shape automatically.
              </p>
            </section>
          </Reveal>
        )}
      </div>
    </AnimatedPage>
  );
}
