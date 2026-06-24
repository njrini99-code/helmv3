'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { PuttRecord } from '@/components/golf/coachhelm/v3/PuttHeatmap/types';
import { Skeleton } from '@/components/fairway';
import { StatsSection } from './StatsSection';
import { buildPuttingHeatCells } from './putt-heatmap-cells';

const PuttingHeatmap = dynamic(
  () => import('@/components/fairway/charts/PuttingHeatmap').then((m) => m.PuttingHeatmap),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full rounded-card" /> },
);

const PuttHeatmap = dynamic(
  () => import('@/components/golf/coachhelm/v3/PuttHeatmap').then((m) => m.PuttHeatmap),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-card" /> },
);

const PAGE_SIZE = 1000;
const MAX_FETCH_ROWS = 20000;

async function fetchAllPages<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[] | null> {
  const all: T[] = [];
  for (let from = 0; from < MAX_FETCH_ROWS; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) return from === 0 ? null : all;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export function FairwayPuttingHeatmapSection({ playerId }: { playerId?: string }) {
  const supabase = useMemo(() => (playerId ? createClient() : null), [playerId]);
  const [putts, setPutts] = useState<PuttRecord[] | null>(null);

  useEffect(() => {
    if (!playerId || !supabase) {
      setPutts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const rounds = await fetchAllPages((from, to) =>
        supabase
          .from('golf_rounds')
          .select('id')
          .eq('player_id', playerId)
          .eq('status', 'completed')
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (cancelled) return;
      const roundIds = (rounds ?? []).map((r) => r.id);
      if (roundIds.length === 0) {
        setPutts([]);
        return;
      }
      const data = await fetchAllPages((from, to) =>
        supabase
          .from('golf_shots')
          .select('round_id, hole_number, putt_distance_feet, putt_made, miss_direction')
          .in('round_id', roundIds)
          .not('putt_distance_feet', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (cancelled) return;
      if (!data) {
        setPutts([]);
        return;
      }
      const records: PuttRecord[] = data
        .filter((r) => typeof r.putt_distance_feet === 'number' && r.putt_made !== null)
        .map((r) => ({
          distance_feet: r.putt_distance_feet as number,
          made: !!r.putt_made,
          miss_direction: r.miss_direction,
          hole_number: r.hole_number ?? null,
          round_id: r.round_id ?? null,
        }));
      setPutts(records);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, supabase]);

  if (!playerId) return null;
  if (putts === null) {
    return (
      <StatsSection title="Putting heatmap" description="Make rate by distance and miss direction." accent="putting">
        <Skeleton className="h-[320px] w-full rounded-card" />
      </StatsSection>
    );
  }
  if (putts.length === 0) return null;

  const grid = buildPuttingHeatCells(putts);

  return (
    <div className="flex flex-col gap-8">
      <StatsSection
        title="Putting green view"
        description="Every logged putt — made dots vs miss direction."
        accent="putting"
      >
        <PuttHeatmap putts={putts} title="Putting heatmap" />
      </StatsSection>
      {grid.cells.length > 0 ? (
        <StatsSection
          title="Make rate grid"
          description="Distance band × miss direction — green is higher make %."
          accent="putting"
        >
          <PuttingHeatmap
            title="Make rate by distance & direction"
            overline="Putting"
            takeaway="Cells dim when sample size is low."
            rows={grid.rows}
            cols={grid.cols}
            cells={grid.cells}
            height={300}
          />
        </StatsSection>
      ) : null}
    </div>
  );
}
