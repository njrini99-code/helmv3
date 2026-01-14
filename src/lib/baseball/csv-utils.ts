/**
 * Baseball CSV Parsing and Fuzzy Matching Utilities
 * Separated from server actions for use in both server and client contexts
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CSVRow {
  [key: string]: string;
}

export interface PlayerMatch {
  csvName: string;
  playerId: string | null;
  playerName: string | null;
  confidence: number;
  isManualMatch: boolean;
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Normalize name for comparison (lowercase, remove extra spaces, handle common variations)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,'-]/g, '')
    .replace(/\bjr\b|\bsr\b|\biii\b|\bii\b|\biv\b/gi, '');
}

/**
 * Calculate similarity score between two names (0-1, higher is better)
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Split into parts and check for matching components
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');

  // Check last name match (most important)
  const lastName1 = parts1[parts1.length - 1];
  const lastName2 = parts2[parts2.length - 1];

  if (lastName1 === lastName2) {
    // Last names match, check first names
    const firstName1 = parts1[0];
    const firstName2 = parts2[0];

    if (firstName1 === firstName2) return 0.95;
    if (firstName1?.[0] === firstName2?.[0]) return 0.85; // First initial matches
    return 0.7; // Same last name, different first name
  }

  // Levenshtein-based similarity
  const maxLen = Math.max(n1.length, n2.length);
  const distance = levenshteinDistance(n1, n2);
  const similarity = 1 - distance / maxLen;

  return similarity;
}

/**
 * Find best matching player for a given name
 */
export function findBestPlayerMatch(
  csvName: string,
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>
): PlayerMatch {
  let bestMatch: PlayerMatch = {
    csvName,
    playerId: null,
    playerName: null,
    confidence: 0,
    isManualMatch: false,
  };

  for (const player of players) {
    const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    const similarity = calculateNameSimilarity(csvName, fullName);

    if (similarity > bestMatch.confidence) {
      bestMatch = {
        csvName,
        playerId: player.id,
        playerName: fullName,
        confidence: similarity,
        isManualMatch: false,
      };
    }

    // Also try last name, first name format
    const reversedName = `${player.last_name || ''} ${player.first_name || ''}`.trim();
    const reversedSimilarity = calculateNameSimilarity(csvName, reversedName);

    if (reversedSimilarity > bestMatch.confidence) {
      bestMatch = {
        csvName,
        playerId: player.id,
        playerName: fullName,
        confidence: reversedSimilarity,
        isManualMatch: false,
      };
    }
  }

  return bestMatch;
}

// ============================================================================
// CSV PARSING
// ============================================================================

/**
 * Parse CSV content into rows
 */
export function parseCSV(content: string): CSVRow[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split(',').map(v => v.trim());
    const row: CSVRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Map CSV headers to our stat fields
 */
export const HEADER_MAPPINGS: Record<string, string[]> = {
  player_name: ['player', 'name', 'player_name', 'athlete', 'batter', 'hitter'],
  at_bats: ['ab', 'at_bats', 'atbats', 'at_bat'],
  hits: ['h', 'hits', 'hit'],
  doubles: ['2b', 'doubles', 'double'],
  triples: ['3b', 'triples', 'triple'],
  home_runs: ['hr', 'home_runs', 'homeruns', 'homers'],
  rbis: ['rbi', 'rbis', 'runs_batted_in'],
  walks: ['bb', 'walks', 'walk', 'base_on_balls'],
  strikeouts: ['so', 'k', 'strikeouts', 'strikeout'],
  stolen_bases: ['sb', 'stolen_bases', 'steals'],
  exit_velocity: ['ev', 'exit_velocity', 'exit_velo', 'exit_speed'],
  launch_angle: ['la', 'launch_angle', 'launch'],
};

/**
 * Find the CSV column header that maps to our field
 */
export function findColumnMapping(headers: string[], field: string): string | null {
  const fieldMappings = HEADER_MAPPINGS[field] || [field];

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const mapping of fieldMappings) {
      if (normalized.includes(mapping) || mapping.includes(normalized)) {
        return header;
      }
    }
  }

  return null;
}
