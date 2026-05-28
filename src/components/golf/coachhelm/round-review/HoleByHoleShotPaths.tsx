'use client';

/**
 * Round-review section that renders a HoleShotPath card for every
 * hole in the round. Fetches the shot ledger once on mount, groups
 * by hole_number, and lays the cards out in a responsive grid.
 *
 * The shot-path visual is the v3 upgrade over the flat color-coded
 * scorecard: each hole becomes a small reconstructed map of where
 * the player's ball actually went, with hazards planted at the
 * endpoints the player logged.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { HoleShotPath } from '@/components/golf/coachhelm/v3/HoleShotPath';
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
import { RoundStripGrid } from '@/components/golf/coachhelm/round-review/RoundStripGrid';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

interface HoleRow {
  hole_number: number;
  par: number | null;
  yardage: number | null;
  score: number | null;
}

interface ShotRow extends ShotInput {
  hole_number: number;
}

interface Props {
  roundId: string;
  holes: HoleRow[];
}

export function HoleByHoleShotPaths({ roundId, holes }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [shots, setShots] = useState<ShotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase
        .from('golf_shots')
        .select(
          'hole_number, shot_number, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, miss_direction, is_penalty',
        )
        .eq('round_id', roundId)
        .order('hole_number', { ascending: true })
        .order('shot_number', { ascending: true });
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setShots([]);
        return;
      }
      setShots((data ?? []) as ShotRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, supabase]);

  const byHole = useMemo(() => {
    const map = new Map<number, ShotInput[]>();
    for (const s of shots ?? []) {
      const list = map.get(s.hole_number) ?? [];
      list.push(s);
      map.set(s.hole_number, list);
    }
    return map;
  }, [shots]);

  const hasAnyShots = (shots?.length ?? 0) > 0;

  return (
    <section>
      <Reveal>
        <div className="surface-stone rounded-3xl p-6 md:p-8 mb-4">
          <PageHeader
            eyebrow="Hole-by-hole"
            eyebrowAccent="primary"
            title="Every shot, reconstructed."
            subtitle="Each card is built from what you logged — endpoints, hazards, and putt lines come straight from your shot ledger."
          />
        </div>
      </Reveal>

      <div className="surface-matte rounded-2xl p-4 md:p-6">
        {shots === null ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 gap-3">
            {holes.map((h) => (
              <div
                key={h.hole_number}
                className="w-full aspect-[1/2.2] rounded-2xl bg-warm-100 animate-pulse"
              />
            ))}
          </div>
        ) : !hasAnyShots ? (
          <p className="text-sm text-warm-500 italic py-8 text-center">
            {error
              ? `Couldn't load shots for this round (${error}).`
              : 'No shot-level data was logged for this round — the visualization needs per-shot lies and distances.'}
          </p>
        ) : (
          <div className="space-y-5">
            {/* At-a-glance band — every hole as a tiny strip, both nines */}
            <RoundStripGrid holes={holes} shotsByHole={byHole} />

            {/* Detail grid — full card per hole */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-5 justify-items-center">
              {holes.map((h) => {
                const holeShots = byHole.get(h.hole_number) ?? [];
                const par = (h.par === 3 || h.par === 4 || h.par === 5) ? h.par : undefined;
                return (
                  <HoleShotPath
                    key={h.hole_number}
                    hole_number={h.hole_number}
                    par={par}
                    yardage={h.yardage}
                    score={h.score}
                    shots={holeShots}
                    size="card"
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
