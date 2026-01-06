/**
 * Round Type Conversion Utilities
 * 
 * Frontend uses: 'practice', 'tournament', 'qualifier'
 * Database expects: 'practice', 'qualifying', 'tournament'
 */

/**
 * Convert frontend round type to database round type
 * Frontend uses: 'practice', 'tournament', 'qualifier'
 * Database expects: 'practice', 'qualifying', 'tournament'
 */
export function roundTypeToDb(roundType: 'practice' | 'tournament' | 'qualifier'): 'practice' | 'qualifying' | 'tournament' {
  return roundType === 'qualifier' ? 'qualifying' : roundType;
}

/**
 * Convert database round type to frontend round type
 * Database has: 'practice', 'qualifying', 'tournament'
 * Frontend uses: 'practice', 'tournament', 'qualifier'
 */
export function roundTypeFromDb(roundType: string): 'practice' | 'tournament' | 'qualifier' {
  return roundType === 'qualifying' ? 'qualifier' : roundType as 'practice' | 'tournament' | 'qualifier';
}
