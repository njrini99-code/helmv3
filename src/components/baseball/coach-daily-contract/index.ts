// =============================================================================
// src/components/baseball/coach-daily-contract/index.ts
//
// Coach-side Daily Contract surface barrel.
//
// These two components were relocated from src/components/baseball/daily-contract/
// where they co-existed alongside the player-facing DailyContract mechanic.
// The move clarifies the coach/player boundary — the daily-contract/ directory
// now exclusively owns the player-facing commitment loop, and coach-daily-contract/
// owns the staff read/acknowledge surface.
//
// The old daily-contract/index.ts still re-exports both names for backward
// compatibility; new imports should prefer this canonical location.
// =============================================================================

export { CoachDailyContracts } from './CoachDailyContracts';
export { CoachPlayerDailyContractPanel } from './CoachPlayerDailyContractPanel';
