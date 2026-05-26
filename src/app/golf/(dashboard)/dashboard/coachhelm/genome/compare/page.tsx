/**
 * W34 — coach desktop genome compare.
 *
 * /dashboard/coachhelm/genome/compare?p1=&p2=  · coach-only.
 *
 * Two players overlaid on the same radar so the coach can see "who's
 * the better fit for course X" at a glance. p2 is optional — when
 * omitted, this renders the same single-radar view as /[playerId]
 * but with a player picker to add the second.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadGenomes } from '@/lib/coachhelm/v3/genome/loader';
import { GenomeRadar, type RadarSeries } from '@/components/golf/coachhelm/v3/Genome/GenomeRadar';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Reveal } from '@/components/ui/reveal';
import type { Metadata } from 'next';

interface PageProps {
  searchParams: Promise<{ p1?: string; p2?: string }>;
}

export const metadata: Metadata = {
  title: 'Compare players · Genome · CoachHelm',
};

const PLAYER_A_HEX = '#16A34A'; // helm green
const PLAYER_B_HEX = '#F59E0B'; // amber 500

export default async function GenomeComparePage({ searchParams }: PageProps) {
  const { p1, p2 } = await searchParams;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const sb = await createClient();

  // Player roster picker source — all active players the coach can see.
  const { data: rosterRows } = await sb
    .from('golf_team_members')
    .select('player_id, player:golf_players(id, first_name, last_name)')
    .eq('status', 'active');
  const roster = (rosterRows ?? [])
    .filter((r) => r.player && typeof r.player === 'object' && 'first_name' in r.player)
    .map((r) => {
      const p = r.player as { id: string; first_name: string; last_name: string };
      return { id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() };
    });

  const ids = [p1, p2].filter(Boolean) as string[];
  const genomes = ids.length > 0 ? await loadGenomes(sb, ids) : [];
  const genomeById = new Map(genomes.map((g) => [g.player_id, g]));

  const playerA = p1 ? roster.find((r) => r.id === p1) : null;
  const playerB = p2 ? roster.find((r) => r.id === p2) : null;
  const a = playerA && genomeById.get(playerA.id);
  const b = playerB && genomeById.get(playerB.id);

  const series: RadarSeries[] = [];
  if (a && playerA) {
    series.push({ label: playerA.name, colorClass: 'primary-600', hex: PLAYER_A_HEX, vector: a.vector });
  }
  if (b && playerB) {
    series.push({ label: playerB.name, colorClass: 'amber-500', hex: PLAYER_B_HEX, vector: b.vector });
  }

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader title="Compare" backHref="/golf/dashboard/coachhelm" backLabel="CoachHelm" />
      </AnimatedItem>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <Reveal>
          <header className="surface-stone rounded-3xl p-6 md:p-8 mb-6 md:mb-8">
            <p className="text-[11px] uppercase tracking-[0.14em] text-warm-500 mb-1.5">
              Compare
            </p>
            <h1 className="text-2xl md:text-3xl font-medium text-warm-900 tracking-tight">
              {playerA && playerB
                ? `${playerA.name} vs ${playerB.name}`
                : playerA
                  ? `Add a second player to compare ${playerA.name}`
                  : 'Pick two players to compare'}
            </h1>
          </header>
        </Reveal>

        <Reveal staggerIndex={1}>
          <section className="surface-matte rounded-3xl p-6 md:p-8 mb-6 md:mb-8">
            {series.length === 0 ? (
              <p className="text-sm text-warm-500 text-center py-8">
                Pick a player from the list below to start.
              </p>
            ) : (
              <div className="flex items-center justify-center">
                <GenomeRadar size={460} series={series} />
              </div>
            )}
            {series.length > 0 && (
              <div className="mt-6 flex items-center justify-center gap-6 text-sm">
                {series.map((s) => (
                  <span key={s.label} className="flex items-center gap-2 text-warm-700">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.hex }}
                    />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal staggerIndex={2}>
          <section>
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-warm-500 mb-3">
              Pick players
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PlayerColumn
                heading="Player 1"
                selectedId={playerA?.id ?? null}
                otherId={playerB?.id ?? null}
                roster={roster}
                paramName="p1"
                otherSlot={p2}
              />
              <PlayerColumn
                heading="Player 2"
                selectedId={playerB?.id ?? null}
                otherId={playerA?.id ?? null}
                roster={roster}
                paramName="p2"
                otherSlot={p1}
              />
            </div>
          </section>
        </Reveal>
      </div>
    </AnimatedPage>
  );
}

function PlayerColumn({
  heading,
  selectedId,
  otherId,
  roster,
  paramName,
  otherSlot,
}: {
  heading: string;
  selectedId: string | null;
  otherId: string | null;
  roster: { id: string; name: string }[];
  paramName: 'p1' | 'p2';
  /** Currently-selected value for the OTHER slot. Preserved in links. */
  otherSlot: string | undefined;
}) {
  const otherParam = paramName === 'p1' ? 'p2' : 'p1';
  return (
    <div className="surface-matte rounded-2xl p-4">
      <h3 className="text-[11px] uppercase tracking-[0.14em] text-warm-500 mb-3">
        {heading}
      </h3>
      <ul role="list" className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {roster.map((p) => {
          const isSelected = p.id === selectedId;
          const isOther = p.id === otherId;
          const params = new URLSearchParams();
          params.set(paramName, p.id);
          if (otherSlot) params.set(otherParam, otherSlot);
          const href = `/golf/dashboard/coachhelm/genome/compare?${params.toString()}`;
          return (
            <li key={p.id}>
              <Link
                href={href}
                aria-current={isSelected ? 'true' : undefined}
                aria-disabled={isOther || undefined}
                tabIndex={isOther ? -1 : undefined}
                className={`group block px-3 py-2 rounded-lg text-sm v3-lift transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] ${
                  isSelected
                    ? 'bg-warm-900 text-white'
                    : isOther
                      ? 'text-warm-400 cursor-not-allowed pointer-events-none'
                      : 'text-warm-800 hover:bg-warm-100'
                }`}
              >
                {p.name}
                {isOther && <span className="text-[10px] ml-2 opacity-60">(in other slot)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
