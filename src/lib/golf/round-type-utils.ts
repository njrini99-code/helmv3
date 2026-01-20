/**
 * Round Type Conversion Utilities
 * 
 * Frontend uses: 'practice', 'tournament', 'qualifier'
 * Database expects: 'practice', 'qualifier', 'tournament'
 */

/**
 * Convert frontend round type to database round type
 * Frontend uses: 'practice', 'tournament', 'qualifier'
 * Database expects: 'practice', 'qualifier', 'tournament'
 */
export function roundTypeToDb(roundType: 'practice' | 'tournament' | 'qualifier'): 'practice' | 'qualifier' | 'tournament' {
  return roundType === 'qualifier' ? 'qualifier' : roundType;
}

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
