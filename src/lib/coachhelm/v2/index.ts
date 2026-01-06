/**
 * CoachHelm V2 Intelligence Engine
 *
 * Main entry point for the V2 intelligence system.
 * Exports all types, modules, and the main orchestrator.
 */

// Types
export * from './types';

// Feature extraction
export * from './features';

// Pattern mining
export * from './mining';

// Prediction engine
export * from './prediction';

// Learning system
export * from './learning';

// Reasoning engine
export * from './reasoning';

// Natural language generation
export * from './nlg';

// Gate (enable/disable)
export {
  isCoachHelmEnabled,
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
  getCoachHelmSettings,
  getTeamCoachHelmSettings,
  enableCoachHelm,
  disableCoachHelm,
  enableTeamCoachHelm,
  disableTeamCoachHelm,
} from './gate';

// Orchestrator
export { CoachHelmIntelligence, coachHelmIntelligence } from './orchestrator';
