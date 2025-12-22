'use client';

import ShotTrackingFinal from '@/components/golf/ShotTrackingFinal';

export default function DemoShotTrackingPage() {
  // Mock data - no database needed!
  const mockHoles = Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: i % 3 === 0 ? 3 : i % 5 === 0 ? 5 : 4,
    yardage: i % 3 === 0 ? 180 : i % 5 === 0 ? 520 : 400,
  }));

  return (
    <ShotTrackingFinal
      roundId="demo-round-123"
      holes={mockHoles}
      startingHole={1}
      courseName="Pebble Beach Golf Links (DEMO)"
      teesPlayed="Championship Tees"
      courseRating={74.5}
      courseSlope={145}
    />
  );
}
