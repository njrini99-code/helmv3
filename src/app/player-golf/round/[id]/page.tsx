import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats } from '@/components/golf/ShotTrackingComprehensive';

export default async function RoundPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // Get the round data
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('*, golf_holes(*)')
    .eq('id', params.id)
    .single();

  if (roundError || !round) {
    notFound();
  }

  // Transform golf_holes data to the format expected by ShotTrackingComprehensive
  const holes = round.golf_holes
    .sort((a: any, b: any) => a.hole_number - b.hole_number)
    .map((hole: any) => ({
      number: hole.hole_number,
      par: hole.par,
      yardage: hole.yardage || 0,
      score: hole.score || null, // Score from database if available
    }));

  // If no holes, create a default 18-hole course (shouldn't happen with new round creation)
  if (holes.length === 0) {
    for (let i = 1; i <= 18; i++) {
      holes.push({
        number: i,
        par: 4, // Default to par 4
        yardage: 400, // Default yardage
        score: null, // No score yet
      });
    }
  }

  return (
    <ShotTrackingComprehensive
      holes={holes}
      currentHoleIndex={0} // Start at first hole
      onHoleComplete={(holeIndex: number, stats: HoleStats) => {
        // This will need to be handled in a client component wrapper
        console.log('Hole completed:', holeIndex, stats);
      }}
    />
  );
}
