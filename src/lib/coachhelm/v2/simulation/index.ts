/**
 * CoachHelm V2 — Monte Carlo Simulation Module
 *
 * Tournament simulation, lineup optimization, and what-if scenario analysis.
 */

export {
  sampleNormal,
  simulateTournament,
  optimizeLineup,
} from './monte-carlo';

export type {
  PlayerProfile,
  TournamentSimulation,
  LineupOptimization,
} from './monte-carlo';

export {
  simulateWhatIf,
  rankImprovementOpportunities,
} from './scenario-engine';

export type {
  WhatIfScenario,
  ImprovementProjection,
} from './scenario-engine';
