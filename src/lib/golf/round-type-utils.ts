/**
 * Round Type Conversion Utilities
 *
 * Frontend and database both use: 'practice', 'tournament', 'qualifier'
 * Legacy database values: 'qualifying' (mapped to 'qualifier')
 */

/**
 * Convert database round type to frontend round type
 * Database has: 'practice', 'qualifier', 'tournament' (legacy: 'qualifying')
 * Frontend uses: 'practice', 'tournament', 'qualifier'
 */
export function roundTypeFromDb(roundType: string): 'practice' | 'tournament' | 'qualifier' {
  if (roundType === 'qualifying' || roundType === 'qualifier') return 'qualifier';
  if (roundType === 'practice' || roundType === 'tournament') return roundType;
  return 'practice'; // fallback for unknown types ('casual', etc.)
}
