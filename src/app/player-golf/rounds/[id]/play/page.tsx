'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ShotTrackingFinal from '@/components/golf/ShotTrackingFinal';

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

export default function PlayRoundPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params.id as string;

  // Demo data - 18 holes
  // TODO: Later, load this from Supabase based on roundId
  const [holes, setHoles] = useState<Hole[]>([
    { number: 1, par: 4, yardage: 370, score: null },
    { number: 2, par: 3, yardage: 185, score: null },
    { number: 3, par: 5, yardage: 520, score: null },
    { number: 4, par: 4, yardage: 390, score: null },
    { number: 5, par: 4, yardage: 410, score: null },
    { number: 6, par: 3, yardage: 175, score: null },
    { number: 7, par: 5, yardage: 550, score: null },
    { number: 8, par: 4, yardage: 405, score: null },
    { number: 9, par: 4, yardage: 380, score: null },
    { number: 10, par: 4, yardage: 415, score: null },
    { number: 11, par: 3, yardage: 165, score: null },
    { number: 12, par: 5, yardage: 530, score: null },
    { number: 13, par: 4, yardage: 400, score: null },
    { number: 14, par: 4, yardage: 385, score: null },
    { number: 15, par: 3, yardage: 190, score: null },
    { number: 16, par: 5, yardage: 545, score: null },
    { number: 17, par: 4, yardage: 420, score: null },
    { number: 18, par: 4, yardage: 395, score: null },
  ]);

  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);

  const handleHoleComplete = (holeIndex: number, score: number, shots: any[]) => {
    console.log('Golf Player - Hole complete:', {
      roundId,
      holeIndex,
      holeNumber: holeIndex + 1,
      score,
      totalShots: shots.length
    });

    // Update score in state
    const updatedHoles = [...holes];
    const currentHole = updatedHoles[holeIndex];
    if (currentHole) {
      currentHole.score = score;
      setHoles(updatedHoles);
    }

    // TODO: Save to Supabase
    // await saveHoleToDatabase(roundId, holeIndex + 1, score, shots);

    // Move to next hole or finish
    if (holeIndex < 17) {
      setCurrentHoleIndex(holeIndex + 1);
      console.log(`Moving to hole ${holeIndex + 2}`);
    } else {
      // Round complete!
      const totalScore = updatedHoles.reduce((sum, h) => sum + (h.score || 0), 0);
      console.log('Round complete! Total score:', totalScore);
      alert(`Round complete! Total score: ${totalScore}`);
      router.push('/player-golf');
    }
  };

  return (
    <ShotTrackingFinal
      holes={holes}
      currentHoleIndex={currentHoleIndex}
      onHoleComplete={handleHoleComplete}
    />
  );
}
