'use client';

import ShotTrackingFinal from '@/components/golf/ShotTrackingFinal';

const demoHoles = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: [4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4][i],
  yardage: [370, 185, 520, 390, 410, 175, 550, 405, 380, 415, 165, 530, 400, 385, 190, 545, 420, 395][i],
  score: null
}));

export default function TestPage() {
  return (
    <ShotTrackingFinal
      holes={demoHoles}
      currentHoleIndex={0}
      onHoleComplete={(idx, score, shots) => console.log({ idx, score, shots })}
    />
  );
}
