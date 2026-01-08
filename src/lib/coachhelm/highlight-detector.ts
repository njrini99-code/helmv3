import { Highlight, HighlightType, RoundStats } from './types';

interface GolfHole {
  hole_number: number;
  par: number | null;
  score: number | null;
  sand_save_made?: boolean | null;
  sand_save_attempt?: boolean | null;
}

interface RoundWithHoles {
  holes?: GolfHole[] | null;
}

export function detectHighlights(
  round: RoundWithHoles,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _roundStats: RoundStats,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _playerAverages: RoundStats
): Highlight[] {
  const highlights: Highlight[] = [];
  const holes = round.holes || [];

  // 1. Find eagles
  holes.forEach((hole: GolfHole) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);

    if (scoreDiff <= -2) {
      highlights.push({
        id: `eagle-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'eagle',
        title: scoreDiff === -2 ? 'Eagle!' : 'Albatross!',
        description: `Made ${scoreDiff === -2 ? 'eagle' : 'albatross'} on the par ${hole.par} ${getHoleDescription(hole.hole_number)}`,
        impact: `${Math.abs(scoreDiff)} under par`,
        emoji: '🦅',
      });
    }
  });

  // 2. Find birdie streaks (2+ consecutive)
  let streak = 0;
  let streakStart = 0;

  holes.forEach((hole: GolfHole, index: number) => {
    const scoreDiff = (hole.score || 0) - (hole.par || 4);

    if (scoreDiff === -1) {
      if (streak === 0) streakStart = index;
      streak++;
    } else {
      if (streak >= 2) {
        const startHole = holes[streakStart];
        const endHole = holes[streakStart + streak - 1];
        if (!startHole || !endHole) {
          streak = 0;
          return;
        }
        highlights.push({
          id: `birdie-streak-${streakStart}`,
          holeNumber: startHole.hole_number,
          type: 'birdie_streak',
          title: `${streak} Birdies in a Row`,
          description: `Made ${streak} consecutive birdies on holes ${startHole.hole_number}-${endHole.hole_number}`,
          impact: `${streak} under par in ${streak} holes`,
          emoji: '🔥',
        });
      }
      streak = 0;
    }
  });

  // Check end of round
  if (streak >= 2) {
    const startHole = holes[streakStart];
    if (startHole) {
      highlights.push({
        id: `birdie-streak-${streakStart}`,
        holeNumber: startHole.hole_number,
        type: 'birdie_streak',
        title: `${streak} Birdies in a Row`,
        description: `Finished with ${streak} consecutive birdies`,
        impact: `${streak} under par in ${streak} holes`,
        emoji: '🔥',
      });
    }
  }

  // 3. Find standalone birdies (if no streaks already captured)
  if (!highlights.some(h => h.type === 'birdie_streak')) {
    holes.forEach((hole: GolfHole) => {
      const scoreDiff = (hole.score || 0) - (hole.par || 4);
      if (scoreDiff === -1) {
        highlights.push({
          id: `birdie-${hole.hole_number}`,
          holeNumber: hole.hole_number,
          type: 'birdie',
          title: 'Birdie',
          description: `Birdie on the par ${hole.par} ${getHoleDescription(hole.hole_number)}`,
          impact: '1 under par',
          emoji: '🐦',
        });
      }
    });
  }

  // 4. Find great sand saves
  holes.forEach((hole: GolfHole) => {
    if (hole.sand_save_made && hole.sand_save_attempt) {
      const scoreDiff = (hole.score || 0) - (hole.par || 4);
      if (scoreDiff <= 0) {
        highlights.push({
          id: `sand-save-${hole.hole_number}`,
          holeNumber: hole.hole_number,
          type: 'sand_save',
          title: 'Sand Save',
          description: `Got up and down from the bunker to save ${scoreDiff === 0 ? 'par' : 'birdie'}`,
          impact: 'Saved at least 1 stroke',
          emoji: '🏖️',
        });
      }
    }
  });

  // 5. Find bounce backs (birdie or par after double+)
  holes.forEach((hole: GolfHole, index: number) => {
    if (index === 0) return;

    const prevHole = holes[index - 1];
    if (!prevHole) return;
    const prevDiff = (prevHole.score || 0) - (prevHole.par || 4);
    const currDiff = (hole.score || 0) - (hole.par || 4);

    if (prevDiff >= 2 && currDiff <= 0) {
      highlights.push({
        id: `bounce-back-${hole.hole_number}`,
        holeNumber: hole.hole_number,
        type: 'bounce_back',
        title: 'Bounce Back',
        description: `Made ${currDiff < 0 ? 'birdie' : 'par'} right after a ${prevDiff === 2 ? 'double bogey' : 'big number'}`,
        impact: 'Great mental recovery',
        emoji: '🔄',
      });
    }
  });

  // 6. Strong finish (last 3 holes under par)
  const lastThree = holes.slice(-3);
  const lastThreeTotal = lastThree.reduce((sum: number, h: GolfHole) => {
    return sum + ((h.score || 0) - (h.par || 4));
  }, 0);

  if (lastThreeTotal < 0) {
    highlights.push({
      id: 'strong-finish',
      holeNumber: 16,
      type: 'strong_finish',
      title: 'Strong Finish',
      description: `Finished ${Math.abs(lastThreeTotal)} under par over the final 3 holes`,
      impact: `${Math.abs(lastThreeTotal)} under on 16-18`,
      emoji: '🏁',
    });
  }

  // Sort by hole number, limit to top 4
  return highlights
    .sort((a, b) => {
      // Prioritize: eagles > birdie streaks > strong finish > others
      const priority: Record<HighlightType, number> = {
        eagle: 1,
        birdie_streak: 2,
        strong_finish: 3,
        bounce_back: 4,
        sand_save: 5,
        birdie: 6,
        long_putt_made: 7,
        great_approach: 8,
        up_and_down: 9,
        par_save: 10,
      };
      return priority[a.type] - priority[b.type];
    })
    .slice(0, 4);
}

function getHoleDescription(holeNumber: number): string {
  if (holeNumber <= 9) return `${holeNumber}th`;
  const suffix = holeNumber === 11 ? 'th' : holeNumber === 12 ? 'th' : holeNumber === 13 ? 'th' :
    holeNumber % 10 === 1 ? 'st' : holeNumber % 10 === 2 ? 'nd' : holeNumber % 10 === 3 ? 'rd' : 'th';
  return `${holeNumber}${suffix}`;
}
