/**
 * Dependency-free roster constants.
 *
 * POSITIONS must NOT live in RosterFairway.tsx: RosterFairway imports
 * RosterMemberActions, and RosterMemberActions spreads POSITIONS into a
 * module-scope options array — with the constant defined in RosterFairway
 * that was a runtime import cycle whose evaluation order the bundler can
 * flip between builds. Observed live 2026-07-11 as the prod TDZ crash
 * "Cannot access 'X' before initialization" on /baseball/dashboard/roster
 * (and via prefetch on /command-center) after a deploy that changed no
 * baseball code, only the chunk graph.
 */
export const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'LHP', 'RHP', 'UTL'];
