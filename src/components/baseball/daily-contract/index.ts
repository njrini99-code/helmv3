// =============================================================================
// src/components/baseball/daily-contract/index.ts
//
// Public surface of the V5 Player Daily Contract — the daily commitment loop
// that compounds into the Passport development story.
//
// NOTE: CoachDailyContracts and CoachPlayerDailyContractPanel have been
// relocated to src/components/baseball/coach-daily-contract/ (gap #9 — they
// are staff-facing surfaces and do not belong alongside the player mechanic).
// They are re-exported here for backward compatibility; new imports should
// prefer the canonical coach-daily-contract/ barrel.
// =============================================================================

export { DailyContract } from './DailyContract';
// Backward-compat re-exports — canonical home is now coach-daily-contract/.
export { CoachDailyContracts } from '../coach-daily-contract/CoachDailyContracts';
export { CoachPlayerDailyContractPanel } from '../coach-daily-contract/CoachPlayerDailyContractPanel';
