/**
 * W34 — coach desktop genome view.
 *
 * /dashboard/coachhelm/genome/[playerId] · coach-only.
 *
 * Layout:
 *   ┌──────── Header (player name + meta) ──────────┐
 *   │ ──────────────────────────────────────────────│
 *   │  RADAR (left)  │   STRENGTHS / WATCHOUTS      │
 *   │                │   COURSE PROFILE             │
 *   │ ──────────────────────────────────────────────│
 *   │  DIMENSION GRID (4-up at lg, 3-up at md)      │
 *   └────────────────────────────────────────────────┘
 */

import Link from 'next/link';
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

interface PageProps {
  params: Promise<{ playerId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { playerId } = await params;
  const sb = await createClient();
  const { data } = await sb
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  const name = data ? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() : 'Player';
  return { title: `${name} · Genome · CoachHelm` };
}

export default async function CoachGenomePage({ params }: PageProps) {
  const { playerId } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect(`/golf/dashboard/coachhelm/genome/${playerId}/forbidden`);

  const sb = await createClient();
  const { data: player } = await sb
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  if (!player) notFound();

  const genome = await loadGenome(sb, playerId);
  const persona = genome ? derivePersona(genome.vector) : null;
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title="Genome"
          backHref="/golf/dashboard/coachhelm"
          backLabel="CoachHelm"
        />
      </AnimatedItem>

      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* ----- Header plinth ----- */}
        <Reveal>
          <header className="surface-stone rounded-3xl p-6 md:p-8 mb-6 md:mb-8">
            <p className="text-eyebrow font-medium uppercase tracking-[0.14em] text-warm-500 mb-1.5">
              Game profile
            </p>
            {/* a11y W3D: page h1 is supplied by the consolidated PageHeader
                (MobileNavHeader) above; demote this in-content title to <h2>
                so the page exposes exactly one semantic <h1>. The className
                drives the look, so the visual treatment is unchanged. */}
            <h2 className="text-3xl md:text-4xl font-medium text-warm-900 tracking-tight">
              {name}
            </h2>
            <div className="mt-3 text-sm text-warm-600">
              {genome ? (
                <>
                  {genome.rounds_basis} rounds · last refreshed{' '}
                  {genome.computed_at ? formatAgo(genome.computed_at) : 'just now'}
                </>
              ) : (
                <>No genome computed yet — the nightly cron seeds new players.</>
              )}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Link
                href={`/golf/dashboard/coachhelm/genome/compare?p1=${playerId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-warm-900 text-white text-sm font-medium hover:bg-warm-800 transition shadow-[0_8px_18px_-10px_rgba(28,25,23,0.45)] v3-lift"
              >
                Compare
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                  <path d="M3 8h9 M9 4 l4 4 l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </header>
        </Reveal>

        {/* ----- Radar + Persona ----- */}
        {genome && persona && (
          <Reveal staggerIndex={1}>
            <section className="surface-matte rounded-3xl p-6 md:p-8 mb-6 md:mb-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 flex items-center justify-center min-w-0">
                <GenomeRadar
                  series={
                    [
                      {
                        label: name,
                        colorClass: 'primary-600',
                        hex: 'var(--color-primary-600)',
                        vector: genome.vector,
                      },
                    ] satisfies RadarSeries[]
                  }
                />
              </div>
              <div className="lg:col-span-5">
                <GenomePersonaPanel persona={persona} />
              </div>
            </section>
          </Reveal>
        )}

        {/* ----- Dimension grid ----- */}
        {genome && (
          <Reveal staggerIndex={2}>
            <section>
              <header className="mb-4">
                <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
                  Dimensions
                </h2>
                <p className="text-sm text-warm-500">
                  8 of 80 dimensions live — more land as data sources mature.
                </p>
              </header>
              <GenomeDimensionGrid vector={genome.vector} />
            </section>
          </Reveal>
        )}

        {/* ----- Empty state when no genome computed yet ----- */}
        {!genome && (
          <Reveal staggerIndex={1}>
            <section className="surface-stone rounded-3xl p-10 text-center">
              <span
                aria-hidden
                className="inline-flex h-12 w-12 rounded-full bg-primary-50 text-primary-700 items-center justify-center mb-4"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 12 l3 3 l5 -6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 className="text-lg font-medium text-warm-900 tracking-tight">
                {name}&apos;s genome hasn&apos;t been computed yet
              </h2>
              <p className="mt-2 text-sm text-warm-600 leading-relaxed max-w-md mx-auto">
                The nightly cron will seed this player automatically. To trigger now, hit{' '}
                <code className="font-mono text-eyebrow bg-warm-100 px-1.5 py-0.5 rounded">
                  POST /api/coachhelm/v3/genome/compute
                </code>{' '}
                with player_id <span className="font-mono text-eyebrow">{playerId}</span>.
              </p>
            </section>
          </Reveal>
        )}
      </div>
    </AnimatedPage>
  );
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (86400_000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}
