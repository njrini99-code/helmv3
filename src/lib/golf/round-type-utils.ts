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
  if (roundType === 'qualifying') return 'qualifier';
  if (roundType === 'qualifier') return 'qualifier';
  return roundType as 'practice' | 'tournament' | 'qualifier';
}
