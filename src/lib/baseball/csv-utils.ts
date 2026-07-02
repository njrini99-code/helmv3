/**
 * Baseball CSV Parsing and Fuzzy Matching Utilities
 * Separated from server actions for use in both server and client contexts
 */

import type { BaseballImportColumnMapping } from '@/lib/types/baseball-imports';

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
    // Null prototype: header text comes from the uploaded file, so a column
    // named __proto__/constructor must land as a plain own property, never
    // walk the prototype chain (CodeQL js/remote-property-injection).
    const row: CSVRow = Object.create(null);

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
  player_name: ['player', 'name', 'player_name', 'athlete', 'batter', 'hitter', 'pitcher'],
  at_bats: ['ab', 'at_bats', 'atbats', 'at_bat'],
  runs: ['r', 'runs', 'run'],
  hits: ['h', 'hits', 'hit'],
  doubles: ['2b', 'doubles', 'double'],
  triples: ['3b', 'triples', 'triple'],
  home_runs: ['hr', 'home_runs', 'homeruns', 'homers'],
  rbis: ['rbi', 'rbis', 'runs_batted_in'],
  walks: ['bb', 'walks', 'walk', 'base_on_balls'],
  strikeouts: ['so', 'k', 'strikeouts', 'strikeout', 'so'],
  stolen_bases: ['sb', 'stolen_bases', 'steals'],
  caught_stealing: ['cs', 'caught_stealing', 'caught'],
  hit_by_pitch: ['hbp', 'hit_by_pitch', 'hitbypitch', 'hbp'],
  sacrifice_bunts: ['sac', 'sacrifice_bunts', 'sacrificebunts', 'sacbunt'],
  sacrifice_flies: ['sf', 'sacrifice_flies', 'sacrificeflies', 'sacfly'],
  left_on_base: ['lob', 'left_on_base', 'leftonbase'],
  batting_order: ['order', 'batting_order', 'bat_order', 'lineup'],
  // Pitching
  innings_pitched: ['ip', 'innings_pitched', 'inningspitched', 'innings'],
  hits_allowed: ['h', 'hits_allowed', 'ha', 'hits'],
  runs_allowed: ['r', 'runs_allowed', 'ra', 'runs'],
  earned_runs: ['er', 'earned_runs', 'earnedruns'],
  home_runs_allowed: ['hr', 'home_runs_allowed', 'hra', 'hrs_allowed'],
  pitch_count: ['pc', 'pitch_count', 'pitches', 'pitchcount'],
  result: ['result', 'dec', 'decision', 'w_l'],
  // Metrics
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

// ============================================================================
// NAME NORMALIZATION + SOURCE SIGNATURE SCORING (pure helpers — no DB)
//
// These two are consumed by import-matching.ts. They are REAL pure functions
// (string/number math only), not placeholders: deterministic name matching and
// source auto-detection must behave identically on the server preview and in
// any unit test. There is no DB dependency here.
// ============================================================================

/**
 * Canonicalize a person's name for EXACT-equality matching (import-matching's
 * tier-2 exact-roster pass). Lowercases, collapses whitespace, strips
 * punctuation and common generational suffixes (Jr/Sr/II/III/IV), and trims.
 * Returns '' for blank/whitespace input — callers treat '' as "no usable name"
 * (the `if (normSource)` truthiness guard in import-matching).
 */
export function normalizeNameForMatch(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,'-]/g, '')
    .replace(/\b(jr|sr|iii|ii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score how strongly a file's `headers` match a source's `signatureHeaders`
 * (0..1). Used by detectSource() to rank the import registry best-first. Pure:
 * the fraction of signature headers present in the file, matched loosely on a
 * normalized (alphanumeric-only) basis so "Exit Velocity" matches
 * "exit_velocity". Returns 0 when the signature is empty (nothing to match).
 */
export function scoreSourceSignature(
  headers: string[],
  signatureHeaders: readonly string[],
): number {
  if (signatureHeaders.length === 0) return 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedHeaders = headers.map(norm);
  let hits = 0;
  for (const sig of signatureHeaders) {
    const nsig = norm(sig);
    if (nsig === '') continue;
    const found = normalizedHeaders.some(
      (h) => h === nsig || h.includes(nsig) || nsig.includes(h),
    );
    if (found) hits += 1;
  }
  return hits / signatureHeaders.length;
}

// ============================================================================
// COLUMN AUTO-DETECTION + ROW NORMALIZATION (pure — no DB)
// ============================================================================

/**
 * The stat fields the importer knows how to normalize from a CSV. Drives both
 * autoDetectColumnMapping (which header maps to which field) and normalizeStatRow
 * (which fields are parsed to numbers). `player_name` is mapped but never parsed
 * as a number.
 */
const IMPORTABLE_FIELDS: readonly string[] = Object.keys(HEADER_MAPPINGS);

/** Numeric stat fields (everything except the name column). */
const NUMERIC_FIELDS: readonly string[] = IMPORTABLE_FIELDS.filter(
  (f) => f !== 'player_name',
);

/**
 * Auto-map every importable field to the best-matching CSV header. The client
 * may override any entry before commit; unmatched fields are simply absent from
 * the returned mapping. Pure — derives only from the header strings.
 */
export function autoDetectColumnMapping(
  headers: string[],
): BaseballImportColumnMapping {
  const mapping: BaseballImportColumnMapping = {};
  for (const field of IMPORTABLE_FIELDS) {
    const header = findColumnMapping(headers, field);
    if (header) mapping[field] = header;
  }
  return mapping;
}

/**
 * Parse a CSV row into the numeric stat values for the mapped fields. Returns a
 * `Record<field, number | null>` keyed by our canonical field names (not the raw
 * headers). A cell that is blank/absent → null; a cell that cannot be parsed as a
 * finite number → null (the VALIDATE pass separately flags it as unparseable so
 * the bad value is surfaced, never silently committed as 0). Pure — no DB.
 */
export function normalizeStatRow(
  row: CSVRow,
  mapping: BaseballImportColumnMapping,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const field of NUMERIC_FIELDS) {
    const header = mapping[field];
    if (!header) continue;
    const raw = (row[header] ?? '').trim();
    if (raw === '') {
      out[field] = null;
      continue;
    }
    const n = Number(raw);
    out[field] = Number.isFinite(n) ? n : null;
  }
  return out;
}

// ============================================================================
// IMPORT VALIDATION (data_validation_v2.md severity model — pure, no DB)
//
// A 3-tier VALIDATE pass over the auto-matched preview. PURE so the server commit
// gate and the wizard client agree byte-for-byte. It validates only NON-skipped
// rows (no point gating a row we will not write) and never fabricates data — it
// reports exactly the conditions present in the supplied rows/matches.
//
//   - blocking: cannot safely commit (missing name column, unmatched row,
//     unparseable cell, negative count, impossible metric, AB < H integrity);
//   - warning : commit WITH review (unusual-but-possible metric, duplicate-likely);
//   - info    : no action (ignored column, all-zero row).
// ============================================================================

export type ImportSeverity = 'blocking' | 'warning' | 'info';

export type ImportValidationIssueCode =
  | 'no_player_name_column'
  | 'unmatched_row'
  | 'unparseable_value'
  | 'negative_value'
  | 'integrity_ab_lt_h'
  | 'out_of_range'
  | 'unusual_value'
  | 'duplicate_likely'
  | 'ignored_column'
  | 'all_zero_row';

export interface ImportValidationIssue {
  code: ImportValidationIssueCode;
  severity: ImportSeverity;
  /** Human-readable, surfaced verbatim in the wizard issue list. */
  message: string;
  /** 0-based row index, or null for a file-level issue. */
  rowIndex: number | null;
  /** The display label for the row (the source name), when row-scoped. */
  rowLabel?: string | null;
  /** The canonical stat field the issue concerns, when field-scoped. */
  field?: string | null;
}

export interface ImportValidationReport {
  issues: ImportValidationIssue[];
  blockingCount: number;
  warningCount: number;
  infoCount: number;
  /** Distinct 0-based row indices that carry at least one blocking issue. */
  blockingRowIndices: number[];
  hasBlockers: boolean;
  hasWarnings: boolean;
}

/** A single match decision the wizard/server passes into the validator. */
export interface ImportValidationMatch {
  rowIndex: number;
  playerId: string | null;
  action: 'create' | 'update' | 'skip';
  sourceName: string;
}

export interface ValidateImportRowsArgs {
  rows: CSVRow[];
  mapping: BaseballImportColumnMapping;
  matches: ImportValidationMatch[];
  headers: string[];
}

/**
 * Plausibility bands per numeric stat field. `softMin/softMax` bound the
 * USUAL range (outside → warning); `hardMin/hardMax` bound the POSSIBLE range
 * (outside → blocking, the value is physically impossible). Count fields use
 * only a hardMin of 0 (negatives block) and no upper bound. Metric fields
 * (exit velo, launch angle) carry both bands.
 */
const METRIC_BANDS: Record<
  string,
  { softMin?: number; softMax?: number; hardMin?: number; hardMax?: number }
> = {
  exit_velocity: { softMin: 40, softMax: 122, hardMin: 0, hardMax: 130 },
  launch_angle: { softMin: -40, softMax: 60, hardMin: -90, hardMax: 90 },
};

/** Count fields cannot be negative (hard floor 0); no sane upper bound. */
function isNegativeBlockingField(field: string): boolean {
  return NUMERIC_FIELDS.includes(field) && !(field in METRIC_BANDS);
}

/**
 * Run the 3-tier VALIDATE pass. Pure: deterministic over its inputs, no DB, no
 * I/O. See the file-level comment for the severity model.
 *
 * The SOURCE of `rows`/`mapping`/`matches` is wired in the DB pass
 * (loadRosterPlayers + matchRows in imports.ts); this validator itself stays
 * pure and DB-free by design.
 */
export function validateImportRows(
  args: ValidateImportRowsArgs,
): ImportValidationReport {
  const { rows, mapping, matches, headers } = args;
  const issues: ImportValidationIssue[] = [];

  // ---- FILE-LEVEL: a player-name column must be mapped --------------------
  const nameHeader = mapping.player_name;
  if (!nameHeader) {
    issues.push({
      code: 'no_player_name_column',
      severity: 'blocking',
      message:
        'No player-name column is mapped. Map a column to “Player name” before importing.',
      rowIndex: null,
      field: 'player_name',
    });
  }

  // ---- FILE-LEVEL: headers present in the file but mapped to nothing -------
  const mappedHeaders = new Set(
    Object.values(mapping).filter((h): h is string => !!h),
  );
  for (const header of headers) {
    if (!mappedHeaders.has(header)) {
      issues.push({
        code: 'ignored_column',
        severity: 'info',
        message: `Column “${header}” is not mapped to a stat and will be ignored.`,
        rowIndex: null,
        field: null,
      });
    }
  }

  // ---- ROW-LEVEL ----------------------------------------------------------
  const matchByRow = new Map<number, ImportValidationMatch>();
  for (const m of matches) matchByRow.set(m.rowIndex, m);

  // duplicate_likely: same resolved player + same action seen twice in one file.
  const seenPlayerAction = new Map<string, number>();

  rows.forEach((row, rowIndex) => {
    const match = matchByRow.get(rowIndex);
    // No match decision OR an explicit skip → do not validate (we won't write it).
    if (!match || match.action === 'skip') return;

    const rowLabel = match.sourceName || null;

    // Unmatched but not skipped → blocking (it would write nothing meaningful).
    if (!match.playerId) {
      issues.push({
        code: 'unmatched_row',
        severity: 'blocking',
        message: `Row ${rowIndex + 1} (“${match.sourceName || '—'}”) is not matched to a player. Match it or set it to Skip.`,
        rowIndex,
        rowLabel,
      });
    } else {
      const key = `${match.playerId}:${match.action}`;
      const prior = seenPlayerAction.get(key);
      if (prior != null) {
        issues.push({
          code: 'duplicate_likely',
          severity: 'warning',
          message: `Row ${rowIndex + 1} repeats the same player and action as row ${prior + 1}. Confirm this is not a duplicate.`,
          rowIndex,
          rowLabel,
        });
      } else {
        seenPlayerAction.set(key, rowIndex);
      }
    }

    // Per-field numeric validation.
    let ab: number | null = null;
    let h: number | null = null;
    let allZero = true;
    let sawNumeric = false;

    for (const field of NUMERIC_FIELDS) {
      const header = mapping[field];
      if (!header) continue;
      const raw = (row[header] ?? '').trim();
      if (raw === '') continue;

      const n = Number(raw);
      if (!Number.isFinite(n)) {
        issues.push({
          code: 'unparseable_value',
          severity: 'blocking',
          message: `Row ${rowIndex + 1}: “${raw}” in ${field.replace(/_/g, ' ')} is not a number.`,
          rowIndex,
          rowLabel,
          field,
        });
        continue;
      }

      sawNumeric = true;
      if (n !== 0) allZero = false;
      if (field === 'at_bats') ab = n;
      if (field === 'hits') h = n;

      const band = METRIC_BANDS[field];
      if (band) {
        // Impossible (hard band) → blocking.
        if (
          (band.hardMin != null && n < band.hardMin) ||
          (band.hardMax != null && n > band.hardMax)
        ) {
          issues.push({
            code: 'out_of_range',
            severity: 'blocking',
            message: `Row ${rowIndex + 1}: ${field.replace(/_/g, ' ')} of ${n} is outside the possible range.`,
            rowIndex,
            rowLabel,
            field,
          });
        } else if (
          (band.softMin != null && n < band.softMin) ||
          (band.softMax != null && n > band.softMax)
        ) {
          // Unusual but possible → warning.
          issues.push({
            code: 'unusual_value',
            severity: 'warning',
            message: `Row ${rowIndex + 1}: ${field.replace(/_/g, ' ')} of ${n} is unusual — double-check it.`,
            rowIndex,
            rowLabel,
            field,
          });
        }
      } else if (isNegativeBlockingField(field) && n < 0) {
        // Count field cannot be negative → blocking.
        issues.push({
          code: 'negative_value',
          severity: 'blocking',
          message: `Row ${rowIndex + 1}: ${field.replace(/_/g, ' ')} cannot be negative (${n}).`,
          rowIndex,
          rowLabel,
          field,
        });
      }
    }

    // Integrity: hits cannot exceed at-bats.
    if (ab != null && h != null && h > ab) {
      issues.push({
        code: 'integrity_ab_lt_h',
        severity: 'blocking',
        message: `Row ${rowIndex + 1}: hits (${h}) exceed at-bats (${ab}).`,
        rowIndex,
        rowLabel,
        field: 'hits',
      });
    }

    // All-zero stat row → info (probably a roster line with no stats).
    if (sawNumeric && allZero) {
      issues.push({
        code: 'all_zero_row',
        severity: 'info',
        message: `Row ${rowIndex + 1} has all-zero stats — confirm it should be imported.`,
        rowIndex,
        rowLabel,
      });
    }
  });

  const blockingRowIndices = Array.from(
    new Set(
      issues
        .filter((i) => i.severity === 'blocking' && i.rowIndex != null)
        .map((i) => i.rowIndex as number),
    ),
  );
  const blockingCount = issues.filter((i) => i.severity === 'blocking').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    issues,
    blockingCount,
    warningCount,
    infoCount,
    blockingRowIndices,
    hasBlockers: blockingCount > 0,
    hasWarnings: warningCount > 0,
  };
}
