'use client';

import { useState } from 'react';
import { ShotTracking } from '@/components/golf/shot-tracking/ShotTracking';

// Sample holes data - in production, this would come from API based on course_id
const sampleHoles = [
  { number: 1, par: 5, yardage: 520, score: null, current: true },
  { number: 2, par: 4, yardage: 425, score: null, current: false },
  { number: 3, par: 3, yardage: 185, score: null, current: false },
  { number: 4, par: 4, yardage: 390, score: null, current: false },
  { number: 5, par: 4, yardage: 410, score: null, current: false },
  { number: 6, par: 3, yardage: 175, score: null, current: false },
  { number: 7, par: 5, yardage: 550, score: null, current: false },
  { number: 8, par: 4, yardage: 405, score: null, current: false },
  { number: 9, par: 4, yardage: 380, score: null, current: false },
  { number: 10, par: 4, yardage: 415, score: null, current: false },
  { number: 11, par: 3, yardage: 165, score: null, current: false },
  { number: 12, par: 5, yardage: 530, score: null, current: false },
  { number: 13, par: 4, yardage: 400, score: null, current: false },
  { number: 14, par: 4, yardage: 385, score: null, current: false },
  { number: 15, par: 3, yardage: 190, score: null, current: false },
  { number: 16, par: 5, yardage: 545, score: null, current: false },
  { number: 17, par: 4, yardage: 420, score: null, current: false },
  { number: 18, par: 4, yardage: 395, score: null, current: false },
];

export default function RoundPage({ params }: { params: { id: string } }) {
  const [holes, setHoles] = useState(sampleHoles);

  const handleHoleComplete = async (hole: any, shots: any[]) => {
    console.log('Hole completed:', hole.number, 'Shots:', shots);

    // TODO: Save shots to database
    // await saveShotsToDatabase(params.id, hole.number, shots);
  };

  return (
    <div>
      <ShotTracking holes={holes} onHoleComplete={handleHoleComplete} />
    </div>
  );
}
