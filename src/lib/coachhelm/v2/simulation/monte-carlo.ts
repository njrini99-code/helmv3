/**
 * Monte Carlo Simulation Engine
 *
 * Runs 10,000 simulated tournament outcomes for strategic lineup
 * and performance decisions. Uses Box-Muller transform for normal
 * sampling -- no external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  playerId: string;
  name: string;
  scoringMean: number;       // Average score to par
  scoringStdDev: number;     // Score volatility
  recentForm?: number;       // Adjustment from baseline (-2 to +2)
}

export interface TournamentSimulation {
  players: Array<{
    playerId: string;
    name: string;
    expectedFinish: number;        // Average finish position
    winProbability: number;        // % chance of winning
    top5Probability: number;       // % chance of top 5
    top10Probability: number;
    expectedScore: number;         // Expected total score to par
    scoreRange: { low: number; high: number };  // 90% confidence interval
    finishDistribution: Record<number, number>; // position -> probability
  }>;
  simulationCount: number;
  roundsPerTournament: number;
}

export interface LineupOptimization {
  bestLineup: string[];             // Player IDs
  expectedTeamScore: number;        // Sum of top N scores
  alternatives: Array<{
    lineup: string[];
    expectedScore: number;
    scoreDelta: number;             // vs best lineup
  }>;
  playerContributions: Record<string, number>;  // Expected contribution per player
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ROUNDS = 4;
const DEFAULT_SIMULATIONS = 10_000;
const LINEUP_SIMULATIONS = 5_000;
const MAX_EXHAUSTIVE_COMBOS = 252;

// ---------------------------------------------------------------------------
// Box-Muller Normal Sampling
// ---------------------------------------------------------------------------

/**
 * Generate a normally distributed random number using the Box-Muller transform.
 */
export function sampleNormal(mean: number, stdDev: number): number {
  let u1 = 0;
  let u2 = 0;
  // Avoid log(0) by rejecting exact 0
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();

  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

// ---------------------------------------------------------------------------
// Tournament Simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a tournament N times and compute finish probabilities, expected
 * scores, and score ranges for every player in the field.
 */
export function simulateTournament(
  players: PlayerProfile[],
  rounds: number = DEFAULT_ROUNDS,
  simulations: number = DEFAULT_SIMULATIONS,
): TournamentSimulation {
  const n = players.length;

  // Pre-compute effective means (apply recentForm adjustment)
  const effectiveMeans: number[] = [];
  const stdDevs: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = players[i]!;
    effectiveMeans.push(p.scoringMean + (p.recentForm ?? 0));
    stdDevs.push(p.scoringStdDev);
  }

  // Accumulators per player — flat arrays for performance
  // finishCounts[pi * n + pos] = count
  const finishCounts: number[] = new Array(n * n).fill(0);
  // totalScores[pi][sim] — we need to sort per player later
  const totalScores: number[][] = [];
  for (let i = 0; i < n; i++) {
    totalScores.push(new Array<number>(simulations));
  }

  for (let sim = 0; sim < simulations; sim++) {
    // Simulate total scores for all players
    const scores: number[] = new Array(n);
    for (let pi = 0; pi < n; pi++) {
      let total = 0;
      for (let r = 0; r < rounds; r++) {
        total += sampleNormal(effectiveMeans[pi]!, stdDevs[pi]!);
      }
      scores[pi] = total;
      totalScores[pi]![sim] = total;
    }

    // Rank players (lower score = better finish in golf)
    const indices = Array.from({ length: n }, (_, i) => i);
    indices.sort((a, b) => scores[a]! - scores[b]!);

    // Assign finish positions (1-indexed)
    for (let rank = 0; rank < n; rank++) {
      const playerIdx = indices[rank]!;
      const fcIdx = playerIdx * n + rank;
      finishCounts[fcIdx] = (finishCounts[fcIdx] ?? 0) + 1;
    }
  }

  // Build results
  const playerResults = players.map((player, pi) => {
    const scores = totalScores[pi]!;
    scores.sort((a, b) => a - b);

    let scoreSum = 0;
    for (let i = 0; i < simulations; i++) {
      scoreSum += scores[i]!;
    }
    const expectedScore = scoreSum / simulations;

    // 90% confidence interval: 5th and 95th percentile
    const lowIdx = Math.floor(simulations * 0.05);
    const highIdx = Math.floor(simulations * 0.95);

    // Finish distribution and probabilities
    const finishDistribution: Record<number, number> = {};
    let winCount = 0;
    let top5Count = 0;
    let top10Count = 0;
    let totalFinish = 0;

    for (let pos = 0; pos < n; pos++) {
      const count = finishCounts[pi * n + pos]!;
      if (count > 0) {
        finishDistribution[pos + 1] = count / simulations;
      }
      if (pos === 0) winCount = count;
      if (pos < 5) top5Count += count;
      if (pos < 10) top10Count += count;
      totalFinish += count * (pos + 1);
    }

    return {
      playerId: player.playerId,
      name: player.name,
      expectedFinish: totalFinish / simulations,
      winProbability: winCount / simulations,
      top5Probability: top5Count / simulations,
      top10Probability: top10Count / simulations,
      expectedScore: Math.round(expectedScore * 100) / 100,
      scoreRange: {
        low: Math.round(scores[lowIdx]! * 100) / 100,
        high: Math.round(scores[highIdx]! * 100) / 100,
      },
      finishDistribution,
    };
  });

  return {
    players: playerResults,
    simulationCount: simulations,
    roundsPerTournament: rounds,
  };
}

// ---------------------------------------------------------------------------
// Lineup Optimization
// ---------------------------------------------------------------------------

/**
 * Yield all C(n, k) combinations as arrays of indices.
 */
function getCombinations(n: number, k: number): number[][] {
  const results: number[][] = [];
  const combo = Array.from({ length: k }, (_, i) => i);

  for (;;) {
    results.push([...combo]);
    // Advance to next combination
    let i = k - 1;
    while (i >= 0 && combo[i] === n - k + i) i--;
    if (i < 0) break;
    combo[i]!++;
    for (let j = i + 1; j < k; j++) {
      combo[j] = combo[j - 1]! + 1;
    }
  }

  return results;
}

/**
 * Count C(n, k) combinations.
 */
function combinationCount(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * Simulate total team score for a given lineup (sum of members' tournament
 * scores). Lower is better in golf.
 */
function simulateTeamScore(
  roster: PlayerProfile[],
  lineupIndices: number[],
  rounds: number,
  simulations: number,
): number {
  const effectiveMeans: number[] = [];
  const stdDevs: number[] = [];
  for (let i = 0; i < roster.length; i++) {
    const p = roster[i]!;
    effectiveMeans.push(p.scoringMean + (p.recentForm ?? 0));
    stdDevs.push(p.scoringStdDev);
  }

  let totalTeamScore = 0;

  for (let sim = 0; sim < simulations; sim++) {
    let teamScore = 0;
    for (let li = 0; li < lineupIndices.length; li++) {
      const idx = lineupIndices[li]!;
      let playerTotal = 0;
      for (let r = 0; r < rounds; r++) {
        playerTotal += sampleNormal(effectiveMeans[idx]!, stdDevs[idx]!);
      }
      teamScore += playerTotal;
    }
    totalTeamScore += teamScore;
  }

  return totalTeamScore / simulations;
}

/**
 * Find the optimal lineup of `lineupSize` players from the given roster.
 *
 * If C(roster, lineupSize) <= 252, exhaustively evaluates all combos.
 * Otherwise, uses a greedy heuristic.
 */
export function optimizeLineup(
  roster: PlayerProfile[],
  lineupSize: number,
  simulations: number = LINEUP_SIMULATIONS,
): LineupOptimization {
  const n = roster.length;
  const rounds = DEFAULT_ROUNDS;

  if (lineupSize >= n) {
    // Everyone plays
    const indices = Array.from({ length: n }, (_, i) => i);
    const score = simulateTeamScore(roster, indices, rounds, simulations);
    const contributions: Record<string, number> = {};
    for (let i = 0; i < roster.length; i++) {
      const p = roster[i]!;
      contributions[p.playerId] =
        (p.scoringMean + (p.recentForm ?? 0)) * rounds;
    }
    return {
      bestLineup: roster.map((p) => p.playerId),
      expectedTeamScore: Math.round(score * 100) / 100,
      alternatives: [],
      playerContributions: contributions,
    };
  }

  const numCombos = combinationCount(n, lineupSize);

  let bestIndices: number[] = [];
  let bestScore = Infinity;
  const allResults: Array<{ indices: number[]; score: number }> = [];

  if (numCombos <= MAX_EXHAUSTIVE_COMBOS) {
    // Exhaustive search
    const combos = getCombinations(n, lineupSize);
    for (let ci = 0; ci < combos.length; ci++) {
      const combo = combos[ci]!;
      const score = simulateTeamScore(roster, combo, rounds, simulations);
      allResults.push({ indices: combo, score });
      if (score < bestScore) {
        bestScore = score;
        bestIndices = combo;
      }
    }
  } else {
    // Greedy approach: start with best individual, add most-improving player
    const individualScores: Array<{ index: number; expected: number }> = [];
    for (let i = 0; i < n; i++) {
      const p = roster[i]!;
      individualScores.push({
        index: i,
        expected: (p.scoringMean + (p.recentForm ?? 0)) * rounds,
      });
    }
    individualScores.sort((a, b) => a.expected - b.expected);

    const selected: number[] = [individualScores[0]!.index];
    const remaining = new Set<number>();
    for (let i = 1; i < individualScores.length; i++) {
      remaining.add(individualScores[i]!.index);
    }

    while (selected.length < lineupSize) {
      let bestCandidate = -1;
      let bestCandidateScore = Infinity;

      remaining.forEach((candidate) => {
        const trial = [...selected, candidate];
        const score = simulateTeamScore(roster, trial, rounds, simulations);
        if (score < bestCandidateScore) {
          bestCandidateScore = score;
          bestCandidate = candidate;
        }
      });

      selected.push(bestCandidate);
      remaining.delete(bestCandidate);
    }

    bestIndices = selected;
    bestScore = simulateTeamScore(roster, bestIndices, rounds, simulations);
    allResults.push({ indices: [...bestIndices], score: bestScore });

    // Also evaluate a few alternative greedy starts
    for (let start = 1; start < Math.min(3, n); start++) {
      const altSelected: number[] = [individualScores[start]!.index];
      const altRemaining = new Set<number>();
      for (let i = 0; i < n; i++) {
        if (i !== individualScores[start]!.index) {
          altRemaining.add(i);
        }
      }

      while (altSelected.length < lineupSize) {
        let bestC = -1;
        let bestCS = Infinity;
        altRemaining.forEach((c) => {
          const trial = [...altSelected, c];
          const s = simulateTeamScore(roster, trial, rounds, simulations);
          if (s < bestCS) {
            bestCS = s;
            bestC = c;
          }
        });
        altSelected.push(bestC);
        altRemaining.delete(bestC);
      }

      const altScore = simulateTeamScore(
        roster,
        altSelected,
        rounds,
        simulations,
      );
      allResults.push({ indices: [...altSelected], score: altScore });

      if (altScore < bestScore) {
        bestScore = altScore;
        bestIndices = altSelected;
      }
    }
  }

  // Compute player contributions (expected score contribution in the best lineup)
  const contributions: Record<string, number> = {};
  for (let i = 0; i < bestIndices.length; i++) {
    const idx = bestIndices[i]!;
    const p = roster[idx]!;
    contributions[p.playerId] =
      Math.round((p.scoringMean + (p.recentForm ?? 0)) * rounds * 100) / 100;
  }

  // Build alternatives (up to 5, excluding best)
  const bestKey = bestIndices.join(',');
  const alternatives = allResults
    .filter((r) => r.indices.join(',') !== bestKey)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((r) => ({
      lineup: r.indices.map((i) => roster[i]!.playerId),
      expectedScore: Math.round(r.score * 100) / 100,
      scoreDelta: Math.round((r.score - bestScore) * 100) / 100,
    }));

  return {
    bestLineup: bestIndices.map((i) => roster[i]!.playerId),
    expectedTeamScore: Math.round(bestScore * 100) / 100,
    alternatives,
    playerContributions: contributions,
  };
}
